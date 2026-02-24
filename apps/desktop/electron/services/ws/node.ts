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

type StartNodeArgs = {
  port: number;
  peerManager: PeerManager;
  wsClient: { connectToPeer: (ip: string, port?: number) => Promise<void> };
};

export function startWsNode({ port, peerManager, wsClient }: StartNodeArgs) {
  const wss = new WebSocketServer({ port });

  // ✅ De-dup cache: prevents showing the same message again if sender retries
  const seenMsgIds = new Set<string>();

  wss.on("listening", () => {
    console.log(`[WS] Node listening on ws://localhost:${port}`);
  });

  wss.on("connection", (socket, req) => {
    console.log("[WS] incoming connection from", req.socket.remoteAddress);

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsEnvelope<any>;

        // -------------------------
        // HELLO handshake
        // -------------------------
        if (msg.type === "HELLO") {
          const profile = getProfile();
          if (!profile) {
            console.log("[WS] Reject: local profile not set");
            socket.close();
            return;
          }

          const me = profileToIdentity(profile);

          // Save peer identity + mark online
          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });

          // Map this socket to that userId
          peerManager.setSocket(msg.from.userId, socket as WebSocket);

          // Reply HELLO_ACK
          const reply: WsEnvelope<HelloAckPayload> = {
            type: "HELLO_ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { accepted: true },
          };

          socket.send(JSON.stringify(reply));

          // Immediately share my known peers list
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

        // -------------------------
        // PING/PONG presence
        // -------------------------
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

        // -------------------------
        // PEERS gossip
        // -------------------------
        if (msg.type === "PEERS") {
          const profile = getProfile();
          if (!profile) return;

          const me = profileToIdentity(profile);
          const list = (msg.payload?.peers ?? []) as PeerIdentity[];

          for (const p of list) {
            if (!p?.userId || !p?.ip || !p?.name) continue;
            if (p.userId === me.userId) continue;

            peerManager.upsertPeer(p, { lastSeen: Date.now(), discoveredVia: msg.from });

            // auto-connect to discovered peers
            wsClient.connectToPeer(p.ip).catch(() => {});
          }

          // ACK for peers list (optional)
          const ack: WsEnvelope<PeersAckPayload> = {
            type: "PEERS_ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: me,
            payload: { received: list.length },
          };
          socket.send(JSON.stringify(ack));

          // forward to everyone else
          peerManager.broadcastPeers(list, me, msg.from.userId);
          return;
        }

        // -------------------------
        // ✅ RELIABLE MSG receive + UI forward + ACK
        // -------------------------
        if (msg.type === "MSG") {
          const profile = getProfile();
          if (!profile) return;

          // Update presence for sender
          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });

          const payload = msg.payload as MsgPayload;

          const alreadySeen = seenMsgIds.has(msg.msgId);

          // ✅ Only show/store once (dedupe)
          if (!alreadySeen) {
            seenMsgIds.add(msg.msgId);

            // ✅ Forward to renderer UI (Messages panel)
            // This requires peerManager.emitToUI(...) method (we’ll add if not present)
            peerManager.emitToUI("msg:received", {
              msgId: msg.msgId,
              from: msg.from,
              ts: msg.ts,
              payload,
            });
          }

          // ✅ ALWAYS ACK (even if duplicate)
          const ack: WsEnvelope<AckPayload> = {
            type: "ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: profileToIdentity(profile),
            payload: { ackMsgId: msg.msgId },
          };

          socket.send(JSON.stringify(ack));
          return;
        }

        // ACK is processed by wsClient (outgoing side)
        if (msg.type === "ACK") return;
      } catch (e) {
        console.log("[WS] invalid message:", e);
      }
    });

    socket.on("close", () => {
      const uid = peerManager.removeSocketBySocket(socket as WebSocket);
      if (uid) peerManager.markOffline(uid);
      console.log("[WS] connection closed");
    });
  });
}