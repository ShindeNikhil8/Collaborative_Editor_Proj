import type { UserProfile } from "../store/profileStore";

// Keep it simple and strict for now.
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
  | "PEERS_ACK";

export type WsEnvelope<TPayload> = {
  type: WsType;
  msgId: string;
  ts: number;
  from: PeerIdentity;
  payload: TPayload;
};

export type PeersPayload = {
  peers: PeerIdentity[];
};

export type PeersAckPayload = {
  received: number;
};

export type HelloPayload = {
  // later: projectId, auth token, permissions, etc.
  app: "DistributedEditor";
  version: "0.0.1";
};

export type HelloAckPayload = {
  accepted: true;
};

export function profileToIdentity(p: UserProfile): PeerIdentity {
  return { userId: p.userId, name: p.name, ip: p.ip };
}