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
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    console.log("[WS-CLIENT] HELLO_ACK from", msg.from.name, msg.from.ip);
                    // ✅ send my known peers to them
                    const myKnown = peerManager
                        .getPeersSnapshot()
                        .map((p) => ({ userId: p.userId, name: p.name, ip: p.ip }));
                    const peersMsg = {
                        type: "PEERS",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: (0, protocol_1.profileToIdentity)(profile),
                        payload: { peers: myKnown },
                    };
                    ws.send(JSON.stringify(peersMsg));
                }
                if (msg.type === "PONG") {
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                }
            }
            catch (e) {
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
