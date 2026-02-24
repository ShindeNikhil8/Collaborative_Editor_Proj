import WebSocket from "ws";
import { getProfile } from "../store/profileStore";
import type { PeerManager } from "./peerManager";
import { profileToIdentity } from "./protocol";
import { randomUUID } from "crypto";
import type { WsEnvelope, HelloPayload, HelloAckPayload, PeersPayload } from "./protocol";

export function createWsClient(peerManager: PeerManager) {
  const connecting = new Set<string>(); // by ip

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
          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
          console.log("[WS-CLIENT] HELLO_ACK from", msg.from.name, msg.from.ip);

          // ✅ send my known peers to them
          const myKnown = peerManager
            .getPeersSnapshot()
            .map((p) => ({ userId: p.userId, name: p.name, ip: p.ip }));

          const peersMsg: WsEnvelope<PeersPayload> = {
            type: "PEERS",
            msgId: randomUUID(),
            ts: Date.now(),
            from: profileToIdentity(profile),
            payload: { peers: myKnown },
          };

          ws.send(JSON.stringify(peersMsg));
        }

        if (msg.type === "PONG") {
          peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
        }
      } catch (e) {
        console.log("[WS-CLIENT] invalid message:", e);
      }
    });

    ws.on("close", () => {
      console.log("[WS-CLIENT] closed", url);
      connecting.delete(trimmed);
    });

    ws.on("error", (err) => {
      console.log("[WS-CLIENT] error", url, err);
      connecting.delete(trimmed);
    });
  }

  return { connectToPeer };
}