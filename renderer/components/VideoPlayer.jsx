import React, { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import ProgressBar from './ProgressBar.jsx'
import './VideoPlayer.css'

function formatTimecode(seconds) {
  if (!isFinite(seconds)) return '0:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

const STEP_SIZES = [0.1, 0.5, 1, 3, 10, 30]
const DEFAULT_STEP_IDX = 2 // 1s

function formatStep(s) {
  return s < 1 ? `${s * 1000 | 0}ms` : `${s}s`
}

const VideoPlayer = forwardRef(function VideoPlayer(
  { recording, inPoint, onInPoint, onSnapshot, onSegment, onNextRecording, onPrevRecording },
  ref
) {
  const videoRef = useRef(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [chapterDurations, setChapterDurations] = useState([])
  const [globalTime, setGlobalTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [segments, setSegments] = useState([])
  const [snapshotTimes, setSnapshotTimes] = useState([])
  const [stepIdx, setStepIdx] = useState(DEFAULT_STEP_IDX)

  // Memoize so the chapter-load effect doesn't re-fire on every render
  const chapters = useMemo(
    () => recording?.lrvChapters?.length > 0 ? recording.lrvChapters : recording?.chapters ?? [],
    [recording]
  )

  // Reset on recording change
  useEffect(() => {
    if (!recording) return
    setChapterIndex(0)
    setChapterDurations([])
    setGlobalTime(0)
    setTotalDuration(0)
    setPlaying(false)
    setSegments([])
    setSnapshotTimes([])

    const chaps = recording.lrvChapters?.length > 0 ? recording.lrvChapters : recording.chapters
    // Fetch durations for all chapters
    async function fetchAll() {
      const durations = []
      for (const ch of chaps) {
        try {
          const d = await window.gopro.getDuration(ch.path)
          console.log('[duration]', ch.path, '->', d)
          durations.push(d)
        } catch (err) {
          console.warn('[duration] error for', ch.path, err)
          durations.push(0)
        }
      }
      console.log('[durations] total:', durations, durations.reduce((a, b) => a + b, 0))
      setChapterDurations(durations)
      setTotalDuration(durations.reduce((a, b) => a + b, 0))
    }
    fetchAll()
  }, [recording])

  // Load chapter into video element
  useEffect(() => {
    if (!chapters[chapterIndex]) return
    const video = videoRef.current
    if (!video) return
    const src = `local-file://${chapters[chapterIndex].path}`
    console.log('[video] setting src:', src)
    video.src = src
    video.load()
    if (playing) video.play()
  }, [chapterIndex, chapters])

  // Global time = sum of completed chapters + current chapter time
  const chapterOffset = chapterDurations.slice(0, chapterIndex).reduce((a, b) => a + b, 0)

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return
    const gt = chapterOffset + video.currentTime
    setGlobalTime(gt)
  }

  function handleEnded() {
    if (chapterIndex < chapters.length - 1) {
      setChapterIndex((i) => i + 1)
    } else {
      setPlaying(false)
    }
  }

  function handlePlayPause() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  function seekGlobal(targetGlobal) {
    if (!chapterDurations.length) return
    let acc = 0
    for (let i = 0; i < chapterDurations.length; i++) {
      if (targetGlobal < acc + chapterDurations[i] || i === chapterDurations.length - 1) {
        const localTime = targetGlobal - acc
        if (i !== chapterIndex) {
          setChapterIndex(i)
          // After load, seek
          const video = videoRef.current
          if (video) {
            video.addEventListener('loadedmetadata', function onLoad() {
              video.currentTime = Math.max(0, localTime)
              video.removeEventListener('loadedmetadata', onLoad)
            })
          }
        } else {
          const video = videoRef.current
          if (video) video.currentTime = Math.max(0, localTime)
        }
        return
      }
      acc += chapterDurations[i]
    }
  }

  function step(delta) {
    seekGlobal(Math.max(0, Math.min(totalDuration, globalTime + delta)))
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (!recording) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const stepSize = STEP_SIZES[stepIdx]

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          step(e.shiftKey ? -(stepSize * 5) : -stepSize)
          break
        case 'ArrowRight':
          e.preventDefault()
          step(e.shiftKey ? stepSize * 5 : stepSize)
          break
        case 'ArrowUp':
          e.preventDefault()
          setStepIdx((i) => Math.min(i + 1, STEP_SIZES.length - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setStepIdx((i) => Math.max(i - 1, 0))
          break
        case 'Tab':
          e.preventDefault()
          if (e.shiftKey) onPrevRecording()
          else onNextRecording()
          break
        case 'KeyD':
          e.preventDefault()
          if (inPoint === null) {
            onInPoint(globalTime)
          } else {
            const start = Math.min(inPoint, globalTime)
            const end = Math.max(inPoint, globalTime)
            if (start < end) addSegment(start, end)
            onInPoint(null)
          }
          break
        case 'KeyS':
          e.preventDefault()
          addSnapshot(globalTime)
          break
        case 'Escape':
          e.preventDefault()
          onInPoint(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recording, globalTime, inPoint, chapterDurations, chapterIndex, playing, stepIdx])

  function getChapterForGlobalTime(gt) {
    let acc = 0
    for (let i = 0; i < chapterDurations.length; i++) {
      if (gt < acc + chapterDurations[i] || i === chapterDurations.length - 1) {
        return { chapterIdx: i, localTime: gt - acc }
      }
      acc += chapterDurations[i]
    }
    return { chapterIdx: 0, localTime: gt }
  }

  function addSnapshot(gt) {
    if (!recording) return
    const { chapterIdx, localTime } = getChapterForGlobalTime(gt)
    const srcChapters = recording.chapters
    setSnapshotTimes((s) => [...s, gt])
    onSnapshot({
      type: 'snapshot',
      recordingId: recording.recordingId,
      chapterPath: srcChapters[chapterIdx]?.path,
      chapterOffset: localTime,
      time: gt,
      label: formatTimecode(gt),
    })
  }

  function addSegment(inGt, outGt) {
    if (!recording) return
    const { chapterIdx: inIdx, localTime: inLocal } = getChapterForGlobalTime(inGt)
    const { chapterIdx: outIdx, localTime: outLocal } = getChapterForGlobalTime(outGt)
    const srcChapters = recording.chapters
    const crosses = inIdx !== outIdx

    const seg = {
      type: 'segment',
      recordingId: recording.recordingId,
      inPoint: inGt,
      outPoint: outGt,
      inChapterPath: srcChapters[inIdx]?.path,
      inChapterOffset: inLocal,
      outChapterPath: srcChapters[outIdx]?.path,
      outChapterOffset: outLocal,
      crossesChapterBoundary: crosses,
      label: `${formatTimecode(inGt)} - ${formatTimecode(outGt)}`,
    }
    setSegments((s) => [...s, { inPoint: inGt, outPoint: outGt }])
    onSegment(seg)
  }

  if (!recording) {
    return (
      <div className="player-panel empty-state">
        Select a recording to start reviewing
      </div>
    )
  }

  return (
    <div className="player-panel">
      <div className="video-wrapper">
        <video
          ref={videoRef}
          className="video-el"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={handlePlayPause}
          onLoadedMetadata={(e) => console.log('[video] loadedmetadata duration:', e.target.duration)}
          onCanPlay={() => console.log('[video] canplay')}
          onError={(e) => console.error('[video] error:', e.target.error)}
          onStalled={() => console.warn('[video] stalled')}
        />
      </div>

      <ProgressBar
        currentTime={globalTime}
        duration={totalDuration}
        inPoint={inPoint}
        segments={segments}
        snapshots={snapshotTimes}
        onSeek={seekGlobal}
      />

      <div className="player-controls">
        <div className="timecodes">
          <span className="tc-current">{formatTimecode(globalTime)}</span>
          <span className="tc-sep">/</span>
          <span className="tc-total">{formatTimecode(totalDuration)}</span>
          {chapterDurations.length > 1 && (
            <span className="chapter-badge">ch {chapterIndex + 1}/{chapters.length}</span>
          )}
        </div>

        <div className="controls-center">
          <button className="ctrl-btn" onClick={() => step(-(STEP_SIZES[stepIdx] * 5))} title="−5× step (Shift+Left)">«</button>
          <button className="ctrl-btn" onClick={() => step(-STEP_SIZES[stepIdx])} title="−step (Left)">‹</button>
          <button className="ctrl-btn play-btn" onClick={handlePlayPause} title="Play/Pause (Space)">
            {playing ? '⏸' : '▶'}
          </button>
          <button className="ctrl-btn" onClick={() => step(STEP_SIZES[stepIdx])} title="+step (Right)">›</button>
          <button className="ctrl-btn" onClick={() => step(STEP_SIZES[stepIdx] * 5)} title="+5× step (Shift+Right)">»</button>
          <div className="step-control">
            <button className="step-adj" onClick={() => setStepIdx((i) => Math.max(i - 1, 0))} title="Slower step (Down)">−</button>
            <span className="step-label" title="Step size (Up/Down)">{formatStep(STEP_SIZES[stepIdx])}</span>
            <button className="step-adj" onClick={() => setStepIdx((i) => Math.min(i + 1, STEP_SIZES.length - 1))} title="Faster step (Up)">+</button>
          </div>
        </div>

        <div className="mark-controls">
          {inPoint !== null && (
            <span className="in-point-badge">{formatTimecode(inPoint)}</span>
          )}
          <button
            className={`mark-btn ${inPoint !== null ? 'mark-btn-active' : ''}`}
            onClick={() => {
              if (inPoint === null) {
                onInPoint(globalTime)
              } else {
                const start = Math.min(inPoint, globalTime)
                const end = Math.max(inPoint, globalTime)
                if (start < end) addSegment(start, end)
                onInPoint(null)
              }
            }}
            title={inPoint === null ? 'Mark start (D)' : 'Mark end (D)'}
          >D</button>
          <button
            className="mark-btn snap-btn"
            onClick={() => addSnapshot(globalTime)}
            title="Snapshot (S)"
          >S</button>
        </div>
      </div>

      <div className="keyboard-hint">
        <span>← → navigate</span>
        <span>↑ ↓ step size</span>
        <span>Space play/pause</span>
        <span>D segment in/out</span>
        <span>S snapshot</span>
        <span>Tab / ⇧Tab next/prev recording</span>
        <span>Esc cancel</span>
      </div>
    </div>
  )
})

export default VideoPlayer
