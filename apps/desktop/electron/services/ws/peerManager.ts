import { BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import type WebSocket from "ws";
import type { PeerIdentity } from "./protocol";

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
    this.emitPeers();
  }

  setSocket(userId: string, socket: WebSocket) {
    this.socketsByUserId.set(userId, socket);
  }

  removeSocket(userId: string) {
    this.socketsByUserId.delete(userId);
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

  emitPeers() {
    const win = this.getWindow();
    if (!win) return;
    win.webContents.send("peers:update", this.getPeersSnapshot());
  }

  newMsgId() {
    return randomUUID();
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
}

export function createPeerManager(getWindow: () => BrowserWindow | null) {
  return new PeerManager(getWindow);
}

export type { PeerManager };