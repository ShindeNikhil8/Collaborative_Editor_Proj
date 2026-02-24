import WebSocket from "ws";
import { getProfile } from "../store/profileStore";
import type { PeerManager } from "./peerManager";
import type {
  WsEnvelope,
  HelloPayload,
  PeersPayload,
  PeerIdentity,
  MsgPayload,
  AckPayload,
} from "./protocol";
import { profileToIdentity } from "./protocol";
import { randomUUID } from "crypto";
import { loadOutbox, upsertOutbox, removeOutbox, type PendingOutboxMsg } from "../store/outboxStore";

export function createWsClient(peerManager: PeerManager) {
  const connecting = new Set<string>(); // by ip

  // in-memory cache of pending msgs (loaded from disk on start)
  const pendingByMsgId = new Map<string, PendingOutboxMsg>();
  for (const m of loadOutbox()) pendingByMsgId.set(m.msgId, m);

  async function connectToPeer(ip: string, port = 3002) {
    const trimmed = ip.trim();
    if (!trimmed) throw new Error("IP is required");
    if (connecting.has(trimmed)) return;

    const profile = getProfile();
    if (!profile) throw new Error("You must register before connecting to peers.");

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
          peerManager.setSocket(remote.userId, ws as any);
          peerManager.upsertPeer(remote, { status: "online", lastSeen: Date.now() });
          console.log("[WS-CLIENT] HELLO_ACK from", remote.name, remote.ip);

          // Send my known peers including myself
          const me = profileToIdentity(profile);
          const known = peerManager.getAllPeerIdentities();

          const peersMsg: WsEnvelope<PeersPayload> = {
            type: "PEERS",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { peers: [me, ...known] },
          };
          ws.send(JSON.stringify(peersMsg));

          // ✅ When a peer becomes online, flush pending messages to them
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

        // ✅ Reliable ACK handling
        if (msg.type === "ACK") {
          const payload = msg.payload as AckPayload;
          if (payload?.ackMsgId) {
            pendingByMsgId.delete(payload.ackMsgId);
            removeOutbox(payload.ackMsgId);
            // console.log("[RELIABLE] ACK received for", payload.ackMsgId);
          }
          return;
        }

        // Receiving MSG is handled in node.ts (incoming server side)
      } catch (e) {
        console.log("[WS-CLIENT] invalid message:", e);
      }
    });

    ws.on("close", () => {
      console.log("[WS-CLIENT] closed", url);
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

  // ✅ send reliable msg to a known peer (queues if no socket)
  async function sendReliable(toUserId: string, toIp: string, payload: MsgPayload) {
    const profile = getProfile();
    if (!profile) throw new Error("You must register before sending messages.");

    const from = profileToIdentity(profile);

    const msgId = randomUUID();
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

    // Ensure connection exists
    connectToPeer(toIp).catch(() => {});

    // Try send immediately
    trySendPending(msgId);
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
      // ignore, will retry later
    }
  }

  function flushPendingToUser(userId: string) {
    for (const m of pendingByMsgId.values()) {
      if (m.toUserId === userId) {
        trySendPending(m.msgId);
      }
    }
  }

  // ✅ Retry loop (every 5 sec): resend pending msgs that aren't ACKed
  setInterval(() => {
    const now = Date.now();
    for (const m of pendingByMsgId.values()) {
      const last = m.lastAttemptAt ?? 0;
      // resend if last attempt > 5s ago, and max 20 attempts
      if (m.attempts < 20 && now - last > 5_000) {
        trySendPending(m.msgId);
      }
    }
  }, 5_000);

  return { connectToPeer, sendReliable };
}