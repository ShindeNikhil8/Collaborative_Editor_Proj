"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPeerManager = createPeerManager;
const crypto_1 = require("crypto");
const peersStore_1 = require("../store/peersStore");
class PeerManager {
    getWindow;
    peersByUserId = new Map();
    socketsByUserId = new Map();
    constructor(getWindow) {
        this.getWindow = getWindow;
    }
    upsertPeer(peer, patch) {
        const existing = this.peersByUserId.get(peer.userId);
        const next = {
            ...peer,
            status: existing?.status ?? "offline",
            lastSeen: existing?.lastSeen ?? Date.now(),
            discoveredVia: existing?.discoveredVia,
            ...existing,
            ...patch,
        };
        this.peersByUserId.set(peer.userId, next);
        (0, peersStore_1.saveKnownPeers)(this.getAllPeerIdentities());
        this.emitPeers();
    }
    getPeerIdentity(userId) {
        const p = this.peersByUserId.get(userId);
        if (!p)
            return null;
        return { userId: p.userId, name: p.name, ip: p.ip };
    }
    getPeer(userId) {
        return this.peersByUserId.get(userId) ?? null;
    }
    setSocket(userId, socket) {
        this.socketsByUserId.set(userId, socket);
    }
    getSocket(userId) {
        return this.socketsByUserId.get(userId) ?? null;
    }
    removeSocket(userId) {
        this.socketsByUserId.delete(userId);
    }
    removeSocketBySocket(socket) {
        for (const [uid, s] of this.socketsByUserId.entries()) {
            if (s === socket) {
                this.socketsByUserId.delete(uid);
                return uid;
            }
        }
        return null;
    }
    markOnline(userId) {
        const p = this.peersByUserId.get(userId);
        if (!p)
            return;
        this.upsertPeer(p, { status: "online", lastSeen: Date.now() });
    }
    markOffline(userId) {
        const p = this.peersByUserId.get(userId);
        if (!p)
            return;
        this.upsertPeer(p, { status: "offline", lastSeen: Date.now() });
    }
    getPeersSnapshot() {
        return Array.from(this.peersByUserId.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    getAllPeerIdentities() {
        return Array.from(this.peersByUserId.values()).map((p) => ({
            userId: p.userId,
            name: p.name,
            ip: p.ip,
        }));
    }
    emitPeers() {
        const win = this.getWindow();
        if (!win)
            return;
        win.webContents.send("peers:update", this.getPeersSnapshot());
    }
    emitToUI(channel, payload) {
        const win = this.getWindow();
        if (!win)
            return;
        win.webContents.send(channel, payload);
    }
    broadcastPeers(peers, envelopeFrom, exceptUserId) {
        const msg = {
            type: "PEERS",
            msgId: this.newMsgId(),
            ts: Date.now(),
            from: envelopeFrom,
            payload: { peers },
        };
        const raw = JSON.stringify(msg);
        for (const [uid, socket] of this.socketsByUserId.entries()) {
            if (exceptUserId && uid === exceptUserId)
                continue;
            if (socket.readyState === 1)
                socket.send(raw);
        }
    }
    sendPingToAll(me) {
        const msg = {
            type: "PING",
            msgId: this.newMsgId(),
            ts: Date.now(),
            from: me,
            payload: {},
        };
        const raw = JSON.stringify(msg);
        for (const socket of this.socketsByUserId.values()) {
            if (socket.readyState === 1)
                socket.send(raw);
        }
    }
    newMsgId() {
        return (0, crypto_1.randomUUID)();
    }
}
function createPeerManager(getWindow) {
    return new PeerManager(getWindow);
}
