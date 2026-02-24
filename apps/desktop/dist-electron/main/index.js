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
    // DevTools only in dev
    if (!electron_1.app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
}
electron_1.app.whenReady().then(() => {
    // Start WS node
    (0, node_1.startWsNode)({ port: WS_PORT, peerManager, wsClient });
    // Create window first (so peer updates can reach UI)
    createWindow();
    // Load known peers and show them offline initially
    const known = (0, peersStore_1.loadKnownPeers)();
    for (const p of known) {
        peerManager.upsertPeer(p, { status: "offline" });
    }
    // Auto reconnect on startup
    for (const p of known) {
        wsClient.connectToPeer(p.ip).catch(() => { });
    }
    // ✅ Heartbeat: ping everyone every 15 seconds
    setInterval(() => {
        const profile = (0, profileStore_1.getProfile)();
        if (!profile)
            return;
        const me = { userId: profile.userId, name: profile.name, ip: profile.ip };
        peerManager.sendPingToAll(me);
    }, 15_000);
    // ✅ Offline timeout: if no lastSeen for 45s => offline
    setInterval(() => {
        const now = Date.now();
        const peers = peerManager.getPeersSnapshot();
        for (const p of peers) {
            if (p.status === "online" && now - p.lastSeen > 45_000) {
                peerManager.markOffline(p.userId);
            }
        }
    }, 10_000);
    // ✅ Auto-reconnect: try connecting to offline peers periodically
    setInterval(() => {
        const peers = peerManager.getPeersSnapshot();
        for (const p of peers) {
            if (p.status === "offline") {
                wsClient.connectToPeer(p.ip).catch(() => { });
            }
        }
    }, 20_000);
    // ✅ Resume / suspend handling
    electron_1.powerMonitor.on("resume", () => {
        console.log("[POWER] resume detected, reconnecting...");
        const peers = peerManager.getPeersSnapshot();
        for (const p of peers) {
            wsClient.connectToPeer(p.ip).catch(() => { });
        }
    });
    electron_1.powerMonitor.on("suspend", () => {
        console.log("[POWER] suspend detected");
    });
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
electron_1.ipcMain.handle("msg:send", async (_evt, payload) => {
    await wsClient.sendReliable(payload.toUserId, {
        kind: "CHAT",
        text: payload.text,
    });
    return true;
});
