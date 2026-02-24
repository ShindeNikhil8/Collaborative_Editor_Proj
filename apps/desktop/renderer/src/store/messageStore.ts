import { create } from "zustand";
import type { UiMessage } from "../types/global";

type MessageState = {
  messages: UiMessage[];

  // binds electron event -> pushes incoming messages
  bindIncoming: () => () => void;

  // add local echo message
  addLocal: (m: UiMessage) => void;

  clear: () => void;
};

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],

  bindIncoming: () => {
    return window.api.onMsgReceived((m) => {
      set((s) => ({
        messages: [m, ...s.messages].slice(0, 200),
      }));
    });
  },

  addLocal: (m) =>
    set((s) => ({
      messages: [m, ...s.messages].slice(0, 200),
    })),

  clear: () => set({ messages: [] }),
}));