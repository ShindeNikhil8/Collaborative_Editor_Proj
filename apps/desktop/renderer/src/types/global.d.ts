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

export type ChatScope = "DM" | "PUBLIC";

export type UiMessageKind = "CHAT" | "SYSTEM" | "FILE_EVENT";

export type UiMessagePayload = {
  kind: UiMessageKind;
  text: string;
  scope: ChatScope;
  toUserId?: string;
  groupId?: string;
  fileRef?: unknown;
};

export type UiMessage = {
  msgId: string;
  ts: number;
  from: { userId: string; name: string; ip: string };
  payload: UiMessagePayload;
  direction?: "in" | "out";
  threadKey?: string;
  status?: string;
  progress?: { delivered: number; total: number };
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

      // history
      getChatHistory: () => Promise<UiMessage[]>;
      clearChatHistory: () => Promise<boolean>;

      // send
      sendDM: (toUserId: string, text: string) => Promise<string>;
      sendPublic: (text: string) => Promise<string>;

      // receive
      onMsgReceived: (cb: (m: UiMessage) => void) => () => void;
    };
  }
}