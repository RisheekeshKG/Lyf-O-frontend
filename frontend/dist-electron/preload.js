"use strict";
const electron = require("electron");
console.log("🔌 [Preload] Script loaded. Injecting APIs...");
const validInvokes = [
  // File system
  "readDir",
  "readFile",
  "writeFile",
  "deleteFile",
  // Gmail integration
  "gmail-auth",
  "gmail-exchange",
  "gmail-list",
  "gmail-get-message",
  "gmail-signout",
  "gmail-check-auth"
];
console.log("📡 [Preload] Allowed IPC channels:", validInvokes);
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // ---- invoke (async calls to main) ----
  invoke: (channel, ...args) => {
    console.log(`[Preload → Renderer] invoke("${channel}")`, args);
    if (!validInvokes.includes(channel)) {
      const msg = `[Preload] ❌ Blocked invalid channel: ${channel}`;
      console.warn(msg);
      return Promise.reject(new Error("Invalid channel"));
    }
    return electron.ipcRenderer.invoke(channel, ...args);
  },
  // ---- onMainMessage (listen to async messages from main) ----
  onMainMessage: (cb) => {
    console.log("[Preload] Listening for 'fromMain' messages...");
    electron.ipcRenderer.on("fromMain", (_e, m) => {
      console.log("📬 [Main → Renderer] Message:", m);
      cb(m);
    });
  },
  // ---- removeMainListener ----
  removeMainListener: () => {
    console.log("[Preload] Removed all 'fromMain' listeners.");
    electron.ipcRenderer.removeAllListeners("fromMain");
  }
});
console.log("✅ [Preload] electronAPI successfully injected.");
