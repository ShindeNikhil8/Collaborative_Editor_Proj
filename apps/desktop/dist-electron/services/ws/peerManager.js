"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPeerManager = createPeerManager;
const crypto_1 = require("crypto");
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
        this.emitPeers();
    }
    setSocket(userId, socket) {
        this.socketsByUserId.set(userId, socket);
    }
    removeSocket(userId) {
        this.socketsByUserId.delete(userId);
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
    emitPeers() {
        const win = this.getWindow();
        if (!win)
            return;
        win.webContents.send("peers:update", this.getPeersSnapshot());
    }
    newMsgId() {
        return (0, crypto_1.randomUUID)();
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
}
function createPeerManager(getWindow) {
    return new PeerManager(getWindow);
}
