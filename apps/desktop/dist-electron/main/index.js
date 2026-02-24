"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const node_1 = require("../services/ws/node");
const profileStore_1 = require("../services/store/profileStore");
const peerManager_1 = require("../services/ws/peerManager");
const wsClient_1 = require("../services/ws/wsClient");
const peersStore_1 = require("../services/store/peersStore");
const DEV_URL = "http://localhost:5173";
const WS_PORT = 3002;
let mainWindow = null;
const peerManager = (0, peerManager_1.createPeerManager)(() => mainWindow);
const wsClient = (0, wsClient_1.createWsClient)(peerManager);
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path_1.default.join(__dirname, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
}
electron_1.app.whenReady().then(() => {
    // Start WS node
    (0, node_1.startWsNode)({ port: WS_PORT, peerManager, wsClient });
    // ✅ Create window FIRST so peer updates can be sent to UI
    createWindow();
    // ✅ Load known peers from disk and show them as offline initially
    const known = (0, peersStore_1.loadKnownPeers)();
    for (const p of known) {
        peerManager.upsertPeer(p, { status: "offline" });
    }
    // ✅ Auto-reconnect to known peers on startup
    for (const p of known) {
        wsClient.connectToPeer(p.ip).catch(() => { });
    }
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
// IPC
electron_1.ipcMain.handle("app:ping", async () => "pong");
electron_1.ipcMain.handle("profile:get", async () => (0, profileStore_1.getProfile)());
electron_1.ipcMain.handle("profile:save", async (_evt, payload) => {
    if (!payload?.name?.trim())
        throw new Error("Name required");
    if (!payload?.email?.trim())
        throw new Error("Email required");
    if (!payload?.ip?.trim())
        throw new Error("IP required");
    return (0, profileStore_1.saveProfile)({
        name: payload.name.trim(),
        email: payload.email.trim(),
        ip: payload.ip.trim(),
    });
});
electron_1.ipcMain.handle("profile:clear", async () => {
    (0, profileStore_1.clearProfile)();
    return true;
});
electron_1.ipcMain.handle("peers:get", async () => peerManager.getPeersSnapshot());
electron_1.ipcMain.handle("network:connect", async (_evt, payload) => {
    await wsClient.connectToPeer(payload.ip);
    return true;
});
