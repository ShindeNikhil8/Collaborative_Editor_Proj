import WebSocket from "ws";
import { randomUUID } from "crypto";
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
import {
  loadOutbox,
  upsertOutbox,
  removeOutbox,
  type PendingOutboxMsg,
} from "../store/outboxStore";

type MsgStatus = "queued" | "sent" | "delivered" | "failed";

export function createWsClient(peerManager: PeerManager) {
  const connecting = new Set<string>(); // by ip
  const pendingByMsgId = new Map<string, PendingOutboxMsg>();
  for (const m of loadOutbox()) pendingByMsgId.set(m.msgId, m);

  // public group tracking: groupId -> { total, deliveredCount }
  const groupProgress = new Map<string, { total: number; delivered: number }>();

  function emitStatus(e: {
    msgId: string;
    status: MsgStatus;
    toUserId: string;
    scope: "DM" | "PUBLIC";
    groupId?: string;
    delivered?: number;
    total?: number;
  }) {
    peerManager.emitToUI("msg:status", e);
  }

  async function connectToPeer(ip: string, port = 3002) {
    const trimmed = ip.trim();
    if (!trimmed) throw new Error("IP is required");
    if (connecting.has(trimmed)) return;

    const profile = getProfile();
    if (!profile) throw new Error("You must register before connecting.");

    connecting.add(trimmed);

    const url = `ws://${trimmed}:${port}`;
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

        // ✅ ACK = delivered
        if (msg.type === "ACK") {
          const payload = msg.payload as AckPayload;
          const ackId = payload?.ackMsgId;
          if (!ackId) return;

          const pending = pendingByMsgId.get(ackId);
          pendingByMsgId.delete(ackId);
          removeOutbox(ackId);

          if (pending) {
            emitStatus({
              msgId: pending.msgId,
              status: "delivered",
              toUserId: pending.toUserId,
              scope: pending.payload.scope,
              groupId: pending.groupId,
            });

            // update public progress
            if (pending.groupId) {
              const g = groupProgress.get(pending.groupId);
              if (g) {
                g.delivered += 1;
                emitStatus({
                  msgId: pending.groupId,
                  status: g.delivered >= g.total ? "delivered" : "sent",
                  toUserId: "PUBLIC",
                  scope: "PUBLIC",
                  groupId: pending.groupId,
                  delivered: g.delivered,
                  total: g.total,
                });
              }
            }
          }
          return;
        }
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      connecting.delete(trimmed);
      if (remote?.userId) {
        peerManager.markOffline(remote.userId);
        peerManager.removeSocket(remote.userId);
      }
    });

    ws.on("error", () => {
      connecting.delete(trimmed);
    });
  }

  // -------- Reliable sending --------

  async function sendReliableToUser(toUserId: string, payload: MsgPayload, groupId?: string) {
    const profile = getProfile();
    if (!profile) throw new Error("Register first.");

    const from = profileToIdentity(profile);

    const peer = peerManager.getPeer(toUserId);
    if (!peer) throw new Error("Unknown peer.");

    const toIp = peer.ip;
    const msgId = randomUUID();

    const pending: PendingOutboxMsg = {
      msgId,
      ts: Date.now(),
      toUserId,
      toIp,
      from,
      payload,
      groupId,
      attempts: 0,
    };

    pendingByMsgId.set(msgId, pending);
    upsertOutbox(pending);

    emitStatus({ msgId, status: "queued", toUserId, scope: payload.scope, groupId });

    connectToPeer(toIp).catch(() => {});
    trySendPending(msgId);

    // important: handshake delay retries
    setTimeout(() => trySendPending(msgId), 800);
    setTimeout(() => trySendPending(msgId), 2000);

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

      emitStatus({
        msgId: p.groupId ?? p.msgId,
        status: "sent",
        toUserId: p.toUserId,
        scope: p.payload.scope,
        groupId: p.groupId,
      });
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

      if (m.attempts >= 20) {
        // fail permanently
        pendingByMsgId.delete(m.msgId);
        removeOutbox(m.msgId);
        emitStatus({
          msgId: m.groupId ?? m.msgId,
          status: "failed",
          toUserId: m.toUserId,
          scope: m.payload.scope,
          groupId: m.groupId,
        });
        continue;
      }

      if (now - last > 5_000) {
        trySendPending(m.msgId);
      }
    }
  }, 5_000);

  // -------- Public + DM APIs --------

  async function sendDM(toUserId: string, text: string) {
    return sendReliableToUser(toUserId, {
      kind: "CHAT",
      text,
      scope: "DM",
      toUserId,
    });
  }

  async function sendPublic(text: string) {
    const profile = getProfile();
    if (!profile) throw new Error("Register first.");

    const me = profileToIdentity(profile);

    // send to all known peers except me
    const peers = peerManager.getAllPeerIdentities().filter((p) => p.userId !== me.userId);

    const groupId = `public-${randomUUID()}`;

    groupProgress.set(groupId, { total: peers.length, delivered: 0 });

    // UI status seed for public
    emitStatus({
      msgId: groupId,
      status: "queued",
      toUserId: "PUBLIC",
      scope: "PUBLIC",
      groupId,
      delivered: 0,
      total: peers.length,
    });

    // send reliable to each peer
    for (const p of peers) {
      await sendReliableToUser(
        p.userId,
        {
          kind: "CHAT",
          text,
          scope: "PUBLIC",
          groupId,
        },
        groupId
      );
    }

    return groupId;
  }

  return { connectToPeer, sendDM, sendPublic };
}