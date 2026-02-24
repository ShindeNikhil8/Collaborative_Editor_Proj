"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWsClient = createWsClient;
const ws_1 = __importDefault(require("ws"));
const crypto_1 = require("crypto");
const profileStore_1 = require("../store/profileStore");
const protocol_1 = require("./protocol");
const outboxStore_1 = require("../store/outboxStore");
function createWsClient(peerManager) {
    const connecting = new Set(); // by ip
    const pendingByMsgId = new Map();
    for (const m of (0, outboxStore_1.loadOutbox)())
        pendingByMsgId.set(m.msgId, m);
    // public group tracking: groupId -> { total, deliveredCount }
    const groupProgress = new Map();
    function emitStatus(e) {
        peerManager.emitToUI("msg:status", e);
    }
    async function connectToPeer(ip, port = 3002) {
        const trimmed = ip.trim();
        if (!trimmed)
            throw new Error("IP is required");
        if (connecting.has(trimmed))
            return;
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            throw new Error("You must register before connecting.");
        connecting.add(trimmed);
        const url = `ws://${trimmed}:${port}`;
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
                // ✅ ACK = delivered
                if (msg.type === "ACK") {
                    const payload = msg.payload;
                    const ackId = payload?.ackMsgId;
                    if (!ackId)
                        return;
                    const pending = pendingByMsgId.get(ackId);
                    pendingByMsgId.delete(ackId);
                    (0, outboxStore_1.removeOutbox)(ackId);
                    if (pending) {
                        emitStatus({
                            msgId: pending.msgId,
                            status: "delivered",
                            toUserId: pending.toUserId,
                            scope: pending.payload.scope,
                            groupId: pending.groupId,
                        });
                        // update public progress
                        if (pending.groupId) {
                            const g = groupProgress.get(pending.groupId);
                            if (g) {
                                g.delivered += 1;
                                emitStatus({
                                    msgId: pending.groupId,
                                    status: g.delivered >= g.total ? "delivered" : "sent",
                                    toUserId: "PUBLIC",
                                    scope: "PUBLIC",
                                    groupId: pending.groupId,
                                    delivered: g.delivered,
                                    total: g.total,
                                });
                            }
                        }
                    }
                    return;
                }
            }
            catch {
                // ignore
            }
        });
        ws.on("close", () => {
            connecting.delete(trimmed);
            if (remote?.userId) {
                peerManager.markOffline(remote.userId);
                peerManager.removeSocket(remote.userId);
            }
        });
        ws.on("error", () => {
            connecting.delete(trimmed);
        });
    }
    // -------- Reliable sending --------
    async function sendReliableToUser(toUserId, payload, groupId) {
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            throw new Error("Register first.");
        const from = (0, protocol_1.profileToIdentity)(profile);
        const peer = peerManager.getPeer(toUserId);
        if (!peer)
            throw new Error("Unknown peer.");
        const toIp = peer.ip;
        const msgId = (0, crypto_1.randomUUID)();
        const pending = {
            msgId,
            ts: Date.now(),
            toUserId,
            toIp,
            from,
            payload,
            groupId,
            attempts: 0,
        };
        pendingByMsgId.set(msgId, pending);
        (0, outboxStore_1.upsertOutbox)(pending);
        emitStatus({ msgId, status: "queued", toUserId, scope: payload.scope, groupId });
        connectToPeer(toIp).catch(() => { });
        trySendPending(msgId);
        // important: handshake delay retries
        setTimeout(() => trySendPending(msgId), 800);
        setTimeout(() => trySendPending(msgId), 2000);
        return msgId;
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
            emitStatus({
                msgId: p.groupId ?? p.msgId,
                status: "sent",
                toUserId: p.toUserId,
                scope: p.payload.scope,
                groupId: p.groupId,
            });
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
    // retry loop
    setInterval(() => {
        const now = Date.now();
        for (const m of pendingByMsgId.values()) {
            const last = m.lastAttemptAt ?? 0;
            if (m.attempts >= 20) {
                // fail permanently
                pendingByMsgId.delete(m.msgId);
                (0, outboxStore_1.removeOutbox)(m.msgId);
                emitStatus({
                    msgId: m.groupId ?? m.msgId,
                    status: "failed",
                    toUserId: m.toUserId,
                    scope: m.payload.scope,
                    groupId: m.groupId,
                });
                continue;
            }
            if (now - last > 5_000) {
                trySendPending(m.msgId);
            }
        }
    }, 5_000);
    // -------- Public + DM APIs --------
    async function sendDM(toUserId, text) {
        return sendReliableToUser(toUserId, {
            kind: "CHAT",
            text,
            scope: "DM",
            toUserId,
        });
    }
    async function sendPublic(text) {
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            throw new Error("Register first.");
        const me = (0, protocol_1.profileToIdentity)(profile);
        // send to all known peers except me
        const peers = peerManager.getAllPeerIdentities().filter((p) => p.userId !== me.userId);
        const groupId = `public-${(0, crypto_1.randomUUID)()}`;
        groupProgress.set(groupId, { total: peers.length, delivered: 0 });
        // UI status seed for public
        emitStatus({
            msgId: groupId,
            status: "queued",
            toUserId: "PUBLIC",
            scope: "PUBLIC",
            groupId,
            delivered: 0,
            total: peers.length,
        });
        // send reliable to each peer
        for (const p of peers) {
            await sendReliableToUser(p.userId, {
                kind: "CHAT",
                text,
                scope: "PUBLIC",
                groupId,
            }, groupId);
        }
        return groupId;
    }
    return { connectToPeer, sendDM, sendPublic };
}
