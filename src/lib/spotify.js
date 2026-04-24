const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");
const { ensureDirectory, readPlaylistFile } = require("./files");

const DEFAULT_REDIRECT_URI = "http://127.0.0.1:43821/spotify/callback";
const DEFAULT_SCOPES = ["user-library-modify"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTrackLine(line) {
  const separatorIndex = line.indexOf(" - ");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    line,
    artist: line.slice(0, separatorIndex).trim(),
    title: line.slice(separatorIndex + 3).trim(),
  };
}

function normalizeForCompare(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((.*?)\)|\[(.*?)\]/g, " ")
    .replace(/\b(feat|ft|featuring|radio|edit|extended|mix|remix|version|album|original|live)\b/gi, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueWords(value) {
  return [...new Set(normalizeForCompare(value).split(" ").filter(Boolean))];
}

function getWordOverlapScore(left, right) {
  const leftWords = uniqueWords(left);
  const rightWords = new Set(uniqueWords(right));

  if (leftWords.length === 0) {
    return 0;
  }

  const matches = leftWords.filter((word) => rightWords.has(word)).length;
  return matches / leftWords.length;
}

function scoreCandidate(source, candidate) {
  const sourceArtist = normalizeForCompare(source.artist);
  const sourceTitle = normalizeForCompare(source.title);
  const candidateArtist = normalizeForCompare(
    (candidate.artists || []).map((artist) => artist.name).join(" ")
  );
  const candidateTitle = normalizeForCompare(candidate.name || "");

  let score = 0;

  if (candidateTitle === sourceTitle) {
    score += 60;
  } else if (
    candidateTitle.includes(sourceTitle) ||
    sourceTitle.includes(candidateTitle)
  ) {
    score += 40;
  } else {
    score += Math.round(getWordOverlapScore(sourceTitle, candidateTitle) * 35);
  }

  if (candidateArtist === sourceArtist) {
    score += 35;
  } else if (
    candidateArtist.includes(sourceArtist) ||
    sourceArtist.includes(candidateArtist)
  ) {
    score += 25;
  } else {
    score += Math.round(getWordOverlapScore(sourceArtist, candidateArtist) * 20);
  }

  score += Math.min(5, Math.round((candidate.popularity || 0) / 20));
  return score;
}

function openUrl(url) {
  const platform = os.platform();
  let command;
  let args;

  if (platform === "win32") {
    const escapedUrl = String(url).replace(/'/g, "''");
    command = "powershell.exe";
    args = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process '${escapedUrl}'`,
    ];
  } else if (platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function createPkcePair() {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}

function readAuthSession(sessionPath) {
  if (!fs.existsSync(sessionPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
}

function writeAuthSession(sessionPath, session) {
  ensureDirectory(path.dirname(sessionPath));
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2) + "\n", "utf8");
}

async function spotifyRequest({
  method = "GET",
  url,
  accessToken,
  headers = {},
  body,
  retries = 3,
}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {}),
      ...headers,
    },
    body,
  });

  if (response.status === 429 && retries > 0) {
    const retryAfter = Number(response.headers.get("retry-after") || "1");
    await delay(retryAfter * 1000);
    return spotifyRequest({
      method,
      url,
      accessToken,
      headers,
      body,
      retries: retries - 1,
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Spotify API request failed (${response.status}) for ${url}: ${errorText}`
    );
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function exchangeCodeForToken({
  clientId,
  code,
  codeVerifier,
  redirectUri,
}) {
  return spotifyRequest({
    method: "POST",
    url: "https://accounts.spotify.com/api/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
}

async function refreshAccessToken({ clientId, refreshToken }) {
  return spotifyRequest({
    method: "POST",
    url: "https://accounts.spotify.com/api/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
}

async function waitForSpotifyCallback({ redirectUri, state }) {
  const redirect = new URL(redirectUri);
  const host = redirect.hostname;
  const port = Number(redirect.port);
  const callbackPath = redirect.pathname;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for Spotify authorization callback."));
    }, 180000);

    const server = http.createServer((request, response) => {
      const url = new URL(request.url, `${redirect.protocol}//${request.headers.host}`);

      if (url.pathname !== callbackPath) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      if (url.searchParams.get("state") !== state) {
        response.statusCode = 400;
        response.end("State mismatch");
        clearTimeout(timer);
        server.close();
        reject(new Error("Spotify callback state mismatch."));
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        response.statusCode = 400;
        response.end("Spotify authorization failed.");
        clearTimeout(timer);
        server.close();
        reject(new Error(`Spotify authorization failed: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<h1>Spotify authorization completed. You can close this tab.</h1>");

      clearTimeout(timer);
      server.close();
      resolve(code);
    });

    server.listen(port, host);
  });
}

async function authorizeSpotify({
  clientId,
  redirectUri,
  sessionPath,
  forceAuth = false,
}) {
  const existingSession = !forceAuth ? readAuthSession(sessionPath) : null;

  if (
    existingSession &&
    existingSession.clientId === clientId &&
    existingSession.accessToken &&
    existingSession.expiresAt > Date.now() + 60000
  ) {
    return existingSession.accessToken;
  }

  if (
    existingSession &&
    existingSession.clientId === clientId &&
    existingSession.refreshToken
  ) {
    const refreshed = await refreshAccessToken({
      clientId,
      refreshToken: existingSession.refreshToken,
    });
    const updatedSession = {
      clientId,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || existingSession.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope || DEFAULT_SCOPES.join(" "),
      redirectUri,
    };
    writeAuthSession(sessionPath, updatedSession);
    return updatedSession.accessToken;
  }

  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: DEFAULT_SCOPES.join(" "),
  }).toString();

  process.stdout.write(
    `Open Spotify authorization if it does not start automatically:\n${authUrl.toString()}\n`
  );
  openUrl(authUrl.toString());

  const code = await waitForSpotifyCallback({ redirectUri, state });
  const token = await exchangeCodeForToken({
    clientId,
    code,
    codeVerifier: verifier,
    redirectUri,
  });

  const session = {
    clientId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope || DEFAULT_SCOPES.join(" "),
    redirectUri,
  };
  writeAuthSession(sessionPath, session);
  return session.accessToken;
}

async function searchTrack(accessToken, track, market) {
  const queries = [
    `track:${track.title} artist:${track.artist}`,
    `${track.artist} ${track.title}`,
  ];
  let best = null;

  for (const query of queries) {
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "10");
    if (market) {
      url.searchParams.set("market", market);
    }

    const response = await spotifyRequest({
      url: url.toString(),
      accessToken,
    });
    const items = response?.tracks?.items || [];

    for (const item of items) {
      const scored = {
        item,
        score: scoreCandidate(track, item),
      };

      if (!best || scored.score > best.score) {
        best = scored;
      }
    }

    if (best && best.score >= 75) {
      break;
    }
  }

  return best && best.score >= 45 ? best : null;
}

async function saveLikedTracks(accessToken, uris) {
  const chunks = [];
  for (let index = 0; index < uris.length; index += 40) {
    chunks.push(uris.slice(index, index + 40));
  }

  for (const chunk of chunks) {
    const url = new URL("https://api.spotify.com/v1/me/library");
    url.searchParams.set("uris", chunk.join(","));
    await spotifyRequest({
      method: "PUT",
      url: url.toString(),
      accessToken,
    });
  }
}

async function syncLikedSongs({
  filePath,
  clientId,
  redirectUri = DEFAULT_REDIRECT_URI,
  sessionPath = path.resolve(process.cwd(), ".session", "spotify.json"),
  reportPath,
  dryRun = false,
  forceAuth = false,
  limit,
  market,
}) {
  const rawLines = readPlaylistFile(filePath);
  const parsedTracks = rawLines
    .map(parseTrackLine)
    .filter(Boolean)
    .slice(0, limit ? Number(limit) : undefined);

  if (parsedTracks.length === 0) {
    throw new Error("No valid 'Artist - Title' lines found for Spotify sync.");
  }

  const accessToken = await authorizeSpotify({
    clientId,
    redirectUri,
    sessionPath,
    forceAuth,
  });

  const matched = [];
  const unmatched = [];

  for (const track of parsedTracks) {
    process.stdout.write(`Matching: ${track.line}\n`);
    const match = await searchTrack(accessToken, track, market);

    if (!match) {
      unmatched.push(track.line);
      continue;
    }

    matched.push({
      source: track.line,
      uri: match.item.uri,
      title: match.item.name,
      artists: (match.item.artists || []).map((artist) => artist.name),
      score: match.score,
      url: match.item.external_urls?.spotify || "",
    });
  }

  if (!dryRun) {
    await saveLikedTracks(
      accessToken,
      matched.map((item) => item.uri)
    );
  }

  const finalReportPath =
    reportPath ||
    path.resolve(
      process.cwd(),
      "reports",
      `spotify-liked-sync-${Date.now()}.json`
    );
  ensureDirectory(path.dirname(finalReportPath));
  fs.writeFileSync(
    finalReportPath,
    JSON.stringify(
      {
        sourcePath: filePath,
        dryRun,
        totalLines: rawLines.length,
        processedLines: parsedTracks.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matched,
        unmatched,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return {
    sourcePath: filePath,
    dryRun,
    processedLines: parsedTracks.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    reportPath: finalReportPath,
    sampleMatched: matched.slice(0, 5),
    sampleUnmatched: unmatched.slice(0, 5),
  };
}

module.exports = {
  DEFAULT_REDIRECT_URI,
  syncLikedSongs,
};
