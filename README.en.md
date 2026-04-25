# vkmusic-yandexmusic-to-txt-playlist

Tool for exporting music from VK Music into TXT and preparing it for Spotify transfer.

The current practical workflow is:

- export a playlist or `My Music` from VK into TXT
- split large TXT files into 500-track chunks if needed
- import those chunks through TuneMyMusic
- then finish the last Spotify actions locally in the browser

Russian version: [README.md](README.md)

## What it does

- exports regular VK playlists by URL
- exports `My Music` via the special `my-music` target
- exports Yandex Music playlists into the same TXT format
- supports attach mode for an already opened Chrome/Edge session
- has a fallback `F12 -> Console` flow
- validates TXT files
- splits large TXT files into 500-line chunks

## Pick a flow

### Option 1. CLI + browser

Best when you want a “give it a link -> get a TXT file” workflow.

Regular playlist:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
```

`My Music`:

```bash
npm run export -- --playlist my-music
```

Yandex Music playlist:

```bash
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/d74828f2-0c96-7b70-ca4c-0e1a156a33e1"
```

Yandex Music: for `Liked` tracks, make the `Liked` playlist public first, then export it by URL like a normal playlist:

```bash
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/lk...." --split --max-lines 500
```

If Chrome/Edge is already open with the correct VK session:

```bash
npm run export -- --browser=chrome --attach --playlist="my-music"
```

### Option 2. `F12 -> Console`

Best when you do not want attach mode, browser profiles, or extra automation.

1. Open the target VK page.
2. Print the snippet:

```bash
node src/cli.js snippet
```

For Yandex Music:

```bash
node src/cli.js yandex-snippet
```

3. Open `F12 -> Console`.
4. If the browser asks, type `allow pasting`.
5. Paste the snippet and press `Enter`.
6. Wait for the TXT download.

This flow was verified on Windows and used to produce `playlists/My Music.txt`.

## Install

```bash
npm install
```

## Security

The whole workflow is local.

- VK export runs on your own machine
- the tool either opens a local browser context on your device or you run the local JS snippet yourself via `F12 -> Console`
- attach mode connects only to a browser already running on your machine
- managed sessions are stored locally in `.session/`
- exported TXT files are saved locally inside the project

What this means in practice:

- you do not need to hand over your VK login or password to the tool or to a third-party service
- in the `F12` flow, you can see the code and run it yourself in your own browser
- in the CLI flow, the browser still runs on your device and simply walks through the visible track list

If you want zero browser automation from the tool, use the `F12 -> Console` flow.

## Working with TXT files

Validate a TXT file:

```bash
npm run validate -- --path "./playlists/My Music.txt"
```

Split a large TXT file:

```bash
npm run split -- --path "./playlists/My Music.txt" --max-lines 500
```

## Current Spotify path

The recommended flow right now is:

1. Export `My Music` or a regular playlist from VK into TXT.
   You can also export Yandex Music playlists by URL with `yandex-export`.
2. Split the file into 500-line chunks if needed.
3. Import those chunks through TuneMyMusic.
4. Finish the last step locally in Spotify Web: for example, walk imported playlists and add tracks into `Liked Songs`.

This project deliberately does not present Spotify Web API sync as the main flow right now, because Spotify search rate limits are too restrictive for large libraries.

## Commands

### `export`

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
npm run export -- --playlist "my-music"
```

Options:

- `--playlist`: VK playlist URL or the special `my-music` target
- `--browser`: `chrome`, `edge`, or `firefox`
- `--out`: output TXT path
- `--profile-dir`: managed session directory
- `--executable-path`: browser binary path
- `--attach`: connect to an already opened Chrome/Edge at `http://127.0.0.1:9222`
- `--attach-url`: custom remote debugging endpoint
- `--headless`: run without a visible window

### `validate`

```bash
npm run validate -- --path "./playlists/My Playlist.txt"
```

### `split`

```bash
npm run split -- --path "./playlists/My Playlist.txt" --max-lines 500
```

### `snippet`

```bash
node src/cli.js snippet
```

Prints the current JS snippet for `F12 -> Console`.

### `yandex-export`

```bash
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/..."
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/lk...." --split --max-lines 500
```

Options:

- `--playlist`: Yandex Music playlist URL
- `--browser`: `chrome`, `edge`, or `firefox`
- `--out`: output TXT path
- `--attach`: connect to an already opened Chrome/Edge at `http://127.0.0.1:9222`
- `--attach-url`: custom remote debugging endpoint
- `--split`: also write chunked TXT files
- `--max-lines`: chunk size for `--split`, defaults to 500
- `--split-out-dir`: custom output directory for chunks
- `--profile-dir`: managed session directory
- `--executable-path`: browser binary path
- `--headless`: run without a visible window

### `yandex-snippet`

```bash
node src/cli.js yandex-snippet
```

Prints the JS snippet for manual export through `F12 -> Console` on a Yandex Music playlist page.

For `Liked` tracks, the simplest workflow is:

1. Make the `Liked` playlist public in Yandex Music.
2. Open that public playlist URL.
3. Export it with `yandex-export` or `yandex-snippet` just like any other playlist.

## Platforms

Current status:

- Windows: main tested workflow, verified in practice
- macOS: supported in code, not smoke-tested in this session
- Linux: supported in code, not smoke-tested in this session

Important notes:

- `F12 -> Console` is the most portable flow across operating systems
- attach mode works only with Chromium browsers such as Chrome and Edge
- Firefox is better used via managed session or `snippet`

## Limitations

- VK changes markup from time to time, so parser updates may be needed
- on `My Music`, VK may show only the visible part of the library and hide the rest behind a subscription prompt
- the free TuneMyMusic flow usually implies a 500-track limit per transfer

## Sources

- TuneMyMusic:
  https://www.tunemymusic.com/transfer/text-file-to-spotify
