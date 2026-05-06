import React, { useRef, useCallback } from 'react'
import './ProgressBar.css'

export default function ProgressBar({ currentTime, duration, inPoint, segments, snapshots, onSeek }) {
  const barRef = useRef(null)

  const getTimeFromEvent = useCallback((e) => {
    const bar = barRef.current
    if (!bar || !duration) return 0
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return ratio * duration
  }, [duration])

  function handleMouseDown(e) {
    onSeek(getTimeFromEvent(e))
    function onMove(me) { onSeek(getTimeFromEvent(me)) }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const playedPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const inPct = (inPoint !== null && duration > 0) ? (inPoint / duration) * 100 : null

  return (
    <div className="progress-bar" ref={barRef} onMouseDown={handleMouseDown}>
      {segments.map((seg, i) => {
        const left = (seg.inPoint / duration) * 100
        const width = ((seg.outPoint - seg.inPoint) / duration) * 100
        return <div key={i} className="seg-overlay" style={{ left: `${left}%`, width: `${width}%` }} />
      })}

      {snapshots.map((t, i) => (
        <div key={i} className="snap-marker" style={{ left: `${(t / duration) * 100}%` }} />
      ))}

      <div className="pb-played" style={{ width: `${playedPct}%` }} />

      {inPct !== null && <div className="pb-in-marker" style={{ left: `${inPct}%` }} />}

      <div className="pb-head" style={{ left: `${playedPct}%` }} />
    </div>
  )
}
