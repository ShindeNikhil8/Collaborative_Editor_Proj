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

  // ✅ De-dup cache (in-memory for now)
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
            console.log("[WS] Reject: local profile not set");
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

        // ✅ Receive MSG + dedupe + always ACK
        if (msg.type === "MSG") {
          const profile = getProfile();
          if (!profile) return;

          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });

          const payload = msg.payload as MsgPayload;
          const alreadySeen = seenMsgIds.has(msg.msgId);

          if (!alreadySeen) {
            seenMsgIds.add(msg.msgId);
            console.log("[MSG] from", msg.from.name, payload);
            // later: send to renderer UI
          }

          // ALWAYS ACK (even if duplicate)
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