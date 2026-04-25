# vkmusic-yandexmusic-to-txt-playlist

Tool for moving music from VK Music and Yandex Music through TXT playlists, with a local browser helper for finishing Spotify `Liked Songs` transfers.

Russian version: [README.md](README.md)

## Table of Contents

- [How It Works](#how-it-works)
- [Export From VK](#export-from-vk)
- [Export From Yandex Music](#export-from-yandex-music)
- [Spotify: Finish Liked Songs](#spotify-finish-liked-songs)
- [Install](#install)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Reports](#reports)
- [Security](#security)
- [Platforms](#platforms)
- [Limitations](#limitations)

## How It Works

A normal cross-service music transfer looks like this:

1. Export tracks from the source service into a TXT file in `Artist - Title` format.
2. If the file is large, split it into 500-line chunks.
3. Upload those TXT files to TuneMyMusic:
   [tunemymusic.com/transfer/text-file-to-spotify](https://www.tunemymusic.com/transfer/text-file-to-spotify)
4. Get regular playlists on the target platform.
5. If you specifically need Spotify `Liked Songs`, run the separate browser script: it walks through the imported playlist, likes every track, and can remove processed tracks from the playlist.

Why this shape:

- regular playlists transfer between services fairly well
- liked/favorite tracks often transfer poorly or not directly at all
- so favorites are first converted into a normal playlist
- then Spotify is finished locally through browser automation

## Export From VK

### Simple Run

1. Open PowerShell in the project folder.
2. For a regular playlist, paste its URL and run:

```bash
npm run export -- --playlist "VK_PLAYLIST_URL"
```

3. For `My Music`, run:

```bash
npm run export -- --playlist my-music
```

4. If a browser opens and asks you to log in, sign in to VK.
5. The resulting TXT file appears in `playlists/`.

### What It Exports

VK has two main sources:

- regular playlists by URL
- the `My Music` section

The output is a TXT file that can be uploaded to TuneMyMusic and transferred to another service in chunks of up to 500 lines.

### Available Modes

There are two VK flows:

- CLI mode: the tool opens a browser, waits for login if needed, and collects tracks
- `F12 -> Console`: the tool prints a snippet that you paste manually into DevTools on the VK page

CLI:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
npm run export -- --playlist my-music
```

Manual snippet:

```bash
node src/cli.js snippet
```

If Chrome blocks pasting into DevTools, type this first:

```text
allow pasting
```

Then:

1. Get the TXT file in `playlists/`.
2. Split it if needed.
3. Upload the chunks to TuneMyMusic.

Split example:

```bash
npm run split -- --path "./playlists/My Music.txt" --max-lines 500
```

## Export From Yandex Music

### Simple Run

1. Make the target playlist public.
2. Copy its public URL.
3. Run:

```bash
npm run yandex-export -- --playlist "YANDEX_MUSIC_PLAYLIST_URL"
```

4. If the file is large and you want 500-line chunks immediately:

```bash
npm run yandex-export -- --playlist "YANDEX_MUSIC_PLAYLIST_URL" --split --max-lines 500
```

5. The full TXT appears in `playlists/`, and chunks appear in `split/`.

### Regular Playlists

For public Yandex Music playlists, authorization is not needed. The tool can open a clean browser session without your profile, cookies, or private data and collect tracks from the public URL.

```bash
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/..."
```

### `Liked` Playlist

For Yandex Music `Liked` tracks, the simplest approach is to make that playlist public and export it as a normal playlist by URL.

Flow:

1. Make the `Liked` playlist public in Yandex Music.
2. Copy its public URL, usually shaped like `https://music.yandex.ru/playlists/lk....`.
3. Export it as a normal playlist.
4. Split into 500-line chunks if needed.

```bash
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/lk...." --split --max-lines 500
```

Manual snippet:

```bash
node src/cli.js yandex-snippet
```

## Spotify: Finish Liked Songs

### Simple Run

1. Open Chrome with remote debugging:

```bash
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

2. In that Chrome window, open the Spotify playlist you want to process.
3. Run:

```bash
node src/cli.js spotify-like-attach --remove-from-playlist
```

4. The script walks the playlist, likes tracks, and removes processed tracks when `--remove-from-playlist` is enabled.
5. At the end, the tracks are in Spotify `Liked Songs`.

### Why This Script Exists

This is a practical workaround for moving favorites into Spotify.

Third-party services usually transfer regular playlists well, but they do not always transfer `Liked Songs` correctly. The working flow is:

1. Export favorites from the source service as a regular playlist.
2. Move that playlist to Spotify through TuneMyMusic.
3. Open the imported Spotify playlist.
4. Run the local browser script.
5. The script likes every track and can remove it from the playlist after liking.

Result:

- the temporary playlist gradually shrinks
- tracks end up in `Liked Songs`
- the script does not need to fight a huge virtual-scroll playlist forever

### What It Can Do

- like tracks from the currently opened Spotify playlist
- remove tracks from the playlist after liking
- save a JSON report
- retry skipped tracks from a previous report

## Install

```bash
npm install
```

## Quick Start

### VK -> Spotify

1. Export a VK playlist or `My Music` into TXT.
2. Split the TXT into 500-line chunks if needed.
3. Import chunks through TuneMyMusic.
4. If this was meant to become Spotify favorites, open the imported playlist in Spotify and run `spotify-like-attach --remove-from-playlist`.

### Yandex Music -> Spotify

1. Export a Yandex Music playlist into TXT.
2. For `Liked`, first make the Yandex Music `Liked` playlist public.
3. Split the TXT into 500-line chunks if needed.
4. Import chunks through TuneMyMusic.
5. If this should become Spotify favorites, run `spotify-like-attach --remove-from-playlist`.

## Commands

### `export`

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
npm run export -- --playlist my-music
```

Options:

- `--playlist`: VK playlist URL or the special `my-music` target
- `--browser`: `chrome`, `edge`, or `firefox`
- `--out`: TXT output path
- `--profile-dir`: managed session directory
- `--executable-path`: browser binary path
- `--attach`: connect to an already opened Chrome/Edge through `http://127.0.0.1:9222`
- `--attach-url`: custom remote debugging endpoint
- `--headless`: run without a visible browser window

### `yandex-export`

```bash
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/..."
npm run yandex-export -- --playlist "https://music.yandex.ru/playlists/lk...." --split --max-lines 500
```

Options:

- `--playlist`: Yandex Music playlist URL
- `--browser`: `chrome`, `edge`, or `firefox`
- `--out`: TXT output path
- `--attach`: connect to an already opened Chrome/Edge through `http://127.0.0.1:9222`
- `--attach-url`: custom remote debugging endpoint
- `--split`: also write chunked TXT files
- `--max-lines`: chunk size for `--split`, defaults to 500
- `--split-out-dir`: custom chunk output directory
- `--profile-dir`: managed session directory
- `--executable-path`: browser binary path
- `--headless`: run without a visible browser window

### `validate`

```bash
npm run validate -- --path "./playlists/My Music.txt"
```

Checks TXT formatting and prints statistics.

### `split`

```bash
npm run split -- --path "./playlists/My Music.txt" --max-lines 500
```

Splits a large TXT file into chunks. The default chunk size is 500 lines.

### `snippet`

```bash
node src/cli.js snippet
```

Prints the JS snippet for manual `F12 -> Console` export on a VK page.

### `yandex-snippet`

```bash
node src/cli.js yandex-snippet
```

Prints the JS snippet for manual `F12 -> Console` export on a Yandex Music playlist page.

### `spotify-like-snippet`

```bash
node src/cli.js spotify-like-snippet
```

Prints a JS snippet for liking tracks manually from the Spotify console.

### `spotify-like-attach`

```bash
node src/cli.js spotify-like-attach [options]
```

Connects to an already opened Chrome instance and likes tracks from the currently opened Spotify playlist.

Options:

- `--attach-url`: remote debugging endpoint, defaults to `http://127.0.0.1:9222`
- `--remove-from-playlist`: remove a track from the playlist after liking it
- `--max-new-likes`: limit new likes per run
- `--retry-per-row`: attempts per track, defaults to 5
- `--retry-skipped`: retry skipped tracks at the end of the same run
- `--report`: JSON report path

### `spotify-like-attach-retry`

```bash
node src/cli.js spotify-like-attach-retry --from-report <path> [options]
```

Retries only tracks with `menu-not-found` status from a previous report.

### `liked-sync`

```bash
node src/cli.js liked-sync --path "./playlists/My Music.txt" --spotify-client-id <id>
```

Spotify API based sync. It is slower and hits rate limits more easily, so the browser workflow is the main practical path for large libraries.

### `liked-sync-playlist`

```bash
node src/cli.js liked-sync-playlist --playlist <spotify-url|id> --spotify-client-id <id>
```

Same Spotify API approach, but it reads tracks directly from a Spotify playlist.

## Reports

`spotify-like-attach` saves JSON reports in `reports/`.

Each entry includes:

- `key`: Spotify track ID
- `label`: row text as shown in the UI
- `status`: `liked`, `already-liked`, `action-not-found`, or `menu-not-found`

You can retry skipped tracks with `spotify-like-attach-retry`.

## Security

The whole workflow is local:

- VK and Yandex Music export runs on your device
- attach mode connects only to a browser already running locally
- managed sessions are stored locally in `.session/`
- TXT files and reports are saved locally in the project
- this tool does not send your logins or passwords to any third-party service

For public Yandex Music playlists, you do not need to log in at all. A clean browser session can open the public URL and collect TXT data without using your account.

## Platforms

| OS      | Status |
| ------- | ------ |
| Windows | main tested workflow |
| macOS   | supported in code |
| Linux   | supported in code |

Important notes:

- `F12 -> Console` is portable across operating systems
- attach mode works only with Chromium browsers such as Chrome and Edge
- Firefox is better used through managed session mode or `snippet`

## Limitations

- VK changes markup from time to time, so parser updates may be needed
- for VK `My Music`, VK may show only the visible part of the library behind a subscription prompt
- for Yandex Music `Liked`, using a public playlist URL is the simplest path
- free TuneMyMusic transfers usually imply a 500-track limit per transfer
- Spotify API development mode has strict rate limits and is not ideal for large libraries
