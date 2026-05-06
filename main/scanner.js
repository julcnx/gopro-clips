const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')

let watcher = null

// Watch /Volumes for new mounts with a DCIM folder (macOS)
function startWatching(onDetect) {
  const volumesPath = '/Volumes'
  if (!fs.existsSync(volumesPath)) return

  watcher = chokidar.watch(volumesPath, {
    depth: 1,
    ignoreInitial: false,
    ignored: /(^|[/\\])\../,
  })

  watcher.on('addDir', (dirPath) => {
    if (dirPath === volumesPath) return
    const dcim = path.join(dirPath, 'DCIM')
    if (fs.existsSync(dcim)) {
      onDetect(dcim)
    }
  })
}

function stopWatching() {
  watcher?.close()
  watcher = null
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

module.exports = { startWatching, stopWatching, scanFolder }
