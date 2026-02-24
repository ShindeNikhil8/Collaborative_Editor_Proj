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

// ✅ Messages shown in UI
export type UiMessageKind = "CHAT" | "SYSTEM" | "FILE_EVENT";

export type UiMessage = {
  msgId: string;
  from: { userId: string; name: string; ip: string };
  ts: number;
  payload: { kind: UiMessageKind; text: string; fileRef?: unknown };
};

declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;

      // profile
      getProfile: () => Promise<UserProfile | null>;
      saveProfile: (payload: { name: string; email: string; ip: string }) => Promise<UserProfile>;
      clearProfile: () => Promise<boolean>;

      // peers/network
      getPeers: () => Promise<Peer[]>;
      connectToPeer: (ip: string) => Promise<boolean>;
      onPeersUpdate: (cb: (peers: Peer[]) => void) => () => void;

      // messaging
      sendMsg: (toUserId: string, text: string) => Promise<boolean>;
      onMsgReceived: (cb: (m: UiMessage) => void) => () => void;
    };
  }
}