import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { startWsNode } from "../services/ws/node";
import { getProfile, saveProfile, clearProfile } from "../services/store/profileStore";
import { createPeerManager } from "../services/ws/peerManager";
import { createWsClient } from "../services/ws/wsClient";

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
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(DEV_URL);
  mainWindow.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(() => {
  // Start your distributed node (WS server + peer manager)
  startWsNode({ port: WS_PORT, peerManager });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Quick test IPC (we'll expand later)
ipcMain.handle("app:ping", async () => "pong");

ipcMain.handle("profile:get", async () => getProfile());

ipcMain.handle("profile:save", async (_evt, payload: { name: string; email: string; ip: string }) => {
  // Basic validation (keep strict!)
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