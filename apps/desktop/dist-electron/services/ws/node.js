"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWsNode = startWsNode;
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const profileStore_1 = require("../store/profileStore");
const protocol_1 = require("./protocol");
function startWsNode({ port, peerManager, wsClient }) {
    const wss = new ws_1.WebSocketServer({ port });
    wss.on("listening", () => {
        console.log(`[WS] Node listening on ws://localhost:${port}`);
    });
    wss.on("connection", (socket, req) => {
        console.log("[WS] incoming connection from", req.socket.remoteAddress);
        socket.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === "HELLO") {
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile) {
                        console.log("[WS] Reject: local profile not set");
                        socket.close();
                        return;
                    }
                    // Save the peer & socket mapping
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    peerManager.setSocket(msg.from.userId, socket);
                    // Reply HELLO_ACK with my identity
                    const reply = {
                        type: "HELLO_ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: (0, protocol_1.profileToIdentity)(profile),
                        payload: { accepted: true },
                    };
                    socket.send(JSON.stringify(reply));
                    return;
                }
                if (msg.type === "PING") {
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile)
                        return;
                    socket.send(JSON.stringify({
                        type: "PONG",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: (0, protocol_1.profileToIdentity)(profile),
                        payload: {},
                    }));
                    return;
                }
                if (msg.type === "PONG") {
                    // Incoming PONG means msg.from is alive
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    return;
                }
                if (msg.type === "PEERS") {
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile)
                        return;
                    const me = (0, protocol_1.profileToIdentity)(profile);
                    const list = (msg.payload?.peers ?? []);
                    // Merge peers and auto-connect
                    for (const p of list) {
                        if (!p?.userId || !p?.ip || !p?.name)
                            continue;
                        if (p.userId === me.userId)
                            continue;
                        // Do not force offline; just upsert identity + discoveredVia
                        peerManager.upsertPeer(p, {
                            lastSeen: Date.now(),
                            discoveredVia: msg.from,
                        });
                        // auto-connect (deduped inside wsClient)
                        wsClient.connectToPeer(p.ip).catch(() => { });
                    }
                    // Ack
                    const ack = {
                        type: "PEERS_ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: me,
                        payload: { received: list.length },
                    };
                    socket.send(JSON.stringify(ack));
                    // ✅ Forward these peers to everyone else except the sender
                    peerManager.broadcastPeers(list, me, msg.from.userId);
                    return;
                }
            }
            catch (e) {
                console.log("[WS] invalid message:", e);
            }
        });
        socket.on("close", () => {
            const uid = peerManager.removeSocketBySocket(socket);
            if (uid)
                peerManager.markOffline(uid);
            console.log("[WS] connection closed");
        });
    });
}
