import React, { useEffect, useState } from 'react'
import './RecordingList.css'

function formatDuration(seconds) {
  if (!seconds) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function RecordingItem({ recording, selected, onSelect, onDelete, hasQueuedItems }) {
  const [totalDuration, setTotalDuration] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetchDurations() {
      let total = 0
      for (const ch of recording.chapters) {
        try {
          const d = await window.gopro.getDuration(ch.path)
          total += d
        } catch {}
      }
      if (!cancelled) setTotalDuration(total)
    }
    fetchDurations()
    return () => { cancelled = true }
  }, [recording])

  const hasLrv = recording.lrvChapters.length > 0

  return (
    <div
      className={`recording-item ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(recording)}
    >
      <div className="recording-item-body">
        <div className="recording-id">Rec {recording.recordingId}</div>
        <div className="recording-meta">
          <span>{recording.chapters.length} chapter{recording.chapters.length !== 1 ? 's' : ''}</span>
          <span>{formatDuration(totalDuration)}</span>
          {!hasLrv && <span className="no-lrv">no proxy</span>}
        </div>
      </div>
      <button
        className="recording-delete-btn"
        title={hasQueuedItems ? 'Remove from export queue first' : 'Delete from SD card'}
        disabled={hasQueuedItems}
        onClick={(e) => { e.stopPropagation(); onDelete(recording) }}
      >
        🗑️
      </button>
    </div>
  )
}

export default function RecordingList({ recordings, selectedRecording, onSelect, onDelete, exportQueue }) {
  if (recordings.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">Recordings</div>
        <div className="empty-state">
          <div>No recordings found</div>
          <div style={{ fontSize: 11 }}>Open a GoPro SD card or DCIM folder</div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">Recordings ({recordings.length})</div>
      <div className="panel-scroll">
        {recordings.map((recording) => (
          <RecordingItem
            key={recording.recordingId}
            recording={recording}
            selected={selectedRecording?.recordingId === recording.recordingId}
            onSelect={onSelect}
            onDelete={onDelete}
            hasQueuedItems={exportQueue.some((item) => item.recordingId === recording.recordingId)}
          />
        ))}
      </div>
    </div>
  )
}
