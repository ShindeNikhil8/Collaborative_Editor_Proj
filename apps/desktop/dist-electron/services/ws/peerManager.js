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
        // Important: do not overwrite status unless patch provides it
        const next = {
            ...peer,
            status: existing?.status ?? "offline",
            lastSeen: existing?.lastSeen ?? Date.now(),
            discoveredVia: existing?.discoveredVia,
            ...existing,
            ...patch,
        };
        this.peersByUserId.set(peer.userId, next);
        // persist identities only
        (0, peersStore_1.saveKnownPeers)(this.getAllPeerIdentities());
        this.emitPeers();
    }
    setSocket(userId, socket) {
        this.socketsByUserId.set(userId, socket);
    }
    getSocket(userId) {
        return this.socketsByUserId.get(userId);
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
    markConnecting(userId) {
        const p = this.peersByUserId.get(userId);
        if (!p)
            return;
        this.upsertPeer(p, { status: "connecting", lastSeen: Date.now() });
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
    // Broadcast a PEERS message to all connected sockets
    broadcastPeers(peers, envelopeFrom, exceptUserId) {
        const msg = {
            type: "PEERS",
            msgId: (0, crypto_1.randomUUID)(),
            ts: Date.now(),
            from: envelopeFrom,
            payload: { peers },
        };
        const raw = JSON.stringify(msg);
        for (const [uid, socket] of this.socketsByUserId.entries()) {
            if (exceptUserId && uid === exceptUserId)
                continue;
            if (socket.readyState === 1) {
                socket.send(raw);
            }
        }
    }
    newMsgId() {
        return (0, crypto_1.randomUUID)();
    }
}
function createPeerManager(getWindow) {
    return new PeerManager(getWindow);
}
