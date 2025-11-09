import { app, BrowserWindow, ipcMain, shell } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs/promises";
import fsSync from "fs";
import dotenv from "dotenv";
import { google } from "googleapis";
import keytar from "keytar";
import { createServer } from "http";
import open from "open";
import serverDestroy from "server-destroy"; // ✅ fixed import typing

// ===================================================
// 🌱 BASE SETUP
// ===================================================

dotenv.config({ path: path.join(process.cwd(), ".env") });

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
const IS_DEV = Boolean(VITE_DEV_SERVER_URL);

// === Data Folder ===
const DEV_DATA_DIR = path.resolve(process.env.APP_ROOT!, "../frontend/data");
const PROD_DATA_DIR = path.join(app.getPath("userData"), "data");
const DATA_DIR = IS_DEV ? DEV_DATA_DIR : PROD_DATA_DIR;

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`📂 Ensured data dir: ${DATA_DIR}`);
  } catch (err) {
    console.error("❌ Failed to create data dir:", err);
  }
}

function resolvePreloadPath() {
  const paths = [
    path.join(__dirname, "preload.js"),
    path.join(__dirname, "../dist-electron/preload.js"),
    path.join(__dirname, "../../frontend/dist-electron/preload.js"),
  ];
  for (const p of paths) if (fsSync.existsSync(p)) return p;
  console.warn("⚠️ No preload.js found, fallback used");
  return paths[0];
}

function createWindow() {
  const preloadPath = resolvePreloadPath();
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, "electron-vite.svg"),
    width: 1100,
    height: 750,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("fromMain", `👋 Hello from main (${IS_DEV ? "DEV" : "PROD"})`);
  });

  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(RENDERER_DIST, "index.html"));

  win.on("closed", () => (win = null));
}

app.whenReady().then(async () => {
  await ensureDataDir();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===================================================
// 🗂️ FILE SYSTEM HANDLERS
// ===================================================

ipcMain.handle("readDir", async () => {
  try {
    const files = await fs.readdir(DATA_DIR, { withFileTypes: true });
    return files.filter((f) => f.isFile()).map((f) => f.name);
  } catch (error) {
    console.error("❌ readDir error:", error);
    return [];
  }
});

ipcMain.handle("readFile", async (_e, filename: string) => {
  try {
    const safe = path.basename(filename);
    const data = await fs.readFile(path.join(DATA_DIR, safe), "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("❌ readFile error:", error);
    return null;
  }
});

ipcMain.handle("writeFile", async (_e, filename: string, content: string) => {
  try {
    const safe = path.basename(filename);
    await fs.writeFile(path.join(DATA_DIR, safe), content, "utf-8");
    return { success: true };
  } catch (err: any) {
    console.error("❌ writeFile error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("deleteFile", async (_e, filename: string) => {
  try {
    const safe = path.basename(filename);
    const filePath = path.join(DATA_DIR, safe);
    if (!fsSync.existsSync(filePath)) return { success: false, error: "File not found" };
    await fs.unlink(filePath);
    console.log(`🗑️ Deleted file: ${filePath}`);
    return { success: true };
  } catch (err: any) {
    console.error("❌ deleteFile error:", err);
    return { success: false, error: err.message };
  }
});

// ===================================================
// 📬 GMAIL INTEGRATION (Loopback OAuth)
// ===================================================

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const OAUTH_SERVICE = "electron-gmail";
const OAUTH_ACCOUNT = "gmail-token";

function createOAuthClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = "http://127.0.0.1:3000";

  if (!id || !secret) throw new Error("❌ Missing Google OAuth credentials in .env");
  return new google.auth.OAuth2(id, secret, redirectUri);
}

async function storeTokens(tokens: any) {
  await keytar.setPassword(OAUTH_SERVICE, OAUTH_ACCOUNT, JSON.stringify(tokens));
}
async function loadTokens() {
  const s = await keytar.getPassword(OAUTH_SERVICE, OAUTH_ACCOUNT);
  return s ? JSON.parse(s) : null;
}
async function clearTokens() {
  await keytar.deletePassword(OAUTH_SERVICE, OAUTH_ACCOUNT);
}

// === Step 1: OAuth Flow ===
ipcMain.handle("gmail-auth", async () => {
  try {
    const oAuth2Client = createOAuthClient();
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GMAIL_SCOPES,
      prompt: "consent",
    });

    const server = createServer(async (req, res) => {
      if (!req.url?.includes("/?code=")) return;

      const qs = new URL(req.url, "http://127.0.0.1:3000");
      const code = qs.searchParams.get("code");
      if (!code) return;

      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        await storeTokens(tokens);

        res.end("✅ Authentication successful! You may close this tab.");
        console.log("✅ Gmail tokens saved successfully.");
      } catch (err) {
        console.error("❌ Token exchange failed:", err);
        res.end("❌ Authentication failed. Check console for details.");
      } finally {
        setTimeout(() => {
          if (server.listening) server.destroy(); // ✅ Properly typed now
        }, 500);
      }
    });

    serverDestroy(server); // ✅ Patch server to include destroy()
    server.listen(3000, () => {
      console.log("🌐 Listening for OAuth redirect on http://127.0.0.1:3000");
      open(authUrl);
    });

    return { success: true, message: "OAuth flow started." };
  } catch (err: any) {
    console.error("gmail-auth error:", err);
    return { success: false, error: err.message };
  }
});

// === Step 2: Check Auth ===
ipcMain.handle("gmail-check-auth", async () => {
  try {
    const tokens = await loadTokens();
    return { authorized: !!tokens };
  } catch (err: any) {
    return { authorized: false, error: err.message };
  }
});

// === Step 3: List Messages ===
ipcMain.handle("gmail-list", async (_e, maxResults = 20) => {
  try {
    const tokens = await loadTokens();
    if (!tokens) throw new Error("No tokens found. Please sign in first.");

    const oAuth2Client = createOAuthClient();
    oAuth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const res = await gmail.users.messages.list({ userId: "me", maxResults });
    const msgs = res.data.messages || [];

    const details = await Promise.all(
      msgs.map(async (m) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        return {
          id: m.id,
          snippet: detail.data.snippet,
          headers: detail.data.payload?.headers || [],
        };
      })
    );

    return { success: true, messages: details };
  } catch (err: any) {
    console.error("gmail-list error:", err);
    return { success: false, error: err.message };
  }
});

// === Step 4: Sign Out ===
ipcMain.handle("gmail-signout", async () => {
  try {
    await clearTokens();
    return { success: true };
  } catch (err: any) {
    console.error("gmail-signout error:", err);
    return { success: false, error: err.message };
  }
});

console.log("✅ Gmail IPC (Loopback OAuth) channels loaded successfully.");
