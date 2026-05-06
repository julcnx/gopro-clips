const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')

const WINDOWS_DRIVE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

let watcher = null
let pollTimer = null
let knownDcimPaths = new Set()
const MAC_VOLUMES_PATH = '/Volumes'

function getDcimPathForMount(mountPath, existsSync = fs.existsSync, pathModule = path) {
  const dcimPath = pathModule.join(mountPath, 'DCIM')
  return existsSync(dcimPath) ? dcimPath : null
}

function listWindowsDcimPaths(existsSync = fs.existsSync) {
  return WINDOWS_DRIVE_LETTERS
    .map((letter) => getDcimPathForMount(`${letter}:\\`, existsSync, path.win32))
    .filter(Boolean)
}

function startWatching(onDetect) {
  stopWatching()

  if (process.platform === 'darwin') {
    startWatchingMacVolumes(onDetect)
    return
  }

  if (process.platform === 'win32') {
    startWatchingWindowsVolumes(onDetect)
  }
}

function startWatchingMacVolumes(onDetect) {
  if (!fs.existsSync(MAC_VOLUMES_PATH)) return

  watcher = chokidar.watch(MAC_VOLUMES_PATH, {
    depth: 1,
    ignoreInitial: false,
    ignored: /(^|[/\\])\../,
  })

  watcher.on('addDir', (dirPath) => {
    if (dirPath === MAC_VOLUMES_PATH) return
    const dcimPath = getDcimPathForMount(dirPath)
    if (dcimPath) {
      onDetect(dcimPath)
    }
  })
}

function listMacDcimPaths(existsSync = fs.existsSync, readdirSync = fs.readdirSync, pathModule = path) {
  if (!existsSync(MAC_VOLUMES_PATH)) return []

  try {
    return readdirSync(MAC_VOLUMES_PATH, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => getDcimPathForMount(pathModule.join(MAC_VOLUMES_PATH, entry.name), existsSync, pathModule))
      .filter(Boolean)
  } catch {
    return []
  }
}

function startWatchingWindowsVolumes(onDetect) {
  const poll = () => {
    const nextDcimPaths = new Set(listWindowsDcimPaths())

    for (const dcimPath of nextDcimPaths) {
      if (!knownDcimPaths.has(dcimPath)) {
        onDetect(dcimPath)
      }
    }

    knownDcimPaths = nextDcimPaths
  }

  poll()
  pollTimer = setInterval(poll, 3000)
}

function stopWatching() {
  watcher?.close()
  watcher = null
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  knownDcimPaths = new Set()
}

// Scan a folder (DCIM root or subfolder) for GoPro MP4/LRV files
// Groups chapters into logical clips by the last 4 digits of filename
function scanFolder(folderPath) {
  const recordings = {}

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const parsed = parseGoProFilename(entry.name)
        if (!parsed) continue

        const { recordingId, chapter, ext } = parsed
        if (!recordings[recordingId]) {
          recordings[recordingId] = { recordingId, chapters: [], lrvChapters: [] }
        }
        if (ext === 'MP4') {
          recordings[recordingId].chapters.push({ chapter, path: fullPath })
        } else if (ext === 'LRV') {
          recordings[recordingId].lrvChapters.push({ chapter, path: fullPath })
        }
      }
    }
  }

  walk(folderPath)

  return Object.values(recordings)
    .filter((r) => r.chapters.length > 0)
    .map((r) => {
      r.chapters.sort((a, b) => a.chapter - b.chapter)
      r.lrvChapters.sort((a, b) => a.chapter - b.chapter)
      return r
    })
    .sort((a, b) => a.recordingId.localeCompare(b.recordingId))
}

// Parse GoPro filename: GH010123.MP4
// Returns { clipId: '0123', chapter: 1, ext: 'MP4' } or null
function parseGoProFilename(filename) {
  // GoPro Hero: GH<chapter><clipId>.<ext>
  // Also handles GL (Live), GX (H.265 Hero 8+)
  const match = filename.match(/^G[HLX](\d{2})(\d{4})\.(MP4|LRV|THM|360)$/i)
  if (!match) return null
  return {
    chapter: parseInt(match[1], 10),
    recordingId: match[2],
    ext: match[3].toUpperCase(),
  }
}

module.exports = {
  startWatching,
  stopWatching,
  scanFolder,
  getDcimPathForMount,
  listMacDcimPaths,
  listWindowsDcimPaths,
}
