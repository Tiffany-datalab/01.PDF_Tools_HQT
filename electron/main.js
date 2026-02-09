/* Made by Tiffany-datalab */

import { app, BrowserWindow, Menu } from 'electron';
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { ipcMain, dialog } from "electron";
import log from 'electron-log';

// 設定 electron-log
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
// ⚠️ 禁止輸出到 console，只寫入 main.log
log.transports.console.level = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

/* ======================
   建立主視窗
====================== */
function createWindow() {
  log.info("🪟 createWindow: 開始建立瀏覽器視窗");

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  log.info("⚡ 預期載入的 preload 路徑:", path.join(__dirname, 'preload.js'));

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:1420');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/web/index.html'));
  }

  // ✅ 啟動後檢查更新
  mainWindow.webContents.once("did-finish-load", () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // ✅ 自訂選單
  const menu = Menu.buildFromTemplate([
    {
      label: '功能選單',
      submenu: [
        {
          label: '1. 報告改名',
          click: () => {
            mainWindow.webContents.send('menu-action', 'ocr');
            mainWindow.setTitle("PDF小工具 - 報告改名");
          }
        },
        {
          label: '2. 蓋電子章',
          click: () => {
            mainWindow.webContents.send('menu-action', 'stamp');
            mainWindow.setTitle("PDF小工具 - 蓋電子章");
          }
        },
      ]
    },
    {
      label: '開發者工具',
      click: () => {
        mainWindow.webContents.toggleDevTools();
      }
    }
  ]);
  Menu.setApplicationMenu(menu);
}

/* ======================
   自動更新必要事件
====================== */
autoUpdater.on('error', (err) => {
  log.error('更新錯誤:', err);
});
autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall(true, true);
  log.info('更新下載完成，將在關閉程式後安裝');
});

/* ======================
   單一實例鎖
====================== */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
  });
}

/* ======================
   IPC 事件：OCR 改名 & 蓋章
====================== */
function countPdfFiles(folderPath) {
  try {
    return fs.readdirSync(folderPath).filter((name) => name.toLowerCase().endsWith(".pdf")).length;
  } catch (err) {
    log.error(`掃描 PDF 數量失敗: ${folderPath}`, err);
    return 0;
  }
}

function parseResultLine(line) {
  const resultLine = line.startsWith("RESULT:") ? line.slice(7) : line;
  const [success, fail] = resultLine.split(",");
  const successNum = parseInt(success, 10);
  const failNum = parseInt(fail, 10);
  if (Number.isNaN(successNum) || Number.isNaN(failNum)) return null;
  return { success: successNum, fail: failNum };
}

function runPythonExe(baseName, args, eventSender, jobName, fallbackTotal) {
  return new Promise((resolve, reject) => {
    // dev 模式 → 用 .py；打包後 → 用 .exe
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath, "backend", "ocr_engine", `${baseName}.exe`)
      : path.join(__dirname, "../backend/ocr_engine", `${baseName}.py`);

    log.info(`執行: ${exePath} ${args.join(" ")}`);

    let stdoutBuffer = "";
    let result = null;
    const command = app.isPackaged ? exePath : "py";   // ✅ dev 用 py，release 用 exe
    const spawnArgs = app.isPackaged ? args : [exePath, ...args];

    const py = spawn(command, spawnArgs);

    const handleLine = (rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      if (line.startsWith("PROGRESS:")) {
        const progressText = line.slice("PROGRESS:".length);
        const [currentText, totalText] = progressText.split("/");
        const current = parseInt(currentText, 10);
        const total = parseInt(totalText, 10);
        const safeTotal = Number.isNaN(total) || total <= 0 ? fallbackTotal : total;
        if (!Number.isNaN(current) && safeTotal > 0) {
          eventSender.send("task-progress", {
            job: jobName,
            current,
            total: safeTotal,
            percent: Math.floor((current / safeTotal) * 100)
          });
        }
        return;
      }

      const parsed = parseResultLine(line);
      if (parsed) {
        result = parsed;
      }
    };

    py.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        handleLine(line);
      }
    });

    py.stderr.on("data", (data) => {
      log.error(data.toString());
    });

    py.on("error", (err) => {
      reject(err);
    });

    py.on("close", (code) => {
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
      }

      if (!result) {
        reject(new Error(`解析失敗: ${stdoutBuffer}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Python 程式結束代碼異常: ${code}`));
        return;
      }
      resolve(result);
    });
  });
}

// OCR 改名
ipcMain.handle("ocr-rename", async (event, reportType, folder) => {
  const total = countPdfFiles(folder);
  event.sender.send("task-start", { job: "ocr", total });
  const result = await runPythonExe("ocr_rename", [reportType, folder], event.sender, "ocr", total);
  event.sender.send("task-done", { job: "ocr", total, ...result });
  return result;
});

// 蓋電子章
ipcMain.handle("pdf-stamp", async (event, inputFolder, outputFolder, stampImg, yOffset) => {
  const total = countPdfFiles(inputFolder);
  event.sender.send("task-start", { job: "stamp", total });
  const result = await runPythonExe("pdf_stamp", [inputFolder, outputFolder, stampImg, String(yOffset)], event.sender, "stamp", total);
  event.sender.send("task-done", { job: "stamp", total, ...result });
  return result;
});

/* ======================
   IPC 事件：檔案 / 資料夾選擇
====================== */
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg"] }
    ]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

/* ======================
   App lifecycle
====================== */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
