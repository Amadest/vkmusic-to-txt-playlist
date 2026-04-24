# vkmusic-to-txt-playlist

Tool for exporting music from VK Music and moving it into Spotify.

It supports two clear flows:

- export VK playlists and `My Music` into `Artist - Title` TXT files
- import those TXT files directly into Spotify `Liked Songs`

Russian version: [README.md](README.md)

## What it does

- exports regular VK playlists by URL
- exports `My Music` via the special `my-music` target
- supports attach mode for an already opened Chrome/Edge session
- has a fallback `F12 -> Console` snippet flow
- validates TXT files
- splits large TXT files into 500-line chunks
- searches Spotify and adds matches into `Liked Songs`

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

Spotify is also handled through your own app:

- you create your own app in the Spotify Developer Dashboard
- you use your own `Client ID`
- authorization goes through `localhost`:

```text
http://127.0.0.1:43821/spotify/callback
```

- tokens are stored locally in `.session/spotify.json`

If you want to avoid browser automation entirely, use the `F12 -> Console` export flow and open the Spotify OAuth URL from the terminal manually.

## Working with TXT files

Validate a TXT file:

```bash
npm run validate -- --path "./playlists/My Music.txt"
```

Split a large TXT file:

```bash
npm run split -- --path "./playlists/My Music.txt" --max-lines 500
```

## Spotify `Liked Songs`

This is a one-way additive import:

- the TXT file is read line by line
- each track is searched through Spotify Web API
- matched tracks are added into `Liked Songs`
- existing likes are not removed

### One-time setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy its `Client ID`.
3. Add this redirect URI:

```text
http://127.0.0.1:43821/spotify/callback
```

### Safe dry-run

```bash
npm run liked-sync -- --path "./playlists/My Music.txt" --spotify-client-id "YOUR_SPOTIFY_CLIENT_ID" --dry-run --limit 20
```

### Real import into `Liked Songs`

```bash
npm run liked-sync -- --path "./playlists/My Music.txt" --spotify-client-id "YOUR_SPOTIFY_CLIENT_ID"
```

### If Spotify OAuth does not open automatically

The command prints:

```text
Open Spotify authorization if it does not start automatically:
```

If no browser window opens, copy the printed URL and open it manually.

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

### `liked-sync`

```bash
npm run liked-sync -- --path "./playlists/My Music.txt" --spotify-client-id "YOUR_SPOTIFY_CLIENT_ID"
```

Options:

- `--path`: TXT file in `Artist - Title` format
- `--spotify-client-id`: Spotify app client id
- `--redirect-uri`: OAuth redirect URI
- `--report`: custom JSON report path
- `--market`: Spotify Search market such as `US`
- `--limit`: process only part of the file for a test run
- `--dry-run`: search and report only, without saving to the library
- `--force-auth`: force a new Spotify OAuth flow

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

## Platforms

Current status:

- Windows: main tested workflow, verified in practice
- macOS: supported in code, not smoke-tested in this session
- Linux: supported in code, not smoke-tested in this session

Important notes:

- `F12 -> Console` is the most portable flow across operating systems
- attach mode works only with Chromium browsers such as Chrome and Edge
- Firefox is better used via managed session or `snippet`
- automatic Spotify OAuth opening depends on the local OS and browser setup

## Limitations

- VK changes markup from time to time, so parser updates may be needed
- on `My Music`, VK may show only the visible part of the library and hide the rest behind a subscription prompt
- Spotify search will not guarantee a 100% match rate, so always review the JSON report in `reports/`

## Sources

- Spotify PKCE Flow:
  https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify Save Items to Library:
  https://developer.spotify.com/documentation/web-api/reference/save-library-items
