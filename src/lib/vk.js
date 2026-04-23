const path = require("node:path");
const {
  connectToAttachedBrowser,
  launchManagedContext,
  normalizeBrowserName,
} = require("./browser");
const { sanitizeFileName, writePlaylistFile } = require("./files");

const TRACK_SELECTORS = {
  newRow: "[class*='vkitAudioRow__root']",
  newTitle: "[data-testid='MusicTrackRow_Title']",
  newArtist: "span[class*='vkitAudioRowInfo__text']",
  oldRow: ".audio_row__performer_title",
  oldArtist: ".audio_row__performers, .audio_row__performer",
  oldTitle: ".audio_row__title, ._audio_row__title a",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPlaylistPage(page, browserName) {
  process.stdout.write(
    `Waiting for VK playlist tracks in ${browserName}. Log into VK in the opened browser window if needed...\n`
  );

  for (;;) {
    const status = await page.evaluate((selectors) => {
      const hasNewRows = document.querySelectorAll(selectors.newRow).length > 0;
      const hasOldRows = document.querySelectorAll(selectors.oldRow).length > 0;

      return {
        hasTracks: hasNewRows || hasOldRows,
        title: document.title || "",
        url: location.href,
      };
    }, TRACK_SELECTORS);

    if (status.hasTracks) {
      return status;
    }

    if (
      /welcome|welcome to vk/i.test(status.title) ||
      status.url === "https://vk.com/"
    ) {
      process.stdout.write(
        `VK is asking for login in ${browserName}. Finish sign-in and keep the playlist page open...\n`
      );
    }

    await delay(2000);
  }
}

async function loadFullPlaylist(page) {
  return page.evaluate(async () => {
    const delayInner = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => (value || "").replace(/[\s\n ]+/g, " ").trim();

    function extractCurrentRows() {
      const newRows = [...document.querySelectorAll("[class*='vkitAudioRow__root']")]
        .map((row) => {
          const titleLink = row.querySelector("[data-testid='MusicTrackRow_Title']");
          const title = clean(
            titleLink?.textContent ||
            row.querySelector("[class*='vkitAudioRowInfo__header']")?.textContent ||
            ""
          );
          const artist = clean(
            row.querySelector("span[class*='vkitAudioRowInfo__text']")?.textContent ||
            ""
          );

          if (!artist || !title) {
            return null;
          }

          return {
            key: titleLink?.getAttribute("href") || `${artist} - ${title}`,
            line: `${artist} - ${title}`,
          };
        })
        .filter(Boolean);

      if (newRows.length > 0) {
        return newRows;
      }

      return [...document.querySelectorAll(".audio_row__performer_title")]
        .map((row) => {
          const artist = clean(
            row.querySelector(".audio_row__performers, .audio_row__performer")?.textContent || ""
          );
          const title = clean(
            row.querySelector(".audio_row__title, ._audio_row__title a")?.textContent || ""
          );

          if (!artist || !title) {
            return null;
          }

          return {
            key: `${artist} - ${title}`,
            line: `${artist} - ${title}`,
          };
        })
        .filter(Boolean);
    }

    function getExpectedTrackCount() {
      const header = document.querySelector("[data-testid='MusicPlaylistTracks_Header']");
      const text = clean(header?.textContent || "");
      const match = text.match(/\d+/);
      return match ? Number(match[0]) : null;
    }

    async function expandPlaylistIfNeeded() {
      const expandButton = document.querySelector(
        [
          "[data-testid='audiolistitems-expandbutton']",
          ".ActionButton--all",
          "[class*='vkuiCellButton__host'][role='button']",
        ].join(", ")
      );

      if (!expandButton) {
        return false;
      }

      const text = (expandButton.textContent || "")
        .replace(/[\s\n ]+/g, " ")
        .trim()
        .toLowerCase();

      if (text && !text.includes("показать все")) {
        return false;
      }

      expandButton.click();
      await delayInner(1500);
      return true;
    }

    const expectedTrackCount = getExpectedTrackCount();
    const collectedTracks = [];

    function appendVisibleTracks() {
      const visibleTracks = extractCurrentRows();
      if (visibleTracks.length === 0) {
        return;
      }

      if (collectedTracks.length === 0) {
        collectedTracks.push(...visibleTracks);
        return;
      }

      const maxOverlap = Math.min(collectedTracks.length, visibleTracks.length);
      let overlap = 0;

      for (let size = maxOverlap; size > 0; size -= 1) {
        let matches = true;
        for (let index = 0; index < size; index += 1) {
          const left = collectedTracks[collectedTracks.length - size + index];
          const right = visibleTracks[index];
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

      collectedTracks.push(...visibleTracks.slice(overlap));
    }

    await expandPlaylistIfNeeded();
    appendVisibleTracks();

    let stablePasses = 0;
    let lastSeenCount = collectedTracks.length;
    let lastScrollHeight = -1;

    while (stablePasses < 6) {
      const rows = document.querySelectorAll(
        "[class*='vkitAudioRow__root'], .audio_row__performer_title"
      );
      rows[rows.length - 1]?.scrollIntoView({ block: "end" });
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
      await delayInner(900);
      await expandPlaylistIfNeeded();
      appendVisibleTracks();

      if (expectedTrackCount && collectedTracks.length >= expectedTrackCount) {
        break;
      }

      const currentScrollHeight = document.body.scrollHeight;
      if (
        collectedTracks.length === lastSeenCount &&
        currentScrollHeight === lastScrollHeight
      ) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
        lastSeenCount = collectedTracks.length;
        lastScrollHeight = currentScrollHeight;
      }
    }

    return {
      expectedTrackCount,
      tracks: collectedTracks.map((track) => track.line),
    };
  });
}

async function extractTracks(page) {
  return page.evaluate((selectors) => {
    const clean = (value) => (value || "").replace(/[\s\n ]+/g, " ").trim();

    const newRows = [...document.querySelectorAll(selectors.newRow)].map(
      (row) => {
        const title = clean(
          row.querySelector(selectors.newTitle)?.textContent || ""
        );
        const artist = clean(
          row.querySelector(selectors.newArtist)?.textContent || ""
        );

        if (!artist || !title) {
          return null;
        }

        return `${artist} - ${title}`;
      }
    );

    if (newRows.some(Boolean)) {
      return newRows.filter(Boolean);
    }

    return [...document.querySelectorAll(selectors.oldRow)]
      .map((row) => {
        const artist = clean(
          row.querySelector(selectors.oldArtist)?.textContent || ""
        );
        const title = clean(
          row.querySelector(selectors.oldTitle)?.textContent || ""
        );

        if (!artist || !title) {
          return null;
        }

        return `${artist} - ${title}`;
      })
      .filter(Boolean);
  }, TRACK_SELECTORS);
}

async function getPlaylistTitle(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/[\s\n ]+/g, " ").trim();

    return (
      clean(document.querySelector("h1")?.textContent || "") ||
      clean(document.title || "") ||
      "vk-playlist"
    );
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

async function exportFromPage({
  page,
  playlistUrl,
  outPath,
  browserLabel,
}) {
  await page.goto(playlistUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await waitForPlaylistPage(page, browserLabel);
  const collected = await loadFullPlaylist(page);
  const playlistTitle = await getPlaylistTitle(page);
  const tracks =
    collected?.tracks?.length > 0 ? collected.tracks : await extractTracks(page);

  if (tracks.length === 0) {
    throw new Error("No playlist tracks found on the page.");
  }

  const finalOutPath = buildOutputPath(outPath, playlistTitle);
  writePlaylistFile(finalOutPath, tracks);

  return {
    browser: browserLabel,
    outPath: finalOutPath,
    playlistTitle,
    trackCount: tracks.length,
    sample: tracks.slice(0, 5),
  };
}

async function exportVkPlaylist({
  playlistUrl,
  outPath,
  profileDir,
  browserName = "chrome",
  executablePath,
  headless = false,
}) {
  const normalizedBrowserName = normalizeBrowserName(browserName);
  const context = await launchManagedContext({
    browserName: normalizedBrowserName,
    profileDir,
    headless,
    executablePath,
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    return exportFromPage({
      page,
      playlistUrl,
      outPath,
      browserLabel: normalizedBrowserName,
    });
  } finally {
    await context.close();
  }
}

async function exportVkPlaylistAttached({
  playlistUrl,
  outPath,
  attachUrl = "http://127.0.0.1:9222",
}) {
  const browser = await connectToAttachedBrowser(attachUrl);
  const context = browser.contexts()[0];

  if (!context) {
    throw new Error(
      "No browser context found on the attached Chromium instance."
    );
  }

  const page = await context.newPage();

  try {
    return await exportFromPage({
      page,
      playlistUrl,
      outPath,
      browserLabel: "attached-chromium",
    });
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  exportVkPlaylistAttached,
  exportVkPlaylist,
};
