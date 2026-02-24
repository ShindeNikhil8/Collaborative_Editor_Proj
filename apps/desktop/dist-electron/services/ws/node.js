"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWsNode = startWsNode;
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const profileStore_1 = require("../store/profileStore");
const protocol_1 = require("./protocol");
function startWsNode({ port, peerManager, wsClient }) {
    const wss = new ws_1.WebSocketServer({ port });
    // ✅ De-dup cache: prevents showing the same message again if sender retries
    const seenMsgIds = new Set();
    wss.on("listening", () => {
        console.log(`[WS] Node listening on ws://localhost:${port}`);
    });
    wss.on("connection", (socket, req) => {
        console.log("[WS] incoming connection from", req.socket.remoteAddress);
        socket.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                // -------------------------
                // HELLO handshake
                // -------------------------
                if (msg.type === "HELLO") {
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile) {
                        console.log("[WS] Reject: local profile not set");
                        socket.close();
                        return;
                    }
                    const me = (0, protocol_1.profileToIdentity)(profile);
                    // Save peer identity + mark online
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    // Map this socket to that userId
                    peerManager.setSocket(msg.from.userId, socket);
                    // Reply HELLO_ACK
                    const reply = {
                        type: "HELLO_ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: me,
                        payload: { accepted: true },
                    };
                    socket.send(JSON.stringify(reply));
                    // Immediately share my known peers list
                    const myPeers = peerManager.getAllPeerIdentities();
                    const peersMsg = {
                        type: "PEERS",
                        msgId: (0, crypto_1.randomUUID)(),
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
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    return;
                }
                // -------------------------
                // PEERS gossip
                // -------------------------
                if (msg.type === "PEERS") {
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile)
                        return;
                    const me = (0, protocol_1.profileToIdentity)(profile);
                    const list = (msg.payload?.peers ?? []);
                    for (const p of list) {
                        if (!p?.userId || !p?.ip || !p?.name)
                            continue;
                        if (p.userId === me.userId)
                            continue;
                        peerManager.upsertPeer(p, { lastSeen: Date.now(), discoveredVia: msg.from });
                        // auto-connect to discovered peers
                        wsClient.connectToPeer(p.ip).catch(() => { });
                    }
                    // ACK for peers list (optional)
                    const ack = {
                        type: "PEERS_ACK",
                        msgId: (0, crypto_1.randomUUID)(),
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
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile)
                        return;
                    // Update presence for sender
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    const payload = msg.payload;
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
                    const ack = {
                        type: "ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: (0, protocol_1.profileToIdentity)(profile),
                        payload: { ackMsgId: msg.msgId },
                    };
                    socket.send(JSON.stringify(ack));
                    return;
                }
                // ACK is processed by wsClient (outgoing side)
                if (msg.type === "ACK")
                    return;
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
