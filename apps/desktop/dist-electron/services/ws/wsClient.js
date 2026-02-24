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
const outboxStore_1 = require("../store/outboxStore");
function createWsClient(peerManager) {
    const connecting = new Set(); // by ip
    // in-memory cache of pending msgs (loaded from disk on start)
    const pendingByMsgId = new Map();
    for (const m of (0, outboxStore_1.loadOutbox)())
        pendingByMsgId.set(m.msgId, m);
    // cooldown for failed IPs to reduce spam
    const lastFailedAt = new Map();
    async function connectToPeer(ip, port = 3002) {
        const trimmed = ip.trim();
        if (!trimmed)
            throw new Error("IP is required");
        const last = lastFailedAt.get(trimmed) ?? 0;
        if (Date.now() - last < 60_000)
            return; // 60s cooldown after failure
        if (connecting.has(trimmed))
            return;
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            throw new Error("You must register before connecting to peers.");
        connecting.add(trimmed);
        const url = `ws://${trimmed}:${port}`;
        console.log("[WS-CLIENT] connecting to", url);
        const ws = new ws_1.default(url);
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
                    remote = msg.from;
                    peerManager.setSocket(remote.userId, ws);
                    peerManager.upsertPeer(remote, { status: "online", lastSeen: Date.now() });
                    console.log("[WS-CLIENT] HELLO_ACK from", remote.name, remote.ip);
                    // Send my known peers including myself
                    const me = (0, protocol_1.profileToIdentity)(profile);
                    const known = peerManager.getAllPeerIdentities();
                    const peersMsg = {
                        type: "PEERS",
                        msgId: (0, crypto_1.randomUUID)(),
                        ts: Date.now(),
                        from: me,
                        payload: { peers: [me, ...known] },
                    };
                    ws.send(JSON.stringify(peersMsg));
                    flushPendingToUser(remote.userId);
                    return;
                }
                if (msg.type === "PING") {
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
                if (msg.type === "PONG") {
                    peerManager.upsertPeer(msg.from, { status: "online", lastSeen: Date.now() });
                    return;
                }
                if (msg.type === "PEERS") {
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
                // ✅ Reliable ACK handling
                if (msg.type === "ACK") {
                    const payload = msg.payload;
                    if (payload?.ackMsgId) {
                        pendingByMsgId.delete(payload.ackMsgId);
                        (0, outboxStore_1.removeOutbox)(payload.ackMsgId);
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
            lastFailedAt.set(trimmed, Date.now());
            connecting.delete(trimmed);
        });
    }
    // ✅ SEND RELIABLE by userId (no toIp from UI)
    async function sendReliable(toUserId, payload) {
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            throw new Error("You must register before sending messages.");
        const from = (0, protocol_1.profileToIdentity)(profile);
        const peer = peerManager.getPeer(toUserId);
        if (!peer)
            throw new Error("Unknown peer (no identity for this userId).");
        const toIp = peer.ip;
        const msgId = (0, crypto_1.randomUUID)();
        const pending = {
            msgId,
            ts: Date.now(),
            toUserId,
            toIp,
            from,
            payload,
            attempts: 0,
        };
        pendingByMsgId.set(msgId, pending);
        (0, outboxStore_1.upsertOutbox)(pending);
        connectToPeer(toIp).catch(() => { });
        trySendPending(msgId);
    }
    function trySendPending(msgId) {
        const p = pendingByMsgId.get(msgId);
        if (!p)
            return;
        const socket = peerManager.getSocket(p.toUserId);
        if (!socket || socket.readyState !== 1)
            return;
        const env = {
            type: "MSG",
            msgId: p.msgId,
            ts: p.ts,
            from: p.from,
            payload: p.payload,
        };
        try {
            socket.send(JSON.stringify(env));
            const updated = {
                ...p,
                attempts: p.attempts + 1,
                lastAttemptAt: Date.now(),
            };
            pendingByMsgId.set(msgId, updated);
            (0, outboxStore_1.upsertOutbox)(updated);
        }
        catch {
            // retry later
        }
    }
    function flushPendingToUser(userId) {
        for (const m of pendingByMsgId.values()) {
            if (m.toUserId === userId)
                trySendPending(m.msgId);
        }
    }
    // retry loop (5s)
    setInterval(() => {
        const now = Date.now();
        for (const m of pendingByMsgId.values()) {
            const last = m.lastAttemptAt ?? 0;
            if (m.attempts < 20 && now - last > 5_000) {
                trySendPending(m.msgId);
            }
        }
    }, 5_000);
    return { connectToPeer, sendReliable };
}
