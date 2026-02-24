import type { UserProfile } from "../store/profileStore";

export type PeerIdentity = {
  userId: string;
  name: string;
  ip: string;
};

export type WsType =
  | "HELLO"
  | "HELLO_ACK"
  | "PING"
  | "PONG"
  | "PEERS"
  | "PEERS_ACK"
  | "MSG"
  | "ACK";

export type WsEnvelope<TPayload> = {
  type: WsType;
  msgId: string;
  ts: number;
  from: PeerIdentity;
  payload: TPayload;
};

export type HelloPayload = {
  app: "DistributedEditor";
  version: "0.0.1";
};

export type HelloAckPayload = { accepted: true };

export type PeersPayload = { peers: PeerIdentity[] };

export type PeersAckPayload = { received: number };

export type ChatScope = "DM" | "PUBLIC";

export type MsgPayload = {
  kind: "CHAT" | "SYSTEM" | "FILE_EVENT";
  text: string;

  scope: ChatScope;

  // DM
  toUserId?: string;

  // PUBLIC
  groupId?: string;

  fileRef?: { path: string; line: number; col?: number };
};

export type AckPayload = { ackMsgId: string };

export function profileToIdentity(p: UserProfile): PeerIdentity {
  return { userId: p.userId, name: p.name, ip: p.ip };
}