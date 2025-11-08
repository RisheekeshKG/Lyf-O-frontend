import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'fs/promises'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// File operations
ipcMain.handle('readFile', async (_event, filename: string) => {
  try {
    const filePath = path.join(process.env.APP_ROOT!, 'src', 'data', filename);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filename}:`, error);
    return null;
  }
});

// Directory reading
ipcMain.handle('readDir', async (_event, dirPath: string) => {
  try {
    const fullPath = path.join(process.env.APP_ROOT!, 'src', dirPath);
    const files = await fs.readdir(fullPath);
    return files;
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
});

ipcMain.handle('writeFile', async (_event, filename: string, content: string) => {
  try {
    const filePath = path.join(process.env.APP_ROOT!, 'src', 'data', filename);
    console.log('Writing to file:', filePath);
    
    // Ensure the directory exists
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    
    // Write the file
    await fs.writeFile(filePath, content, 'utf-8');
    console.log('Successfully wrote to file:', filename);
    
    // Verify the file was written
    const written = await fs.readFile(filePath, 'utf-8');
    const writtenContent = JSON.parse(written);
    console.log('Verification - File contents:', JSON.stringify(writtenContent));
    
    // Verify the written content matches what we tried to write
    const parsedContent = JSON.parse(content);
    if (JSON.stringify(writtenContent) !== JSON.stringify(parsedContent)) {
      throw new Error('File verification failed - written content does not match expected content');
    }
    
    return true;
  } catch (error) {
    console.error(`Error writing file ${filename}:`, error);
    console.error('Full path:', path.join(process.env.APP_ROOT!, 'src', 'data', filename));
    throw error; // Propagate error to renderer process for better error handling
  }
});

app.whenReady().then(createWindow);
