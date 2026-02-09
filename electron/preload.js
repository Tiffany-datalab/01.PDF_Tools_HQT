import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // 功能選單事件
  onMenuAction: (callback) => ipcRenderer.on("menu-action", callback),
  onTaskStart: (callback) => ipcRenderer.on("task-start", callback),
  onTaskProgress: (callback) => ipcRenderer.on("task-progress", callback),
  onTaskDone: (callback) => ipcRenderer.on("task-done", callback),

  // 選擇資料夾
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  // 選擇檔案
  selectFile: () => ipcRenderer.invoke("select-file"),

  // 通用 IPC 呼叫
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
