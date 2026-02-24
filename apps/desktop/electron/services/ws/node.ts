import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import type WebSocket from "ws";
import { getProfile } from "../store/profileStore";
import type { PeerManager } from "./peerManager";
import { profileToIdentity } from "./protocol";
import type {
  WsEnvelope,
  HelloAckPayload,
  PeersPayload,
  PeersAckPayload,
  PeerIdentity,
  MsgPayload,
  AckPayload,
} from "./protocol";
import { appendChatMessage } from "../store/chatStore";

type StartNodeArgs = {
  port: number;
  peerManager: PeerManager;
  wsClient: { connectToPeer: (ip: string, port?: number) => Promise<void> };
};

export function startWsNode({ port, peerManager, wsClient }: StartNodeArgs) {
  const wss = new WebSocketServer({ port });

  const seenMsgIds = new Set<string>();

  wss.on("listening", () => {
    console.log(`[WS] Node listening on ws://localhost:${port}`);
  });

  wss.on("connection", (socket, req) => {
    console.log("[WS] incoming connection from", req.socket.remoteAddress);

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsEnvelope<any>;

        if (msg.type === "HELLO") {
          const profile = getProfile();
          if (!profile) {
            socket.close();
            return;
          }

          const me = profileToIdentity(profile);

          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
          peerManager.setSocket(msg.from.userId, socket as WebSocket);

          const reply: WsEnvelope<HelloAckPayload> = {
            type: "HELLO_ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { accepted: true },
          };
          socket.send(JSON.stringify(reply));

          const myPeers = peerManager.getAllPeerIdentities();
          const peersMsg: WsEnvelope<PeersPayload> = {
            type: "PEERS",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { peers: [me, ...myPeers] },
          };
          socket.send(JSON.stringify(peersMsg));
          return;
        }

        if (msg.type === "PING") {
          const profile = getProfile();
          if (!profile) return;

          socket.send(
            JSON.stringify({
              type: "PONG",
              msgId: randomUUID(),
              ts: Date.now(),
              from: profileToIdentity(profile),
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
          const profile = getProfile();
          if (!profile) return;

          const me = profileToIdentity(profile);
          const list = (msg.payload?.peers ?? []) as PeerIdentity[];

          for (const p of list) {
            if (!p?.userId || !p?.ip || !p?.name) continue;
            if (p.userId === me.userId) continue;

            peerManager.upsertPeer(p, { lastSeen: Date.now(), discoveredVia: msg.from });
            wsClient.connectToPeer(p.ip).catch(() => {});
          }

          const ack: WsEnvelope<PeersAckPayload> = {
            type: "PEERS_ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { received: list.length },
          };
          socket.send(JSON.stringify(ack));

          peerManager.broadcastPeers(list, me, msg.from.userId);
          return;
        }

        if (msg.type === "MSG") {
          const profile = getProfile();
          if (!profile) return;

          const me = profileToIdentity(profile);

          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });

          const payload = msg.payload as MsgPayload;

          // DM safety: accept only if addressed to me
          if (payload.scope === "DM" && payload.toUserId && payload.toUserId !== me.userId) {
            const ackIgnore: WsEnvelope<AckPayload> = {
              type: "ACK",
              msgId: randomUUID(),
              ts: Date.now(),
              from: me,
              payload: { ackMsgId: msg.msgId },
            };
            socket.send(JSON.stringify(ackIgnore));
            return;
          }

          if (!seenMsgIds.has(msg.msgId)) {
            seenMsgIds.add(msg.msgId);

            appendChatMessage({
              msgId: msg.msgId,
              ts: msg.ts ?? Date.now(),
              from: msg.from,
              payload,
              direction: "in",
            });

            peerManager.emitToUI("msg:received", {
              msgId: msg.msgId,
              ts: msg.ts ?? Date.now(),
              from: msg.from,
              payload,
            });
          }

          const ack: WsEnvelope<AckPayload> = {
            type: "ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { ackMsgId: msg.msgId },
          };
          socket.send(JSON.stringify(ack));
          return;
        }
      } catch (e) {
        console.log("[WS] invalid message:", e);
      }
    });

    socket.on("close", () => {
      const uid = peerManager.removeSocketBySocket(socket as WebSocket);
      if (uid) peerManager.markOffline(uid);
    });
  });
}