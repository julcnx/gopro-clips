const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const { Readable } = require('stream')
const scanner = require('./scanner')
const ffmpeg = require('./ffmpeg')

const isDev = process.env.NODE_ENV !== 'production'

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } },
])

let mainWindow
let detectedSdPath = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1a1a1a',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (detectedSdPath) {
      mainWindow?.webContents.send('sd-card-detected', detectedSdPath)
    }
  })
}

app.whenReady().then(() => {
  // Serve local files via custom scheme so file:// cross-origin is not an issue.
  // Must handle range requests so video seeking works.
  protocol.handle('local-file', async (request) => {
    // Without standard:true, URL is opaque: local-file:///abs/path -> /abs/path after stripping scheme+double-slash
    const filePath = decodeURIComponent(request.url.slice('local-file://'.length))
    console.log('[protocol] path:', filePath, 'range:', request.headers.get('range'))

    let stat
    try { stat = await fs.promises.stat(filePath) } catch { return new Response(null, { status: 404 }) }

    const mime = /\.(lrv|mp4)$/i.test(filePath) ? 'video/mp4' : 'application/octet-stream'
    const rangeHeader = request.headers.get('range')

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-')
      const start = parseInt(startStr, 10)
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1
      const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end }))
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(end - start + 1),
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const stream = Readable.toWeb(fs.createReadStream(filePath))
    return new Response(stream, {
      headers: {
        'Content-Length': String(stat.size),
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      },
    })
  })

  createWindow()

  const notifySdCardDetected = (sdPath) => {
    detectedSdPath = sdPath
    if (mainWindow?.webContents.isLoading()) return
    mainWindow?.webContents.send('sd-card-detected', sdPath)
  }

  for (const mountedSdPath of scanner.listMacDcimPaths()) {
    notifySdCardDetected(mountedSdPath)
  }

  scanner.startWatching((sdPath) => {
    notifySdCardDetected(sdPath)
  })
})

app.on('window-all-closed', () => {
  scanner.stopWatching()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// IPC: scan a folder for GoPro clips
ipcMain.handle('scan-folder', async (_event, folderPath) => {
  return scanner.scanFolder(folderPath)
})

// IPC: open folder picker dialog
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC: pick export output folder
ipcMain.handle('pick-export-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    message: 'Choose export destination',
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC: get video duration via ffprobe
ipcMain.handle('get-duration', async (_event, filePath) => {
  return ffmpeg.getDuration(filePath)
})

// IPC: delete all files belonging to a recording from disk
ipcMain.handle('delete-recording', async (_event, recording) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Delete', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `Delete recording ${recording.recordingId} from SD card?`,
    detail: 'This will permanently delete all chapter files. This cannot be undone.',
  })
  if (response !== 0) return { deleted: false }

  const allFiles = [
    ...recording.chapters.map((c) => c.path),
    ...recording.lrvChapters.map((c) => c.path),
  ]
  for (const filePath of allFiles) {
    try { fs.unlinkSync(filePath) } catch {}
  }
  return { deleted: true }
})

// IPC: export queue items
ipcMain.handle('export-items', async (_event, items, outputFolder) => {
  const results = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    mainWindow?.webContents.send('export-progress', { index: i, total: items.length, status: 'processing', item })
    try {
      const outPath = await ffmpeg.exportItem(item, outputFolder)
      results.push({ ok: true, outPath })
    } catch (err) {
      results.push({ ok: false, error: err.message })
    }
    mainWindow?.webContents.send('export-progress', { index: i, total: items.length, status: 'done', item })
  }
  return results
})
