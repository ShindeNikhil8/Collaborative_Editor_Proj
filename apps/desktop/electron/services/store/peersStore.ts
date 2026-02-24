import ElectronStore from "electron-store";
import type { PeerIdentity } from "../ws/protocol";

type Schema = { peers?: PeerIdentity[] };

const store = new ElectronStore<Schema>({ name: "distributed-editor" });

export function loadKnownPeers(): PeerIdentity[] {
  return store.get("peers") ?? [];
}

export function saveKnownPeers(peers: PeerIdentity[]) {
  store.set("peers", peers);
}