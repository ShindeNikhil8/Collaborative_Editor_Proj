import ElectronStore from "electron-store";
import type { PeerIdentity, MsgPayload } from "../ws/protocol";

export type StoredChatMessage = {
  msgId: string;
  ts: number;
  from: PeerIdentity;
  payload: MsgPayload;
  direction: "in" | "out";
};

type Schema = {
  chatHistory?: StoredChatMessage[];
};

const store = new ElectronStore<Schema>({ name: "distributed-editor" });

export function loadChatHistory(): StoredChatMessage[] {
  return store.get("chatHistory") ?? [];
}

export function appendChatMessage(m: StoredChatMessage) {
  const list = loadChatHistory();
  if (list.some((x) => x.msgId === m.msgId)) return;
  list.push(m);
  store.set("chatHistory", list.slice(-1500));
}

export function clearChatHistory() {
  store.set("chatHistory", []);
}