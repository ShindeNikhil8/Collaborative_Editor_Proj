import WebSocket from "ws";
import { getProfile } from "../store/profileStore";
import type { PeerManager } from "./peerManager";
import type {
  WsEnvelope,
  HelloPayload,
  PeersPayload,
  PeerIdentity,
} from "./protocol";
import { profileToIdentity } from "./protocol";
import { randomUUID } from "crypto";

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

          // map outgoing socket
          peerManager.setSocket(remote.userId, ws as any);

          peerManager.upsertPeer(remote, { status: "online", lastSeen: Date.now() });
          console.log("[WS-CLIENT] HELLO_ACK from", remote.name, remote.ip);

          // ✅ Send my known peers INCLUDING myself
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

  return { connectToPeer };
}