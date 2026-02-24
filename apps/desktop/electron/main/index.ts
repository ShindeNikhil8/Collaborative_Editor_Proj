import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import path from "path";

import { startWsNode } from "../services/ws/node";
import { getProfile, saveProfile, clearProfile } from "../services/store/profileStore";
import { createPeerManager } from "../services/ws/peerManager";
import { createWsClient } from "../services/ws/wsClient";
import { loadKnownPeers } from "../services/store/peersStore";

import { loadChatHistory, clearChatHistory, appendChatMessage } from "../services/store/chatStore";
import { profileToIdentity } from "../services/ws/protocol";

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

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  startWsNode({ port: WS_PORT, peerManager, wsClient });

  createWindow();

  const known = loadKnownPeers();
  for (const p of known) peerManager.upsertPeer(p, { status: "offline" });
  for (const p of known) wsClient.connectToPeer(p.ip).catch(() => {});

  // reconnect after sleep
  powerMonitor.on("resume", () => {
    const peers = peerManager.getAllPeerIdentities();
    for (const p of peers) wsClient.connectToPeer(p.ip).catch(() => {});
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

// history
ipcMain.handle("chat:history:get", async () => loadChatHistory());
ipcMain.handle("chat:history:clear", async () => {
  clearChatHistory();
  return true;
});

// DM send (queues if offline)
ipcMain.handle("chat:dm:send", async (_evt, payload: { toUserId: string; text: string }) => {
  const msgId = await wsClient.sendDM(payload.toUserId, payload.text);

  const prof = getProfile();
  if (prof) {
    appendChatMessage({
      msgId,
      ts: Date.now(),
      from: profileToIdentity(prof),
      payload: { kind: "CHAT", text: payload.text, scope: "DM", toUserId: payload.toUserId },
      direction: "out",
    });
  }
  return msgId;
});

// PUBLIC send (queues to everyone)
ipcMain.handle("chat:public:send", async (_evt, payload: { text: string }) => {
  const groupId = await wsClient.sendPublic(payload.text);

  const prof = getProfile();
  if (prof) {
    appendChatMessage({
      msgId: groupId,
      ts: Date.now(),
      from: profileToIdentity(prof),
      payload: { kind: "CHAT", text: payload.text, scope: "PUBLIC", groupId },
      direction: "out",
    });
  }
  return groupId;
});