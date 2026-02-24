import { create } from "zustand";
import type { Peer } from "../types/global";

type NetworkState = {
  peers: Peer[];

  // UI state
  connectingIps: Record<string, true | undefined>;

  loadPeers: () => Promise<void>;
  connectToPeer: (ip: string) => Promise<void>;
  bindPeerUpdates: () => () => void;
};

export const useNetworkStore = create<NetworkState>((set, get) => ({
  peers: [],
  connectingIps: {},

  loadPeers: async () => {
    const peers = await window.api.getPeers();
    set({ peers });
  },

  connectToPeer: async (ip) => {
    const trimmed = ip.trim();
    if (!trimmed) return;

    // prevent double clicks
    if (get().connectingIps[trimmed]) return;

    // mark connecting
    set((s) => ({
      connectingIps: { ...s.connectingIps, [trimmed]: true },
    }));

    try {
      await window.api.connectToPeer(trimmed);
      // Note: we don't mark online here.
      // Backend will push peers:update on HELLO_ACK/PONG.
    } finally {
      // remove connecting state (even if failed)
      set((s) => {
        const next = { ...s.connectingIps };
        delete next[trimmed];
        return { connectingIps: next };
      });
    }
  },

  bindPeerUpdates: () => {
    return window.api.onPeersUpdate((peers) => set({ peers }));
  },
}));