import WebSocket from "ws";
import { randomUUID } from "crypto";
import { getProfile } from "../store/profileStore";
import type { PeerManager } from "./peerManager";
import type { WsEnvelope, HelloPayload, PeersPayload, PeerIdentity, MsgPayload, AckPayload } from "./protocol";
import { profileToIdentity } from "./protocol";
import { loadOutbox, upsertOutbox, removeOutbox, type PendingOutboxMsg } from "../store/outboxStore";

export function createWsClient(peerManager: PeerManager) {
  const connecting = new Set<string>(); // by ip

  // pending msgs (disk -> memory)
  const pendingByMsgId = new Map<string, PendingOutboxMsg>();
  for (const m of loadOutbox()) pendingByMsgId.set(m.msgId, m);

  async function connectToPeer(ip: string, port = 3002) {
    const trimmed = ip.trim();
    if (!trimmed) throw new Error("IP is required");
    if (connecting.has(trimmed)) return;

    const profile = getProfile();
    if (!profile) throw new Error("You must register before connecting.");

    connecting.add(trimmed);

    const url = `ws://${trimmed}:${port}`;
    console.log("[WS-CLIENT] connecting to", url);

    const ws = new WebSocket(url);
    let remote: PeerIdentity | null = null;

    ws.on("open", () => {
      const hello: WsEnvelope<HelloPayload> = {
        type: "HELLO",
        msgId: randomUUID(),
        ts: Date.now(),
        from: profileToIdentity(profile),
        payload: { app: "DistributedEditor", version: "0.0.1" },
      };
      ws.send(JSON.stringify(hello));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsEnvelope<any>;

        if (msg.type === "HELLO_ACK") {
  remote = msg.from as PeerIdentity;

  connecting.delete(trimmed); // ✅ IMPORTANT

  peerManager.setSocket(remote.userId, ws as any);
  peerManager.upsertPeer(remote, { status: "online", lastSeen: Date.now() });

  // ... your existing peers exchange ...

  // migrate pending by IP
  for (const m of pendingByMsgId.values()) {
    if (m.toIp === remote.ip && m.toUserId !== remote.userId) {
      const updated = { ...m, toUserId: remote.userId };
      pendingByMsgId.set(m.msgId, updated);
      upsertOutbox(updated);
    }
  }

  flushPendingToUser(remote.userId);
  return;
}

        

        if (msg.type === "PING") {
          const prof = getProfile();
          if (!prof) return;

          ws.send(
            JSON.stringify({
              type: "PONG",
              msgId: randomUUID(),
              ts: Date.now(),
              from: profileToIdentity(prof),
              payload: {},
            })
          );
          return;
        }

        if (msg.type === "PONG") {
          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
          return;
        }

        if (msg.type === "PEERS") {
          const prof = getProfile();
          if (!prof) return;

          const me = profileToIdentity(prof);
          const list = (msg.payload?.peers ?? []) as PeerIdentity[];

          for (const p of list) {
            if (!p?.userId || !p?.ip || !p?.name) continue;
            if (p.userId === me.userId) continue;

            peerManager.upsertPeer(p, { lastSeen: Date.now(), discoveredVia: msg.from });
            connectToPeer(p.ip).catch(() => {});
          }
          return;
        }

        if (msg.type === "ACK") {
          const payload = msg.payload as AckPayload;
          if (payload?.ackMsgId) {
            pendingByMsgId.delete(payload.ackMsgId);
            removeOutbox(payload.ackMsgId);
          }
          return;
        }
      } catch (e) {
        console.log("[WS-CLIENT] invalid message:", e);
      }
    });

    ws.on("close", () => {
      connecting.delete(trimmed);
      if (remote?.userId) {
        peerManager.markOffline(remote.userId);
        peerManager.removeSocket(remote.userId);
      }
    });

    ws.on("error", (err) => {
      console.log("[WS-CLIENT] error", url, err);
      connecting.delete(trimmed);
    });
  }

  // ✅ reliable send (queues if offline)
  async function sendReliable(toUserId: string, toIp: string, payload: MsgPayload, forcedMsgId?: string) {
    const profile = getProfile();
    if (!profile) throw new Error("You must register before sending.");

    const from = profileToIdentity(profile);
    const msgId = forcedMsgId ?? randomUUID();

    const pending: PendingOutboxMsg = {
      msgId,
      ts: Date.now(),
      toUserId,
      toIp,
      from,
      payload,
      attempts: 0,
    };

    pendingByMsgId.set(msgId, pending);
    upsertOutbox(pending);

    // ensure connection attempt
    connectToPeer(toIp).catch(() => {});

    // try now
    trySendPending(msgId);
    return msgId;
  }

  function trySendPending(msgId: string) {
    const p = pendingByMsgId.get(msgId);
    if (!p) return;

    const socket = peerManager.getSocket(p.toUserId);
    if (!socket || (socket as any).readyState !== 1) return;

    const env: WsEnvelope<MsgPayload> = {
      type: "MSG",
      msgId: p.msgId,
      ts: p.ts,
      from: p.from,
      payload: p.payload,
    };

    try {
      socket.send(JSON.stringify(env));
      const updated: PendingOutboxMsg = {
        ...p,
        attempts: p.attempts + 1,
        lastAttemptAt: Date.now(),
      };
      pendingByMsgId.set(msgId, updated);
      upsertOutbox(updated);
    } catch {
      // retry later
    }
  }

  function flushPendingToUser(userId: string) {
    for (const m of pendingByMsgId.values()) {
      if (m.toUserId === userId) trySendPending(m.msgId);
    }
  }

  // retry loop
  setInterval(() => {
    const now = Date.now();
    for (const m of pendingByMsgId.values()) {
      const last = m.lastAttemptAt ?? 0;
      if (m.attempts < 25 && now - last > 4_000) {
        trySendPending(m.msgId);
      }
    }
  }, 4_000);

  async function sendDM(toUserId: string, text: string) {
    const peer = peerManager.getPeerIdentity(toUserId);
    if (!peer) throw new Error("Unknown peer");
    const msgId = randomUUID();

    await sendReliable(
      toUserId,
      peer.ip,
      { kind: "CHAT", text, scope: "DM", toUserId },
      msgId
    );

    return msgId;
  }

  async function sendPublic(text: string) {
    const profile = getProfile();
    if (!profile) throw new Error("You must register before sending.");

    const me = profileToIdentity(profile);
    const groupId = randomUUID();

    const peers = peerManager.getPeersSnapshot();
    for (const p of peers) {
      if (p.userId === me.userId) continue;
      sendReliable(p.userId, p.ip, { kind: "CHAT", text, scope: "PUBLIC", groupId }).catch(() => {});
    }

    return groupId;
  }

  return { connectToPeer, sendDM, sendPublic };
}