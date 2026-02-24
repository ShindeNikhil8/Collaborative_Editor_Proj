import { create } from "zustand";
import type { UiMessage, UiMsgStatusEvent, ChatScope } from "../types/global";
import { useAuthStore } from "./authStore";

type MessageState = {
  activeTab: "public" | "private";
  activeDmUserId: string | null;

  messages: UiMessage[];

  setTab: (t: "public" | "private") => void;
  setActiveDm: (userId: string | null) => void;

  bindIncoming: () => () => void;
  bindStatus: () => () => void;

  addOutgoingDM: (toUserId: string, text: string, msgId: string) => void;
  addOutgoingPublic: (text: string, groupId: string, total: number) => void;

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

  bindIncoming: () => {
  return window.api.onMsgReceived((raw: unknown) => {
    const me = useAuthStore.getState().profile;
    const meId = me?.userId ?? "me";

    if (typeof raw !== "object" || raw === null) return;

    const m = raw as {
      msgId?: string;
      from?: { userId: string; name: string; ip: string };
      ts?: number;
      payload?: {
        kind: "CHAT" | "SYSTEM" | "FILE_EVENT";
        text: string;
        scope: ChatScope;
        toUserId?: string;
        groupId?: string;
        fileRef?: unknown;
      };
    };

    if (!m.msgId || !m.from || !m.payload) return;

    const scope = m.payload.scope;
    const threadKey = threadKeyFor(scope, meId, m.from.userId, m.payload.toUserId);

    const ui: UiMessage = {
      msgId: m.msgId,
      from: m.from,
      ts: m.ts ?? Date.now(),
      payload: m.payload,
      direction: "in",
      threadKey,
      status: "delivered",
    };

    set((s) => ({ messages: [ui, ...s.messages].slice(0, 400) }));
  });
},

  bindStatus: () => {
    return window.api.onMsgStatus((ev: UiMsgStatusEvent) => {
      set((s) => {
        const idx = s.messages.findIndex((m) => m.msgId === ev.msgId && m.direction === "out");
        if (idx < 0) return s;

        const copy = [...s.messages];
        const msg = { ...copy[idx] };

        msg.status = ev.status;

        if (ev.scope === "PUBLIC" && typeof ev.delivered === "number" && typeof ev.total === "number") {
          msg.progress = { delivered: ev.delivered, total: ev.total };
        }

        copy[idx] = msg;
        return { messages: copy };
      });
    });
  },

  addOutgoingDM: (toUserId, text, msgId) => {
    const me = useAuthStore.getState().profile;
    const meId = me?.userId ?? "me";

    const ui: UiMessage = {
      msgId,
      from: { userId: meId, name: me?.name ?? "Me", ip: me?.ip ?? "-" },
      ts: Date.now(),
      payload: { kind: "CHAT", text, scope: "DM", toUserId },
      direction: "out",
      threadKey: `dm:${toUserId}`,
      status: "queued",
    };

    set((s) => ({ messages: [ui, ...s.messages].slice(0, 400) }));
  },

  addOutgoingPublic: (text, groupId, total) => {
    const me = useAuthStore.getState().profile;
    const meId = me?.userId ?? "me";

    const ui: UiMessage = {
      msgId: groupId,
      from: { userId: meId, name: me?.name ?? "Me", ip: me?.ip ?? "-" },
      ts: Date.now(),
      payload: { kind: "CHAT", text, scope: "PUBLIC", groupId },
      direction: "out",
      threadKey: "public",
      status: "queued",
      progress: { delivered: 0, total },
    };

    set((s) => ({ messages: [ui, ...s.messages].slice(0, 400) }));
  },

  clear: () => set({ messages: [] }),
}));