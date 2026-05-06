# GoPro Clips

Desktop app for quickly reviewing GoPro SD card footage, exporting snapshots and video segments before importing into an editor.

Built with Electron + React. Packaging is set up for macOS and Windows.

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
npm run build:mac
```

To build a Windows `.exe` installer:

```bash
npm run build:win
```

This build is configured to produce a Windows `x64` installer by default.

To build both targets in one run:

```bash
npm run build
```

The packaged app output is in `dist/`. No external dependencies needed: ffmpeg is bundled.

## Platform notes

- macOS: SD cards are auto-detected by watching `/Volumes`.
- Windows: SD cards are auto-detected by polling drive letters for a `DCIM` folder.
- Cross-building Windows from macOS depends on your local `electron-builder` setup. If the host cannot produce the installer directly, use a Windows CI job or a Wine-based build environment.
- Installer metadata and custom icons are configured from the files in `build/`.

## How it works

1. Insert your GoPro SD card.
2. On macOS, the app detects it automatically via `/Volumes`. On Windows, use **Open Folder**.
3. Browse recordings in the left panel. Each entry is a logical clip (multi-chapter files are grouped).
4. Click a recording to load it in the player. Proxy (LRV) files are used for playback if available.
5. Use `S` to queue a snapshot, or `D` twice to mark a segment.
6. Click **Export All** in the Clips panel to write files to disk.

## Contributing

Issues and pull requests are welcome.

- Recordings are parsed in [main/scanner.js](main/scanner.js): add support for new GoPro filename formats there.
- Export logic (ffmpeg calls) is in [main/ffmpeg.js](main/ffmpeg.js).
- The renderer is a standard React app under [renderer/](renderer/).

```bash
npm start        # dev mode (hot reload)
npm run build    # build macOS + Windows packages
npm run build:mac
npm run build:win
```

## License

MIT
