import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  ping: () => ipcRenderer.invoke("app:ping"),

  // profile
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (payload: { name: string; email: string; ip: string }) =>
    ipcRenderer.invoke("profile:save", payload),
  clearProfile: () => ipcRenderer.invoke("profile:clear"),

  // peers
  getPeers: () => ipcRenderer.invoke("peers:get"),
  connectToPeer: (ip: string) => ipcRenderer.invoke("network:connect", { ip }),
  onPeersUpdate: (cb: (peers: unknown[]) => void) => {
    const handler = (_event: unknown, peers: unknown[]) => cb(peers);
    ipcRenderer.on("peers:update", handler);
    return () => ipcRenderer.removeListener("peers:update", handler);
  },

  // chat
  sendDM: (toUserId: string, text: string) =>
    ipcRenderer.invoke("chat:dm:send", { toUserId, text }),

  sendPublic: (text: string) =>
    ipcRenderer.invoke("chat:public:send", { text }),

  onMsgReceived: (cb: (m: unknown) => void) => {
    const handler = (_event: unknown, m: unknown) => cb(m);
    ipcRenderer.on("msg:received", handler);
    return () => ipcRenderer.removeListener("msg:received", handler);
  },

  onMsgStatus: (cb: (s: unknown) => void) => {
    const handler = (_event: unknown, s: unknown) => cb(s);
    ipcRenderer.on("msg:status", handler);
    return () => ipcRenderer.removeListener("msg:status", handler);
  },
});