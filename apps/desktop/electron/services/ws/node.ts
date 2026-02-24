import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import type WebSocket from "ws";
import { getProfile } from "../store/profileStore";
import type { PeerManager } from "./peerManager";
import { profileToIdentity } from "./protocol";
import type { WsEnvelope, HelloPayload, HelloAckPayload, PeersPayload, PeersAckPayload } from "./protocol";

type StartNodeArgs = {
  port: number;
  peerManager: PeerManager;
};

export function startWsNode({ port, peerManager }: StartNodeArgs) {
  const wss = new WebSocketServer({ port });

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

          // Save the peer
          peerManager.upsertPeer(msg.from, {
            status: "online",
            lastSeen: Date.now(),
          });

          peerManager.setSocket(msg.from.userId, socket as WebSocket);

          // Reply HELLO_ACK with my identity
          const reply: WsEnvelope<HelloAckPayload> = {
            type: "HELLO_ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: profileToIdentity(profile),
            payload: { accepted: true },
          };

          socket.send(JSON.stringify(reply));
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
        }

        if (msg.type === "PEERS") {
          const profile = getProfile();
          if (!profile) return;

          const list = (msg.payload?.peers ?? []) as any[];

          for (const p of list) {
            if (!p?.userId || !p?.ip || !p?.name) continue;
            if (p.userId === profile.userId) continue;

            peerManager.upsertPeer(p, {
              status: "offline",
              lastSeen: Date.now(),
              discoveredVia: msg.from,
            });
          }

          const ack: WsEnvelope<PeersAckPayload> = {
            type: "PEERS_ACK",
            msgId: randomUUID(),
            ts: Date.now(),
            from: profileToIdentity(profile),
            payload: { received: list.length },
          };

          socket.send(JSON.stringify(ack));
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