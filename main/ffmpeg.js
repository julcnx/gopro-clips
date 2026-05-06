const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path
const ffmpegFluent = require('fluent-ffmpeg')
const path = require('path')
const fs = require('fs')

ffmpegFluent.setFfmpegPath(ffmpegPath)
ffmpegFluent.setFfprobePath(ffprobePath)

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

function exportSegment(item, outputFolder) {
  const inTc = formatTimecode(item.inPoint)
  const outTc = formatTimecode(item.outPoint)

  if (!item.crossesChapterBoundary) {
    const outName = `clip${item.recordingId}_${inTc}-${outTc}.mp4`
    const outPath = path.join(outputFolder, outName)
    const duration = item.outPoint - item.inPoint

    return new Promise((resolve, reject) => {
      ffmpegFluent(item.inChapterPath)
        .setFfmpegPath(ffmpegPath)
        .seekInput(item.inChapterOffset)
        .duration(duration)
        .outputOptions(['-c copy'])
        .output(outPath)
        .on('end', () => resolve(outPath))
        .on('error', reject)
        .run()
    })
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

  return [part1Path, part2Path].join(', ')
}

module.exports = { getDuration, exportItem }
