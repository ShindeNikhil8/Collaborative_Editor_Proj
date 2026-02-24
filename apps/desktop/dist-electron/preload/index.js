"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("api", {
    ping: () => electron_1.ipcRenderer.invoke("app:ping"),
    getProfile: () => electron_1.ipcRenderer.invoke("profile:get"),
    saveProfile: (payload) => electron_1.ipcRenderer.invoke("profile:save", payload),
    clearProfile: () => electron_1.ipcRenderer.invoke("profile:clear"),
    getPeers: () => electron_1.ipcRenderer.invoke("peers:get"),
    connectToPeer: (ip) => electron_1.ipcRenderer.invoke("network:connect", { ip }),
    onPeersUpdate: (cb) => {
        const handler = (_event, peers) => cb(peers);
        electron_1.ipcRenderer.on("peers:update", handler);
        return () => electron_1.ipcRenderer.removeListener("peers:update", handler);
    },
    // chat history
    getChatHistory: () => electron_1.ipcRenderer.invoke("chat:history:get"),
    clearChatHistory: () => electron_1.ipcRenderer.invoke("chat:history:clear"),
    // send
    sendDM: (toUserId, text) => electron_1.ipcRenderer.invoke("chat:dm:send", { toUserId, text }),
    sendPublic: (text) => electron_1.ipcRenderer.invoke("chat:public:send", { text }),
    // receive
    onMsgReceived: (cb) => {
        const handler = (_e, m) => cb(m);
        electron_1.ipcRenderer.on("msg:received", handler);
        return () => electron_1.ipcRenderer.removeListener("msg:received", handler);
    },
});
