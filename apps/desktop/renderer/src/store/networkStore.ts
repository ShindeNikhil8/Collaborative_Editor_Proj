import { create } from "zustand";
import type { Peer } from "../types/global";

type NetworkState = {
  peers: Peer[];
  loadPeers: () => Promise<void>;
  connectToPeer: (ip: string) => Promise<void>;
  bindPeerUpdates: () => () => void;
};

export const useNetworkStore = create<NetworkState>((set) => ({
  peers: [],

  loadPeers: async () => {
    const peers = await window.api.getPeers();
    set({ peers });
  },

  connectToPeer: async (ip) => {
    await window.api.connectToPeer(ip);
  },

  bindPeerUpdates: () => {
    return window.api.onPeersUpdate((peers) => set({ peers }));
  },
}));