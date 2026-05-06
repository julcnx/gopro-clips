import React from 'react'
import './ExportQueue.css'

export default function ExportQueue({ queue, onRemove, onExport, exportStatus }) {
  return (
    <div className="panel export-panel">
      <div className="panel-header">Clips ({queue.length})</div>

      <div className="panel-scroll">
        {queue.length === 0 ? (
          <div className="empty-state">
            <div>Nothing queued</div>
            <div style={{ fontSize: 11 }}>
              D to mark segment in/out, S for snapshot
            </div>
          </div>
        ) : (
          queue.map((item) => (
            <div key={item.id} className="queue-item">
              <div className={`queue-type-badge ${item.type}`}>
                {item.type === 'snapshot' ? 'JPG' : 'MP4'}
              </div>
              <div className="queue-info">
                <div className="queue-clip">Rec {item.recordingId}</div>
                <div className="queue-label">{item.label}</div>
              </div>
              <button
                className="btn-icon"
                onClick={() => onRemove(item.id)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="export-footer">
        {exportStatus ? (
          <div className="export-progress">
            <div className="progress-bar-linear">
              <div
                className="progress-bar-fill"
                style={{ width: `${(exportStatus.current / exportStatus.total) * 100}%` }}
              />
            </div>
            <div className="progress-label">
              Exporting {exportStatus.current} / {exportStatus.total}
            </div>
          </div>
        ) : (
          <button
            className="btn-primary export-btn"
            disabled={queue.length === 0}
            onClick={onExport}
          >
            Export All ({queue.length})
          </button>
        )}
      </div>
    </div>
  )
}
