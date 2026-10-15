const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path
const ffmpegFluent = require('fluent-ffmpeg')
const path = require('path')
const fs = require('fs')

ffmpegFluent.setFfmpegPath(ffmpegPath)
ffmpegFluent.setFfprobePath(ffprobePath)

// Exported clips are re-encoded to HEVC targeting at most TARGET_SIZE
// (hardware encoder on macOS, libx265 elsewhere)
const TARGET_SIZE = 23 * 1048576
const AUDIO_BITRATE = 128000
const MAX_VIDEO_BITRATE = 6000000
const VIDEO_CODEC = process.platform === 'darwin' ? 'hevc_videotoolbox' : 'libx265'

function getDuration(filePath) {
  return new Promise((resolve) => {
    ffmpegFluent.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) return resolve(0)
      resolve(metadata.format.duration)
    })
  })
}

// Format seconds as 00h00m00s for filenames
function formatTimecode(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`
}

async function exportItem(item, outputFolder) {
  fs.mkdirSync(outputFolder, { recursive: true })

  if (item.type === 'snapshot') {
    return exportSnapshot(item, outputFolder)
  } else if (item.type === 'segment') {
    return exportSegment(item, outputFolder)
  }
  throw new Error(`Unknown export type: ${item.type}`)
}

function exportSnapshot(item, outputFolder) {
  const tc = formatTimecode(item.time)
  const outName = `clip${item.recordingId}_${tc}.jpg`
  const outPath = path.join(outputFolder, outName)

  return new Promise((resolve, reject) => {
    ffmpegFluent(item.chapterPath)
      .setFfmpegPath(ffmpegPath)
      .seekInput(item.chapterOffset)
      .frames(1)
      .output(outPath)
      .on('end', () => resolve(outPath))
      .on('error', reject)
      .run()
  })
}

async function exportSegment(item, outputFolder) {
  const inTc = formatTimecode(item.inPoint)
  const outTc = formatTimecode(item.outPoint)

  if (!item.crossesChapterBoundary) {
    const outName = `clip${item.recordingId}_${inTc}-${outTc}.mp4`
    const outPath = path.join(outputFolder, outName)
    const duration = item.outPoint - item.inPoint

    await new Promise((resolve, reject) => {
      ffmpegFluent(item.inChapterPath)
        .setFfmpegPath(ffmpegPath)
        .seekInput(item.inChapterOffset)
        .duration(duration)
        .outputOptions(['-c copy'])
        .output(outPath)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })
    await compress(outPath)
    return outPath
  }

  // Cross-chapter: export two files
  return exportCrossChapterSegment(item, outputFolder, inTc, outTc)
}

async function exportCrossChapterSegment(item, outputFolder, inTc, outTc) {
  const part1Name = `clip${item.recordingId}_${inTc}-${outTc}_part1.mp4`
  const part2Name = `clip${item.recordingId}_${inTc}-${outTc}_part2.mp4`
  const part1Path = path.join(outputFolder, part1Name)
  const part2Path = path.join(outputFolder, part2Name)

  // Part 1: from inChapterOffset to end of that chapter
  await new Promise((resolve, reject) => {
    ffmpegFluent(item.inChapterPath)
      .setFfmpegPath(ffmpegPath)
      .seekInput(item.inChapterOffset)
      .outputOptions(['-c copy'])
      .output(part1Path)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })

  // Part 2: from start of next chapter to outChapterOffset
  await new Promise((resolve, reject) => {
    ffmpegFluent(item.outChapterPath)
      .setFfmpegPath(ffmpegPath)
      .duration(item.outChapterOffset)
      .outputOptions(['-c copy'])
      .output(part2Path)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })

  await compress(part1Path)
  await compress(part2Path)
  return [part1Path, part2Path].join(', ')
}

// Compress a file in place, keeping the original if encoding fails or
// doesn't make it smaller
async function compress(filePath) {
  const oldSize = fs.statSync(filePath).size
  const duration = await getDuration(filePath)
  if (!duration) return
  let videoBitrate = Math.min(Math.floor((TARGET_SIZE * 8) / duration - AUDIO_BITRATE), MAX_VIDEO_BITRATE)
  const shortSide = videoBitrate < 1500000 ? 720 : 1080
  videoBitrate = Math.max(videoBitrate, 300000)
  const vf = `scale='if(gte(iw,ih),-2,min(${shortSide},iw))':'if(gte(iw,ih),min(${shortSide},ih),-2)',format=yuv420p`

  const tmpPath = filePath.replace(/\.mp4$/, '.tmp.mp4')
  try {
    await new Promise((resolve, reject) => {
      ffmpegFluent(filePath)
        .setFfmpegPath(ffmpegPath)
        .outputOptions([
          '-vf', vf,
          '-c:v', VIDEO_CODEC,
          '-b:v', String(videoBitrate),
          '-tag:v', 'hvc1',
          '-c:a', 'aac',
          '-b:a', String(AUDIO_BITRATE),
          '-map_metadata', '0',
          '-movflags', '+faststart',
        ])
        .output(tmpPath)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })
  } catch (err) {
    fs.rmSync(tmpPath, { force: true })
    console.warn(`Compression failed, kept original: ${filePath}`, err.message)
    return
  }

  if (fs.statSync(tmpPath).size < oldSize) {
    fs.renameSync(tmpPath, filePath)
  } else {
    fs.rmSync(tmpPath, { force: true })
  }
}

module.exports = { getDuration, exportItem }
