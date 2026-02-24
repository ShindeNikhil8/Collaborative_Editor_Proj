import { create } from "zustand";
import type { UiMessage, ChatScope } from "../types/global";
import { useAuthStore } from "./authStore";

type MessageState = {
  activeTab: "public" | "private";
  activeDmUserId: string | null;

  messages: UiMessage[];

  setTab: (t: "public" | "private") => void;
  setActiveDm: (userId: string | null) => void;

  loadHistoryFromMain: () => Promise<void>;
  bindIncoming: () => () => void;

  addOutgoingDM: (toUserId: string, text: string, msgId: string) => void;
  addOutgoingPublic: (text: string, groupId: string) => void;

  clear: () => void;
};

function threadKeyFor(scope: ChatScope, meId: string, fromId: string, toUserId?: string) {
  if (scope === "PUBLIC") return "public";
  const other = fromId === meId ? (toUserId ?? "unknown") : fromId;
  return `dm:${other}`;
}

export const useMessageStore = create<MessageState>((set) => ({
  activeTab: "public",
  activeDmUserId: null,
  messages: [],

  setTab: (t) => set({ activeTab: t }),
  setActiveDm: (userId) => set({ activeDmUserId: userId }),

  loadHistoryFromMain: async () => {
    const me = useAuthStore.getState().profile;
    const meId = me?.userId ?? "me";

    const raw = await window.api.getChatHistory();

    const ui = raw.map((m) => {
      const scope = m.payload.scope;
      return {
        ...m,
        direction: m.direction ?? "in",
        threadKey: m.threadKey ?? threadKeyFor(scope, meId, m.from.userId, m.payload.toUserId),
        status: m.status ?? "delivered",
      } as UiMessage;
    });

    set((s) => ({ messages: [...ui, ...s.messages].slice(0, 800) }));
  },

  bindIncoming: () => {
    return window.api.onMsgReceived((m) => {
      const me = useAuthStore.getState().profile;
      const meId = me?.userId ?? "me";

      const scope = m.payload.scope;
      const threadKey = threadKeyFor(scope, meId, m.from.userId, m.payload.toUserId);

      const ui: UiMessage = {
        ...m,
        direction: "in",
        threadKey,
        status: "delivered",
      };

      set((s) => ({ messages: [ui, ...s.messages].slice(0, 800) }));
    });
  },

  addOutgoingDM: (toUserId, text, msgId) => {
    const me = useAuthStore.getState().profile;

    const ui: UiMessage = {
      msgId,
      ts: Date.now(),
      from: { userId: me?.userId ?? "me", name: me?.name ?? "Me", ip: me?.ip ?? "-" },
      payload: { kind: "CHAT", text, scope: "DM", toUserId },
      direction: "out",
      threadKey: `dm:${toUserId}`,
      status: "queued",
    };

    set((s) => ({ messages: [ui, ...s.messages].slice(0, 800) }));
  },

  addOutgoingPublic: (text, groupId) => {
    const me = useAuthStore.getState().profile;

    const ui: UiMessage = {
      msgId: groupId,
      ts: Date.now(),
      from: { userId: me?.userId ?? "me", name: me?.name ?? "Me", ip: me?.ip ?? "-" },
      payload: { kind: "CHAT", text, scope: "PUBLIC", groupId },
      direction: "out",
      threadKey: "public",
      status: "queued",
    };

    set((s) => ({ messages: [ui, ...s.messages].slice(0, 800) }));
  },

  clear: () => set({ messages: [] }),
}));