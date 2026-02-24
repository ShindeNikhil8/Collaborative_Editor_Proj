import { BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import type WebSocket from "ws";
import type { PeerIdentity, WsEnvelope, PeersPayload } from "./protocol";
import { saveKnownPeers } from "../store/peersStore";

export type PeerStatus = "online" | "offline" | "connecting";

export type Peer = PeerIdentity & {
  status: PeerStatus;
  lastSeen: number;
  discoveredVia?: PeerIdentity;
};

class PeerManager {
  private peersByUserId = new Map<string, Peer>();
  private socketsByUserId = new Map<string, WebSocket>();

  constructor(private getWindow: () => BrowserWindow | null) {}

  upsertPeer(peer: PeerIdentity, patch?: Partial<Peer>) {
    const existing = this.peersByUserId.get(peer.userId);

    const next: Peer = {
      ...peer,
      status: existing?.status ?? "offline",
      lastSeen: existing?.lastSeen ?? Date.now(),
      discoveredVia: existing?.discoveredVia,
      ...existing,
      ...patch,
    };

    this.peersByUserId.set(peer.userId, next);
    saveKnownPeers(this.getAllPeerIdentities());
    this.emitPeers();
  }

  // ✅ NEW: get peer by userId (authoritative routing)
  getPeer(userId: string): Peer | null {
    return this.peersByUserId.get(userId) ?? null;
  }

  setSocket(userId: string, socket: WebSocket) {
    this.socketsByUserId.set(userId, socket);
  }

  getSocket(userId: string) {
    return this.socketsByUserId.get(userId);
  }

  removeSocket(userId: string) {
    this.socketsByUserId.delete(userId);
  }

  removeSocketBySocket(socket: WebSocket) {
    for (const [uid, s] of this.socketsByUserId.entries()) {
      if (s === socket) {
        this.socketsByUserId.delete(uid);
        return uid;
      }
    }
    return null;
  }

  markOnline(userId: string) {
    const p = this.peersByUserId.get(userId);
    if (!p) return;
    this.upsertPeer(p, { status: "online", lastSeen: Date.now() });
  }

  markOffline(userId: string) {
    const p = this.peersByUserId.get(userId);
    if (!p) return;
    this.upsertPeer(p, { status: "offline", lastSeen: Date.now() });
  }

  getPeersSnapshot(): Peer[] {
    return Array.from(this.peersByUserId.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getAllPeerIdentities(): PeerIdentity[] {
    return Array.from(this.peersByUserId.values()).map((p) => ({
      userId: p.userId,
      name: p.name,
      ip: p.ip,
    }));
  }

  emitPeers() {
    const win = this.getWindow();
    if (!win) return;
    win.webContents.send("peers:update", this.getPeersSnapshot());
  }

  broadcastPeers(peers: PeerIdentity[], envelopeFrom: PeerIdentity, exceptUserId?: string) {
    const msg: WsEnvelope<PeersPayload> = {
      type: "PEERS",
      msgId: this.newMsgId(),
      ts: Date.now(),
      from: envelopeFrom,
      payload: { peers },
    };

    const raw = JSON.stringify(msg);

    for (const [uid, socket] of this.socketsByUserId.entries()) {
      if (exceptUserId && uid === exceptUserId) continue;
      if ((socket as any).readyState === 1) {
        socket.send(raw);
      }
    }
  }

  sendPingToAll(me: PeerIdentity) {
    const msg = {
      type: "PING",
      msgId: this.newMsgId(),
      ts: Date.now(),
      from: me,
      payload: {},
    };

    const raw = JSON.stringify(msg);

    for (const socket of this.socketsByUserId.values()) {
      if ((socket as any).readyState === 1) socket.send(raw);
    }
  }

  newMsgId() {
    return randomUUID();
  }

  emitToUI(channel: string, payload: unknown) {
    const win = this.getWindow();
    if (!win) return;
    win.webContents.send(channel, payload);
  }
}

export function createPeerManager(getWindow: () => BrowserWindow | null) {
  return new PeerManager(getWindow);
}

export type { PeerManager };