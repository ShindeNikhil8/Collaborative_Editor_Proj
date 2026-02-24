import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  ping: () => ipcRenderer.invoke("app:ping"),

  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (payload: { name: string; email: string; ip: string }) =>
    ipcRenderer.invoke("profile:save", payload),
  clearProfile: () => ipcRenderer.invoke("profile:clear"),

  getPeers: () => ipcRenderer.invoke("peers:get"),
  connectToPeer: (ip: string) => ipcRenderer.invoke("network:connect", { ip }),

  onPeersUpdate: (cb: (peers: unknown[]) => void) => {
    const handler = (_event: unknown, peers: unknown[]) => cb(peers);
    ipcRenderer.on("peers:update", handler);
    return () => ipcRenderer.removeListener("peers:update", handler);
  },

  // chat history
  getChatHistory: () => ipcRenderer.invoke("chat:history:get"),
  clearChatHistory: () => ipcRenderer.invoke("chat:history:clear"),

  // send
  sendDM: (toUserId: string, text: string) =>
    ipcRenderer.invoke("chat:dm:send", { toUserId, text }),
  sendPublic: (text: string) =>
    ipcRenderer.invoke("chat:public:send", { text }),

  // receive
  onMsgReceived: (cb: (m: unknown) => void) => {
    const handler = (_e: unknown, m: unknown) => cb(m);
    ipcRenderer.on("msg:received", handler);
    return () => ipcRenderer.removeListener("msg:received", handler);
  },
});