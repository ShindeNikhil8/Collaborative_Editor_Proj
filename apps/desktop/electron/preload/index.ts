import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // test
  ping: () => ipcRenderer.invoke("app:ping"),

  // profile
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (payload: { name: string; email: string; ip: string }) =>
    ipcRenderer.invoke("profile:save", payload),
  clearProfile: () => ipcRenderer.invoke("profile:clear"),

  // peers/network
  getPeers: () => ipcRenderer.invoke("peers:get"),
  connectToPeer: (ip: string) => ipcRenderer.invoke("network:connect", { ip }),

  onPeersUpdate: (cb: (peers: unknown[]) => void) => {
    const handler = (_event: unknown, peers: unknown[]) => cb(peers);
    ipcRenderer.on("peers:update", handler);
    return () => ipcRenderer.removeListener("peers:update", handler);
  },

  sendMsg: (toUserId: string, text: string) =>
  ipcRenderer.invoke("msg:send", { toUserId, text }),

  onMsgReceived: (cb: (m: unknown) => void) => {
    const handler = (_event: unknown, m: unknown) => cb(m);
  ipcRenderer.on("msg:received", handler);
    return () => ipcRenderer.removeListener("msg:received", handler);
  },
});