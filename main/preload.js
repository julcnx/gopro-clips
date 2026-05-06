const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gopro', {
  // SD card auto-detection
  onSdCardDetected: (cb) => ipcRenderer.on('sd-card-detected', (_e, path) => cb(path)),

  // Folder operations
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickExportFolder: () => ipcRenderer.invoke('pick-export-folder'),

  // Media info
  getDuration: (filePath) => ipcRenderer.invoke('get-duration', filePath),

  // Recording management
  deleteRecording: (recording) => ipcRenderer.invoke('delete-recording', recording),

  // Export
  exportItems: (items, outputFolder) => ipcRenderer.invoke('export-items', items, outputFolder),
  onExportProgress: (cb) => ipcRenderer.on('export-progress', (_e, data) => cb(data)),
  removeExportProgressListener: () => ipcRenderer.removeAllListeners('export-progress'),
})
