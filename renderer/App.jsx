import React, { useState, useEffect, useRef, useCallback } from 'react'
import RecordingList from './components/RecordingList.jsx'
import VideoPlayer from './components/VideoPlayer.jsx'
import ExportQueue from './components/ExportQueue.jsx'
import './App.css'

export default function App() {
  const [sdPath, setSdPath] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [selectedRecording, setSelectedRecording] = useState(null)
  const [exportQueue, setExportQueue] = useState([])
  const [inPoint, setInPoint] = useState(null)
  const [exportStatus, setExportStatus] = useState(null) // null | { current, total }
  const playerRef = useRef(null)

  // SD card auto-detection
  useEffect(() => {
    window.gopro.onSdCardDetected((detectedPath) => {
      setSdPath(detectedPath)
      loadFolder(detectedPath)
    })
  }, [])

  async function loadFolder(folderPath) {
    const found = await window.gopro.scanFolder(folderPath)
    setRecordings(found)
    setSelectedRecording(null)
  }

  async function handleBrowse() {
    const picked = await window.gopro.pickFolder()
    if (picked) {
      setSdPath(picked)
      loadFolder(picked)
    }
  }

  function handleRecordingSelect(recording) {
    setSelectedRecording(recording)
    setInPoint(null)
  }

  function handleNextRecording() {
    if (recordings.length === 0) return
    const idx = recordings.findIndex((r) => r.recordingId === selectedRecording?.recordingId)
    const next = recordings[idx + 1]
    if (next) handleRecordingSelect(next)
  }

  function handlePrevRecording() {
    if (recordings.length === 0) return
    const idx = recordings.findIndex((r) => r.recordingId === selectedRecording?.recordingId)
    const prev = recordings[idx - 1]
    if (prev) handleRecordingSelect(prev)
  }

  async function handleDeleteRecording(recording) {
    const { deleted } = await window.gopro.deleteRecording(recording)
    if (!deleted) return
    setRecordings((rs) => rs.filter((r) => r.recordingId !== recording.recordingId))
    if (selectedRecording?.recordingId === recording.recordingId) {
      setSelectedRecording(null)
      setInPoint(null)
    }
    setExportQueue((q) => q.filter((item) => item.recordingId !== recording.recordingId))
  }

  const handleSnapshot = useCallback((snapshot) => {
    setExportQueue((q) => [...q, { id: Date.now(), ...snapshot }])
  }, [])

  const handleSegment = useCallback((segment) => {
    setExportQueue((q) => [...q, { id: Date.now(), ...segment }])
  }, [])

  function removeQueueItem(id) {
    setExportQueue((q) => q.filter((item) => item.id !== id))
  }

  async function handleExport() {
    if (exportQueue.length === 0) return
    const outputFolder = await window.gopro.pickExportFolder()
    if (!outputFolder) return

    setExportStatus({ current: 0, total: exportQueue.length })

    window.gopro.onExportProgress((data) => {
      if (data.status === 'done') {
        setExportStatus({ current: data.index + 1, total: data.total })
      }
    })

    await window.gopro.exportItems(exportQueue, outputFolder)
    window.gopro.removeExportProgressListener()
    setExportStatus(null)
    setExportQueue([])
    setInPoint(null)
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title">GoPro Clips</span>
        <div className="titlebar-actions">
          {sdPath && <span className="sd-path">{sdPath}</span>}
          <button className="btn-secondary" onClick={handleBrowse}>
            {sdPath ? 'Change Folder' : 'Open Folder'}
          </button>
        </div>
      </div>

      <div className="panels">
        <RecordingList
          recordings={recordings}
          selectedRecording={selectedRecording}
          onSelect={handleRecordingSelect}
          onDelete={handleDeleteRecording}
          exportQueue={exportQueue}
        />

        <VideoPlayer
          ref={playerRef}
          recording={selectedRecording}
          inPoint={inPoint}
          onInPoint={setInPoint}
          onSnapshot={handleSnapshot}
          onSegment={handleSegment}
          onNextRecording={handleNextRecording}
          onPrevRecording={handlePrevRecording}
        />

        <ExportQueue
          queue={exportQueue}
          onRemove={removeQueueItem}
          onExport={handleExport}
          exportStatus={exportStatus}
        />
      </div>
    </div>
  )
}
