"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWsNode = startWsNode;
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const profileStore_1 = require("../store/profileStore");
const protocol_1 = require("./protocol");
const chatStore_1 = require("../store/chatStore");
function startWsNode({ port, peerManager, wsClient }) {
    const wss = new ws_1.WebSocketServer({ port });
    const seenMsgIds = new Set();
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
                        socket.close();
                        return;
                    }
                    const me = (0, protocol_1.profileToIdentity)(profile);
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    peerManager.setSocket(msg.from.userId, socket);
                    const reply = {
                        type: "HELLO_ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: me,
                        payload: { accepted: true },
                    };
                    socket.send(JSON.stringify(reply));
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
                        wsClient.connectToPeer(p.ip).catch(() => { });
                    }
                    const ack = {
                        type: "PEERS_ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: me,
                        payload: { received: list.length },
                    };
                    socket.send(JSON.stringify(ack));
                    peerManager.broadcastPeers(list, me, msg.from.userId);
                    return;
                }
                if (msg.type === "MSG") {
                    const profile = (0, profileStore_1.getProfile)();
                    if (!profile)
                        return;
                    const me = (0, protocol_1.profileToIdentity)(profile);
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    const payload = msg.payload;
                    // DM safety: accept only if addressed to me
                    if (payload.scope === "DM" && payload.toUserId && payload.toUserId !== me.userId) {
                        const ackIgnore = {
                            type: "ACK",
                            msgId: (0, crypto_1.randomUUID)(),
                            ts: Date.now(),
                            from: me,
                            payload: { ackMsgId: msg.msgId },
                        };
                        socket.send(JSON.stringify(ackIgnore));
                        return;
                    }
                    if (!seenMsgIds.has(msg.msgId)) {
                        seenMsgIds.add(msg.msgId);
                        (0, chatStore_1.appendChatMessage)({
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
                    const ack = {
                        type: "ACK",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: me,
                        payload: { ackMsgId: msg.msgId },
                    };
                    socket.send(JSON.stringify(ack));
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
        });
    });
}
