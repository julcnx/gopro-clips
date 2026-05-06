# GoPro Clips

Desktop app for quickly reviewing GoPro SD card footage, exporting snapshots and video segments before importing into an editor.

Built with Electron + React. macOS only (uses `/Volumes` for SD card detection).

## Features

- Auto-detects GoPro SD card on insert
- Lists all recordings grouped by clip ID, with total duration
- Previews footage using LRV proxy files (fast low-resolution playback)
- Keyboard-driven review workflow
- Export snapshots (JPG) and segments (MP4) to any folder
- Delete recordings directly from the SD card

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space | Play / pause |
| ← → | Step backward / forward |
| Shift + ← → | Step 5× |
| ↑ ↓ | Increase / decrease step size |
| D | Mark segment in-point, then out-point |
| S | Snapshot at current frame |
| Tab | Next recording |
| Shift + Tab | Previous recording |
| Escape | Cancel open segment |

## Installation

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/julcnx/gopro-clips.git
cd gopro-clips
npm install
npm start
```

To build a distributable `.dmg`:

```bash
npm run build
```

The output is in `dist/`. No external dependencies needed: ffmpeg is bundled.

## How it works

1. Insert your GoPro SD card. The app detects it automatically via `/Volumes`.
2. Browse recordings in the left panel. Each entry is a logical clip (multi-chapter files are grouped).
3. Click a recording to load it in the player. Proxy (LRV) files are used for playback if available.
4. Use `S` to queue a snapshot, or `D` twice to mark a segment.
5. Click **Export All** in the Clips panel to write files to disk.

## Contributing

Issues and pull requests are welcome.

- Recordings are parsed in [main/scanner.js](main/scanner.js): add support for new GoPro filename formats there.
- Export logic (ffmpeg calls) is in [main/ffmpeg.js](main/ffmpeg.js).
- The renderer is a standard React app under [renderer/](renderer/).

```
npm start        # dev mode (hot reload)
npm run build    # production .dmg
```

## License

MIT
