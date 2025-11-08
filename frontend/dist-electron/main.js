import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs/promises";
createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
ipcMain.handle("readFile", async (_event, filename) => {
  try {
    const filePath = path.join(process.env.APP_ROOT, "src", "data", filename);
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filename}:`, error);
    return null;
  }
});
ipcMain.handle("readDir", async (_event, dirPath) => {
  try {
    const fullPath = path.join(process.env.APP_ROOT, "src", dirPath);
    const files = await fs.readdir(fullPath);
    return files;
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
});
ipcMain.handle("writeFile", async (_event, filename, content) => {
  try {
    const filePath = path.join(process.env.APP_ROOT, "src", "data", filename);
    console.log("Writing to file:", filePath);
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    console.log("Successfully wrote to file:", filename);
    const written = await fs.readFile(filePath, "utf-8");
    const writtenContent = JSON.parse(written);
    console.log("Verification - File contents:", JSON.stringify(writtenContent));
    const parsedContent = JSON.parse(content);
    if (JSON.stringify(writtenContent) !== JSON.stringify(parsedContent)) {
      throw new Error("File verification failed - written content does not match expected content");
    }
    return true;
  } catch (error) {
    console.error(`Error writing file ${filename}:`, error);
    console.error("Full path:", path.join(process.env.APP_ROOT, "src", "data", filename));
    throw error;
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
