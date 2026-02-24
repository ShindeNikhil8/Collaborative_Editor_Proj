import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import path from "path";
import { startWsNode } from "../services/ws/node";
import { getProfile, saveProfile, clearProfile } from "../services/store/profileStore";
import { createPeerManager } from "../services/ws/peerManager";
import { createWsClient } from "../services/ws/wsClient";
import { loadKnownPeers } from "../services/store/peersStore";

const DEV_URL = "http://localhost:5173";
const WS_PORT = 3002;

let mainWindow: BrowserWindow | null = null;

const peerManager = createPeerManager(() => mainWindow);
const wsClient = createWsClient(peerManager);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(DEV_URL);

  // DevTools only in dev
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  // Start WS node
  startWsNode({ port: WS_PORT, peerManager, wsClient });

  // Create window first (so peer updates can reach UI)
  createWindow();

  // Load known peers and show them offline initially
  const known = loadKnownPeers();
  for (const p of known) {
    peerManager.upsertPeer(p, { status: "offline" });
  }

  // Auto reconnect on startup
  for (const p of known) {
    wsClient.connectToPeer(p.ip).catch(() => {});
  }

  // ✅ Heartbeat: ping everyone every 15 seconds
  setInterval(() => {
    const profile = getProfile();
    if (!profile) return;
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
        wsClient.connectToPeer(p.ip).catch(() => {});
      }
    }
  }, 20_000);

  // ✅ Resume / suspend handling
  powerMonitor.on("resume", () => {
    console.log("[POWER] resume detected, reconnecting...");
    const peers = peerManager.getPeersSnapshot();
    for (const p of peers) {
      wsClient.connectToPeer(p.ip).catch(() => {});
    }
  });

  powerMonitor.on("suspend", () => {
    console.log("[POWER] suspend detected");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC
ipcMain.handle("app:ping", async () => "pong");
ipcMain.handle("profile:get", async () => getProfile());

ipcMain.handle("profile:save", async (_evt, payload: { name: string; email: string; ip: string }) => {
  if (!payload?.name?.trim()) throw new Error("Name required");
  if (!payload?.email?.trim()) throw new Error("Email required");
  if (!payload?.ip?.trim()) throw new Error("IP required");

  return saveProfile({
    name: payload.name.trim(),
    email: payload.email.trim(),
    ip: payload.ip.trim(),
  });
});

ipcMain.handle("profile:clear", async () => {
  clearProfile();
  return true;
});

ipcMain.handle("peers:get", async () => peerManager.getPeersSnapshot());

ipcMain.handle("network:connect", async (_evt, payload: { ip: string }) => {
  await wsClient.connectToPeer(payload.ip);
  return true;
});

ipcMain.handle("msg:send", async (_evt, payload: { toUserId: string; text: string }) => {
  await wsClient.sendReliable(payload.toUserId, {
    kind: "CHAT",
    text: payload.text,
  });
  return true;
});