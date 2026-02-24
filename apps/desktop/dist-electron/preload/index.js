"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("api", {
    // test
    ping: () => electron_1.ipcRenderer.invoke("app:ping"),
    // profile
    getProfile: () => electron_1.ipcRenderer.invoke("profile:get"),
    saveProfile: (payload) => electron_1.ipcRenderer.invoke("profile:save", payload),
    clearProfile: () => electron_1.ipcRenderer.invoke("profile:clear"),
    // peers/network
    getPeers: () => electron_1.ipcRenderer.invoke("peers:get"),
    connectToPeer: (ip) => electron_1.ipcRenderer.invoke("network:connect", { ip }),
    onPeersUpdate: (cb) => {
        const handler = (_event, peers) => cb(peers);
        electron_1.ipcRenderer.on("peers:update", handler);
        return () => electron_1.ipcRenderer.removeListener("peers:update", handler);
    },
    sendMsg: (toUserId, text) => electron_1.ipcRenderer.invoke("msg:send", { toUserId, text }),
    onMsgReceived: (cb) => {
        const handler = (_event, m) => cb(m);
        electron_1.ipcRenderer.on("msg:received", handler);
        return () => electron_1.ipcRenderer.removeListener("msg:received", handler);
    },
});
