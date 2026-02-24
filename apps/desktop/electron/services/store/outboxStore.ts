import ElectronStore from "electron-store";
import type { PeerIdentity, MsgPayload } from "../ws/protocol";

export type PendingOutboxMsg = {
  msgId: string;
  ts: number;
  toUserId: string;
  toIp: string;
  from: PeerIdentity;
  payload: MsgPayload;
  attempts: number;
  lastAttemptAt?: number;
};

type Schema = {
  outbox?: PendingOutboxMsg[];
};

const store = new ElectronStore<Schema>({ name: "distributed-editor" });

export function loadOutbox(): PendingOutboxMsg[] {
  return store.get("outbox") ?? [];
}

export function saveOutbox(list: PendingOutboxMsg[]) {
  store.set("outbox", list);
}

export function upsertOutbox(msg: PendingOutboxMsg) {
  const list = loadOutbox();
  const idx = list.findIndex((m) => m.msgId === msg.msgId);
  if (idx >= 0) list[idx] = msg;
  else list.push(msg);
  saveOutbox(list);
}

export function removeOutbox(msgId: string) {
  const list = loadOutbox().filter((m) => m.msgId !== msgId);
  saveOutbox(list);
}