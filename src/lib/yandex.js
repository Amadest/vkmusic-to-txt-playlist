const path = require("node:path");
const {
  connectToAttachedBrowser,
  launchManagedContext,
  normalizeBrowserName,
} = require("./browser");
const {
  ensureDirectory,
  sanitizeFileName,
  splitPlaylistLines,
  writePlaylistFile,
} = require("./files");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveYandexTarget(target) {
  const value = (target || "").trim();
  const normalized = value.toLowerCase();

  return value;
}

function isYandexLikedAlias(target) {
  const normalized = (target || "").trim().toLowerCase();
  return (
    normalized === "liked" ||
    normalized === "likes" ||
    normalized === "favorites" ||
    normalized === "favourites" ||
    normalized === "my-music"
  );
}

function isYandexPlaylistUrl(url) {
  return /music\.yandex\.ru\/playlists\//i.test(url || "");
}

async function waitForYandexMusicPage(page, browserName) {
  process.stdout.write(
    `Waiting for Yandex Music tracks in ${browserName}. Log in if needed and keep the target playlist page open...\n`
  );

  for (;;) {
    const status = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        ".d-track, [class*='CommonTrack_root'], [class*='Track_track'], a[href*='/album/'][href*='/track/']"
      );

      return {
        hasTracks: rows.length > 0,
        title: document.title || "",
        url: location.href,
      };
    });

    if (status.hasTracks) {
      return status;
    }

    await delay(2000);
  }
}

async function loadFullYandexPlaylist(page) {
  return page.evaluate(async () => {
    const delayInner = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => (value || "").replace(/[\s\n ]+/g, " ").trim();

    function extractVisibleTracks() {
      const rows = [
        ...document.querySelectorAll(
          [
            ".d-track",
            "[class*='CommonTrack_root']",
            "[class*='Track_track']",
            "[data-testid*='track']",
            "[aria-label][role='button']",
          ].join(", ")
        ),
      ];

      return rows
        .map((row) => {
          const trackLink =
            row.querySelector("a[href*='/album/'][href*='/track/']") ||
            row.querySelector("a[href*='/track/']");
          const artistLinks = [
            ...row.querySelectorAll("a[href*='/artist/']"),
          ];
          const title = clean(
            trackLink?.textContent ||
              row.querySelector(".d-track__title")?.textContent ||
              row.querySelector(".d-track__name")?.textContent ||
              row.querySelector("[class*='Meta_albumLink']")?.textContent ||
              row.querySelector("[class*='Title']")?.textContent ||
              row.querySelector("[class*='title']")?.textContent ||
              ""
          );
          const artist = clean(
            artistLinks.map((link) => link.textContent).join(", ") ||
              row.querySelector(".d-track__artists")?.textContent ||
              row.querySelector(".d-track__artists a")?.textContent ||
              row.querySelector("[class*='SeparatedArtists']")?.textContent ||
              row.querySelector("[class*='Artists']")?.textContent ||
              row.querySelector("[class*='artists']")?.textContent ||
              ""
          );
          const href =
            trackLink?.getAttribute("href") || "";

          if (!artist || !title) {
            return null;
          }

          return {
            key: href || `${artist} - ${title}`,
            line: `${artist} - ${title}`,
          };
        })
        .filter(Boolean);
    }

    function appendWithOverlap(collected, visible) {
      if (visible.length === 0) {
        return;
      }

      if (collected.length === 0) {
        collected.push(...visible);
        return;
      }

      const maxOverlap = Math.min(collected.length, visible.length);
      let overlap = 0;

      for (let size = maxOverlap; size > 0; size -= 1) {
        let matches = true;
        for (let index = 0; index < size; index += 1) {
          const left = collected[collected.length - size + index];
          const right = visible[index];
          if (left.key !== right.key || left.line !== right.line) {
            matches = false;
            break;
          }
        }

        if (matches) {
          overlap = size;
          break;
        }
      }

      collected.push(...visible.slice(overlap));
    }

    function getScrollableNodes() {
      return [...document.querySelectorAll("body *")]
        .filter((element) => element.scrollHeight > element.clientHeight + 300)
        .sort(
          (left, right) =>
            right.scrollHeight -
            right.clientHeight -
            (left.scrollHeight - left.clientHeight)
        );
    }

    function scrollForward() {
      const nodes = getScrollableNodes();
      const node = nodes.find(
        (element) =>
          element.scrollTop < element.scrollHeight - element.clientHeight - 4
      );

      if (node) {
        node.scrollTop += Math.max(500, Math.floor(node.clientHeight * 0.8));
        return `${node.scrollTop}:${node.scrollHeight}`;
      }

      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
      return `${window.scrollY}:${document.body.scrollHeight}`;
    }

    const collected = [];
    appendWithOverlap(collected, extractVisibleTracks());

    let stablePasses = 0;
    let lastCount = collected.length;
    let lastScrollState = "";

    while (stablePasses < 8) {
      const state = scrollForward();
      await delayInner(900);
      appendWithOverlap(collected, extractVisibleTracks());

      if (collected.length === lastCount && state === lastScrollState) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
        lastCount = collected.length;
        lastScrollState = state;
      }
    }

    const unique = [];
    const seen = new Set();
    for (const track of collected) {
      if (seen.has(track.key)) {
        continue;
      }

      seen.add(track.key);
      unique.push(track.line);
    }

    return unique;
  });
}

async function getYandexPlaylistTitle(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/[\s\n ]+/g, " ").trim();
    return (
      clean(document.querySelector("h1")?.textContent || "") ||
      clean(document.querySelector("[class*='page-playlist__title']")?.textContent || "") ||
      clean(document.title || "") ||
      "yandex-music"
    ).replace(/\s*[—-]\s*Яндекс Музыка.*$/i, "");
  });
}

function buildOutputPath(outPath, playlistTitle) {
  return (
    outPath ||
    path.resolve(
      process.cwd(),
      "playlists",
      `${sanitizeFileName(playlistTitle)}.txt`
    )
  );
}

function writeSplitFiles({ lines, sourcePath, maxLines, outDir }) {
  const baseName = sanitizeFileName(
    path.basename(sourcePath, path.extname(sourcePath))
  );
  const finalOutDir =
    outDir || path.join(process.cwd(), "split", sanitizeFileName(baseName));
  const chunks = splitPlaylistLines(lines, maxLines);

  ensureDirectory(finalOutDir);

  return chunks.map((chunk, index) => {
    const chunkPath = path.join(
      finalOutDir,
      `${baseName}.part${String(index + 1).padStart(2, "0")}.txt`
    );
    writePlaylistFile(chunkPath, chunk);
    return chunkPath;
  });
}

async function exportFromPage({
  page,
  playlistUrl,
  outPath,
  browserLabel,
  split,
  maxLines,
  splitOutDir,
  reuseCurrentPage = false,
}) {
  const targetUrl = resolveYandexTarget(playlistUrl);

  if (!reuseCurrentPage) {
    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch (error) {
      if (!/ERR_ABORTED|frame was detached/i.test(error.message || "")) {
        throw error;
      }

      await delay(1500);
    }
  }

  await waitForYandexMusicPage(page, browserLabel);
  const tracks = await loadFullYandexPlaylist(page);
  const playlistTitle = await getYandexPlaylistTitle(page);

  if (tracks.length === 0) {
    throw new Error("No Yandex Music tracks found on the page.");
  }

  const finalOutPath = buildOutputPath(outPath, playlistTitle);
  writePlaylistFile(finalOutPath, tracks);

  const splitFiles = split
    ? writeSplitFiles({
        lines: tracks,
        sourcePath: finalOutPath,
        maxLines,
        outDir: splitOutDir,
      })
    : [];

  return {
    browser: browserLabel,
    outPath: finalOutPath,
    playlistTitle,
    trackCount: tracks.length,
    sample: tracks.slice(0, 5),
    split: split
      ? {
          maxLines,
          chunkCount: splitFiles.length,
          files: splitFiles,
        }
      : null,
  };
}

async function exportYandexMusicPlaylist({
  playlistUrl,
  outPath,
  profileDir,
  browserName = "chrome",
  executablePath,
  headless = false,
  split = false,
  maxLines = 500,
  splitOutDir,
}) {
  if (isYandexLikedAlias(playlistUrl)) {
    throw new Error(
      "The `liked` shortcut is available in attach mode only. Open your Yandex Music liked playlist in Chrome and run with --attach, or pass the full playlist URL directly."
    );
  }

  const normalizedBrowserName = normalizeBrowserName(browserName);
  const context = await launchManagedContext({
    browserName: normalizedBrowserName,
    profileDir,
    headless,
    executablePath,
  });

  try {
    const page = await context.newPage();
    try {
      return await exportFromPage({
        page,
        playlistUrl,
        outPath,
        browserLabel: normalizedBrowserName,
        split,
        maxLines,
        splitOutDir,
      });
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await context.close();
  }
}

async function exportYandexMusicPlaylistAttached({
  playlistUrl,
  outPath,
  attachUrl = "http://127.0.0.1:9222",
  split = false,
  maxLines = 500,
  splitOutDir,
}) {
  const browser = await connectToAttachedBrowser(attachUrl);
  const context = browser.contexts()[0];

  if (!context) {
    throw new Error(
      "No browser context found on the attached Chromium instance."
    );
  }

  const existingPages = context.pages();
  const preferredExistingPage = isYandexLikedAlias(playlistUrl)
    ? existingPages.find((item) => isYandexPlaylistUrl(item.url()))
    : existingPages.find((item) => item.url().includes("music.yandex.ru"));
  const page = preferredExistingPage || (await context.newPage());
  const createdNewPage = !existingPages.includes(page);

  try {
    return await exportFromPage({
      page,
      playlistUrl,
      outPath,
      browserLabel: "attached-chromium",
      split,
      maxLines,
      splitOutDir,
      reuseCurrentPage:
        isYandexLikedAlias(playlistUrl) && isYandexPlaylistUrl(page.url()),
    });
  } finally {
    if (createdNewPage) {
      await page.close().catch(() => {});
    }
    await browser.close();
  }
}

module.exports = {
  exportYandexMusicPlaylist,
  exportYandexMusicPlaylistAttached,
  resolveYandexTarget,
};
