"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWsClient = createWsClient;
const ws_1 = __importDefault(require("ws"));
const profileStore_1 = require("../store/profileStore");
const protocol_1 = require("./protocol");
const crypto_1 = require("crypto");
function createWsClient(peerManager) {
    const connecting = new Set(); // by ip
    async function connectToPeer(ip, port = 3002) {
        const trimmed = ip.trim();
        if (!trimmed)
            throw new Error("IP is required");
        if (connecting.has(trimmed))
            return;
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            throw new Error("You must register before connecting to peers.");
        connecting.add(trimmed);
        const url = `ws://${trimmed}:${port}`;
        console.log("[WS-CLIENT] connecting to", url);
        const ws = new ws_1.default(url);
        // We only know peer userId after HELLO_ACK
        let remote = null;
        ws.on("open", () => {
            const hello = {
                type: "HELLO",
                msgId: (0, crypto_1.randomUUID)(),
                ts: Date.now(),
                from: (0, protocol_1.profileToIdentity)(profile),
                payload: { app: "DistributedEditor", version: "0.0.1" },
            };
            ws.send(JSON.stringify(hello));
        });
        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === "HELLO_ACK") {
                    // msg.from is the peer identity
                    remote = msg.from;
                    // ✅ Map outgoing socket to that peer userId
                    peerManager.setSocket(remote.userId, ws);
                    peerManager.upsertPeer(remote, { status: "online", lastSeen: Date.now() });
                    console.log("[WS-CLIENT] HELLO_ACK from", remote.name, remote.ip);
                    // ✅ send my known peers to them (gossip)
                    const myKnown = peerManager.getAllPeerIdentities();
                    const peersMsg = {
                        type: "PEERS",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: (0, protocol_1.profileToIdentity)(profile),
                        payload: { peers: myKnown },
                    };
                    ws.send(JSON.stringify(peersMsg));
                    return;
                }
                if (msg.type === "PONG") {
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    return;
                }
                if (msg.type === "PING") {
                    // reply PONG
                    const prof = (0, profileStore_1.getProfile)();
                    if (!prof)
                        return;
                    ws.send(JSON.stringify({
                        type: "PONG",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: (0, protocol_1.profileToIdentity)(prof),
                        payload: {},
                    }));
                    return;
                }
                if (msg.type === "PEERS") {
                    // Optional: if a peer sends you peer list directly on outgoing channel
                    const prof = (0, profileStore_1.getProfile)();
                    if (!prof)
                        return;
                    const me = (0, protocol_1.profileToIdentity)(prof);
                    const list = (msg.payload?.peers ?? []);
                    for (const p of list) {
                        if (!p?.userId || !p?.ip || !p?.name)
                            continue;
                        if (p.userId === me.userId)
                            continue;
                        peerManager.upsertPeer(p, { lastSeen: Date.now(), discoveredVia: msg.from });
                        connectToPeer(p.ip).catch(() => { });
                    }
                    return;
                }
            }
            catch (e) {
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
