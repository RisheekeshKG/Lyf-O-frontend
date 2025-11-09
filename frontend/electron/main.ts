import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs/promises";
import fsSync from "fs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 🌱 Define app root (frontend folder)
process.env.APP_ROOT = path.join(__dirname, "..");

console.log("🔧 __dirname =", __dirname);
console.log("🔧 process.env.APP_ROOT =", process.env.APP_ROOT);

// 🚧 Avoid vite define plugin issues
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

// 🌍 Debug info
console.log("🌍 ENV CHECK:");
console.log("   VITE_DEV_SERVER_URL =", VITE_DEV_SERVER_URL);
console.log("   MAIN_DIST =", MAIN_DIST);
console.log("   RENDERER_DIST =", RENDERER_DIST);
console.log("   VITE_PUBLIC =", process.env.VITE_PUBLIC);

let win: BrowserWindow | null;

// 🧩 Detect environment
const IS_DEV = Boolean(VITE_DEV_SERVER_URL);
console.log("🔎 Running mode:", IS_DEV ? "DEV" : "PROD");

// ✅ Use frontend/data in dev, userData/data in prod
const DEV_DATA_DIR = path.resolve(process.env.APP_ROOT!, "../frontend/data");
const PROD_DATA_DIR = path.join(app.getPath("userData"), "data");
const DATA_DIR = IS_DEV ? DEV_DATA_DIR : PROD_DATA_DIR;

console.log("📁 DEV_DATA_DIR =", DEV_DATA_DIR);
console.log("📁 PROD_DATA_DIR =", PROD_DATA_DIR);
console.log("📁 Active DATA_DIR =", DATA_DIR);

// === Ensure data dir exists ===
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`📂 Ensured data dir: ${DATA_DIR}`);

    if (!fsSync.existsSync(DATA_DIR)) {
      console.warn("⚠️ Data folder not found!");
    } else {
      console.log("📄 Files in data dir:", fsSync.readdirSync(DATA_DIR));
    }
  } catch (err) {
    console.error("❌ Failed to create data dir:", err);
  }
}

// === Resolve preload ===
function resolvePreloadPath() {
  const possiblePaths = [
    path.join(__dirname, "preload.js"),
    path.join(__dirname, "../dist-electron/preload.js"),
    path.join(__dirname, "../../frontend/dist-electron/preload.js"),
  ];

  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      console.log("⚙️ Using preload script:", p);
      return p;
    }
  }

  console.error("❌ No valid preload script found!");
  return possiblePaths[0];
}

// === Create Window ===
function createWindow() {
  console.log("🚪 Creating main window...");
  const preloadPath = resolvePreloadPath();

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, "electron-vite.svg"),
    width: 1000,
    height: 700,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("did-finish-load", () => {
    console.log("✅ Renderer finished loading.");
    win?.webContents.send(
      "fromMain",
      `👋 Hello from main process! (${IS_DEV ? "DEV" : "PROD"})`
    );
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }

  win.on("closed", () => {
    win = null;
  });
}

// === Lifecycle ===
app.whenReady().then(async () => {
  await ensureDataDir();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===================================================
// 🗂️ FILE SYSTEM IPC HANDLERS
// ===================================================

// 📂 Read directory
ipcMain.handle("readDir", async (_event, relativeDir?: string) => {
  console.log("📂 IPC → readDir called with:", relativeDir);
  try {
    const fullPath = relativeDir ? path.join(DATA_DIR, relativeDir) : DATA_DIR;
    const files = await fs.readdir(fullPath, { withFileTypes: true });
    const fileList = files.filter((f) => f.isFile()).map((f) => f.name);
    console.log("   Files found:", fileList);
    return fileList;
  } catch (error) {
    console.error("❌ Error reading directory:", error);
    return [];
  }
});

// 📖 Read file
ipcMain.handle("readFile", async (_event, filename: string) => {
  try {
    const safeName = path.basename(filename);
    const filePath = path.join(DATA_DIR, safeName);
    const data = await fs.readFile(filePath, "utf-8");
    console.log("📖 Read file:", filePath);
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error reading file ${filename}:`, error);
    return null;
  }
});

// 💾 Write file
ipcMain.handle("writeFile", async (_event, filename: string, content: string) => {
  try {
    const safeName = path.basename(filename);
    const filePath = path.join(DATA_DIR, safeName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`💾 Wrote file: ${filePath}`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ Error writing file ${filename}:`, error);
    return { success: false, error: error.message };
  }
});

// 🗑️ Delete file
ipcMain.handle("deleteFile", async (_event, filename: string) => {
  console.log("🗑️ IPC → deleteFile called:", filename);
  try {
    const safeName = path.basename(filename);
    const filePath = path.join(DATA_DIR, safeName);

    if (!fsSync.existsSync(filePath)) {
      console.warn(`⚠️ File not found: ${filePath}`);
      return { success: false, error: "File not found" };
    }

    await fs.unlink(filePath);
    console.log(`✅ Deleted file: ${filePath}`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ Error deleting file ${filename}:`, error);
    return { success: false, error: error.message };
  }
});
