export {};

export type UserProfile = {
  userId: string;
  name: string;
  email: string;
  ip: string;
  createdAt: number;
};

export type PeerStatus = "online" | "offline" | "connecting";

export type Peer = {
  userId: string;
  name: string;
  ip: string;
  status: PeerStatus;
  lastSeen: number;
  discoveredVia?: { userId: string; name: string; ip: string };
};

export type UiMessageKind = "CHAT" | "SYSTEM" | "FILE_EVENT";
export type ChatScope = "PUBLIC" | "DM";

export type UiMessage = {
  msgId: string;
  from: { userId: string; name: string; ip: string };
  ts: number;
  payload: { kind: UiMessageKind; text: string; scope: ChatScope; toUserId?: string; groupId?: string; fileRef?: unknown };

  // ✅ UI metadata
  direction: "in" | "out";
  threadKey: string; // "public" or `dm:<otherUserId>`
  status?: "queued" | "sent" | "delivered" | "failed";
  progress?: { delivered: number; total: number }; // for public
};

export type UiMsgStatusEvent = {
  msgId: string; // msgId for DM OR groupId for PUBLIC
  status: "queued" | "sent" | "delivered" | "failed";
  toUserId: string; // "PUBLIC" for public aggregation
  scope: ChatScope;
  groupId?: string;
  delivered?: number;
  total?: number;
};

declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;

      getProfile: () => Promise<UserProfile | null>;
      saveProfile: (payload: { name: string; email: string; ip: string }) => Promise<UserProfile>;
      clearProfile: () => Promise<boolean>;

      getPeers: () => Promise<Peer[]>;
      connectToPeer: (ip: string) => Promise<boolean>;
      onPeersUpdate: (cb: (peers: Peer[]) => void) => () => void;

      // ✅ chat
      sendDM: (toUserId: string, text: string) => Promise<string>;     // returns msgId
      sendPublic: (text: string) => Promise<string>;                   // returns groupId
      onMsgReceived: (cb: (m: unknown) => void) => () => void;             // we validate in store
      onMsgStatus: (cb: (s: UiMsgStatusEvent) => void) => () => void;
    };
  }
}