# vkmusic-to-txt-playlist

Export VK Music playlists into TuneMyMusic-ready TXT files for Spotify import.

The tool opens a supported browser, waits for VK authentication if needed, loads the full playlist, and saves tracks in the `Artist - Title` format accepted by TuneMyMusic.

## Features

- exports VK playlists to plain TXT
- supports `chrome`, `edge`, and `firefox`
- keeps separate managed sessions in `.session/<browser>`
- can attach to an already opened Chrome/Edge session via remote debugging
- supports current VK Music page layouts
- validates exported files before import
- splits playlists larger than 500 tracks for TuneMyMusic free transfers

## Requirements

- Node.js 20+
- one of: Google Chrome, Microsoft Edge, or Firefox
- a VK account with access to the playlist

## Install

```bash
npm install
```

## Quick start

Export a playlist:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
```

Choose a browser:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash" --browser firefox
```

Use an already opened Chrome or Edge session:

```bash
npm run export -- --browser=chrome --attach --playlist="https://vk.com/music/playlist/123_456_hash"
```

Validate the exported file:

```bash
npm run validate -- --path "./playlists/My Playlist.txt"
```

Split a large playlist into 500-track chunks:

```bash
npm run split -- --path "./playlists/My Playlist.txt" --max-lines 500
```

Then upload the TXT file to TuneMyMusic:

1. Open `https://www.tunemymusic.com/transfer/text-file-to-spotify`
2. Choose `Text file`
3. Upload the exported TXT file
4. Select Spotify as destination
5. Complete authorization and run the transfer

## Commands

### `export`

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash" [--browser chrome] [--out "./playlists/custom.txt"] [--profile-dir "./.session/chrome"] [--executable-path "/path/to/browser"] [--attach] [--attach-url "http://127.0.0.1:9222"] [--headless]
```

Options:

- `--playlist`: VK playlist URL
- `--browser`: browser to use: `chrome`, `edge`, or `firefox`
- `--out`: optional output path
- `--profile-dir`: optional browser session directory
- `--executable-path`: browser binary path if auto-detection does not find it
- `--attach`: connect to an already opened Chrome/Edge at `http://127.0.0.1:9222`
- `--attach-url`: custom remote debugging endpoint
- `--headless`: run without showing Chrome if the saved session is already authenticated

### `snippet`

```bash
node src/cli.js snippet
```

Prints the current JS snippet for `F12 -> Console`. This is the fallback path when automation is not suitable.

### `validate`

```bash
npm run validate -- --path "./playlists/My Playlist.txt"
```

### `split`

```bash
npm run split -- --path "./playlists/My Playlist.txt" --max-lines 500
```

## Notes

- VK can change markup at any time, so parser maintenance may occasionally be needed.
- Each browser uses its own managed session in `.session/` instead of attaching to a live user profile.
- `--attach` is supported only for Chromium browsers such as Chrome and Edge. For Firefox, use managed session or the snippet fallback.
- TuneMyMusic free transfers are limited to 500 tracks per run.
- Some tracks may still require manual cleanup for the best Spotify match rate.
