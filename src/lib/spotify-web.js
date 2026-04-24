const fs = require("node:fs");
const path = require("node:path");
const { connectToAttachedBrowser } = require("./browser");
const { ensureDirectory } = require("./files");

const SPOTIFY_ADD_LIKED_LABELS = [
  "Добавить в любимые треки",
  "Add to Liked Songs",
];
const SPOTIFY_REMOVE_LIKED_LABELS = [
  "Удалить из любимых треков",
  "Remove from Liked Songs",
];
const SPOTIFY_REMOVE_FROM_PLAYLIST_LABELS = [
  "Удалить из этого плейлиста",
  "Remove from this playlist",
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value) {
  return (value || "").replace(/[\s\n ]+/g, " ").trim();
}

function buildReport({
  pageUrl,
  pageTitle,
  expectedRowCount,
  newLikes,
  maxNewLikes,
  retryPerRow,
  skipped,
  onlyTrackKeys,
  retrySkippedInSameRun,
  results,
  error,
}) {
  const summary = results.reduce(
    (accumulator, item) => {
      accumulator.total += 1;
      accumulator[item.status] = (accumulator[item.status] || 0) + 1;
      return accumulator;
    },
    { total: 0 }
  );

  return {
    url: pageUrl,
    title: pageTitle,
    generatedAt: new Date().toISOString(),
    summary: {
      ...summary,
      expectedRowCount,
      newLikes,
      maxNewLikes: Number.isFinite(maxNewLikes) ? maxNewLikes : null,
      retryPerRow,
      skippedCount: skipped.size,
      onlyTrackKeys: onlyTrackKeys ? onlyTrackKeys.size : null,
      retrySkippedInSameRun,
    },
    error: error
      ? {
          message: error.message,
        }
      : null,
    results,
  };
}

function writeReport(reportPath, report) {
  ensureDirectory(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

async function findSpotifyPlaylistPage(browser) {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((item) =>
    item.url().includes("open.spotify.com/playlist/")
  );

  if (!page) {
    throw new Error(
      "Could not find an open Spotify playlist tab in the attached browser."
    );
  }

  await page.bringToFront();
  return page;
}

async function closeMenus(page) {
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Escape").catch(() => {});
    await delay(120);

    const stillOpen = await page.evaluate(() => {
      const isVisible = (element) => {
        if (!element) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };

      return [...document.querySelectorAll('[role="menu"]')].some(isVisible);
    });

    if (!stillOpen) {
      break;
    }
  }
}

async function waitForVisibleMenu(page, timeoutMs = 2500) {
  await page.waitForFunction(
    () => {
      const isVisible = (element) => {
        if (!element) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };

      return [...document.querySelectorAll('[role="menu"]')].some(isVisible);
    },
    undefined,
    { timeout: timeoutMs }
  );
}

async function scrollTracklistToTop(page) {
  await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("body *")]
      .filter((element) => element.scrollHeight > element.clientHeight + 500)
      .sort(
        (left, right) =>
          right.scrollHeight -
          right.clientHeight -
          (left.scrollHeight - left.clientHeight)
      );
    const scrollNode = candidates.find((element) => element.scrollTop > 0) || candidates[0];

    if (scrollNode) {
      scrollNode.scrollTop = 0;
      return;
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.keyboard.press("Home").catch(() => {});
  await delay(500);
}

async function scrollTracklistForward(page, visitedKeys) {
  const visitedArray = [...visitedKeys];

  const info = await page.evaluate((visited) => {
    const visitedSet = new Set(visited);
    const tracklist = document.querySelector('[data-testid="playlist-tracklist"]');
    if (!tracklist) return { ok: false, reason: "no-tracklist" };

    const rows = [...tracklist.querySelectorAll('[data-testid="tracklist-row"]')];

    let scrollNode = null;
    let el = tracklist.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === "scroll" || s.overflowY === "auto") && el.scrollHeight > el.clientHeight) {
        scrollNode = el;
        break;
      }
      el = el.parentElement;
    }
    if (!scrollNode) return { ok: false, reason: "no-scroll-container" };

    const containerRect = scrollNode.getBoundingClientRect();
    const before = scrollNode.scrollTop;

    const getKey = (row) => {
      const href = row.querySelector('a[href^="/track/"]')?.getAttribute("href") || "";
      return href.split("/track/")[1]?.split("?")[0] || "";
    };

    const positioned = rows
      .map((row) => ({
        key: getKey(row),
        absTop: row.getBoundingClientRect().top - containerRect.top + before,
      }))
      .filter((r) => r.key && !visitedSet.has(r.key))
      .sort((a, b) => a.absTop - b.absTop);

    const next = positioned.find((r) => r.absTop > before + 50);

    if (next) {
      scrollNode.scrollTop = next.absTop;
    } else {
      scrollNode.scrollTop += Math.floor(scrollNode.clientHeight * 0.7);
    }

    return {
      ok: true,
      before: Math.round(before),
      after: Math.round(scrollNode.scrollTop),
      unvisited: positioned.length,
      target: next ? Math.round(next.absTop) : null,
    };
  }, visitedArray);

  process.stdout.write(`[scroll] ${JSON.stringify(info)}\n`);

  if (!info.ok || info.after === info.before) {
    const center = await page.evaluate(() => ({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }));
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, 800);
    process.stdout.write(`[scroll] fallback wheel\n`);
  }
}

async function getTracklistState(page) {
  return page.evaluate(() => {
    const cleanText = (value) => (value || "").replace(/[\s\n ]+/g, " ").trim();
    const tracklist = document.querySelector('[data-testid="playlist-tracklist"]');
    const rows = tracklist
      ? [...tracklist.querySelectorAll('[data-testid="tracklist-row"]')]
      : [];

    const expectedRowCount = Number(tracklist?.getAttribute("aria-rowcount") || "0");

    return {
      expectedRowCount:
        Number.isFinite(expectedRowCount) && expectedRowCount > 0
          ? expectedRowCount
          : 0,
      rows: rows.map((row) => {
        const href =
          row.querySelector('a[href^="/track/"]')?.getAttribute("href") || "";
        const trackId = href.split("/track/")[1]?.split("?")[0] || "";
        const key = trackId || cleanText(row.textContent || "");
        const rect = row.getBoundingClientRect();
        const inViewport = rect.bottom > 0 && rect.top < window.innerHeight;
        return {
          key,
          inViewport,
          label: cleanText(row.textContent || "").slice(0, 220),
        };
      }),
    };
  });
}

async function openMenuForRow(page, rowIndex) {
  await closeMenus(page);
  await delay(80);

  const rowCenter = await page.evaluate((index) => {
    const rows = [...document.querySelectorAll(
      '[data-testid="playlist-tracklist"] [data-testid="tracklist-row"]'
    )];
    const row = rows[index];
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, rowIndex);

  if (!rowCenter) throw new Error(`Row ${rowIndex} not found in DOM`);

  await page.mouse.move(rowCenter.x, rowCenter.y);
  await delay(100);

  const buttonCenter = await page.evaluate((index) => {
    const rows = [...document.querySelectorAll(
      '[data-testid="playlist-tracklist"] [data-testid="tracklist-row"]'
    )];
    const row = rows[index];
    if (!row) return null;
    const btn = row.querySelector('[data-testid="more-button"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, rowIndex);

  if (!buttonCenter) throw new Error(`More button not found for row ${rowIndex}`);

  await page.mouse.move(buttonCenter.x, buttonCenter.y);
  await delay(60);
  await page.mouse.click(buttonCenter.x, buttonCenter.y);
  await waitForVisibleMenu(page);
}

async function clickMenuItemByLabels(page, labels) {
  const center = await page.evaluate((labelList) => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const item = items.find((el) =>
      labelList.some((l) => el.textContent.includes(l))
    );
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, labels);

  if (!center) return false;
  await page.mouse.click(center.x, center.y);
  return true;
}

async function getMenuAction(page) {
  const hasRemove = await page.evaluate((labels) => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    return items.some((el) => labels.some((l) => el.textContent.includes(l)));
  }, SPOTIFY_REMOVE_LIKED_LABELS);

  if (hasRemove) {
    return "already-liked";
  }

  const hasAdd = await page.evaluate((labels) => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    return items.some((el) => labels.some((l) => el.textContent.includes(l)));
  }, SPOTIFY_ADD_LIKED_LABELS);

  if (hasAdd) {
    return "can-like";
  }

  return "action-not-found";
}

async function removeRowFromPlaylistViaMenu(page, rowIndex) {
  try {
    await openMenuForRow(page, rowIndex);
    const clicked = await clickMenuItemByLabels(page, SPOTIFY_REMOVE_FROM_PLAYLIST_LABELS);
    if (clicked) {
      await delay(300);
      process.stdout.write(`[remove-from-playlist] done for row ${rowIndex}\n`);
    } else {
      process.stdout.write(`[remove-from-playlist] item not found in menu for row ${rowIndex}\n`);
      await closeMenus(page);
    }
  } catch (err) {
    process.stdout.write(`[remove-from-playlist] error: ${err.message}\n`);
    await closeMenus(page).catch(() => {});
  }
}

function readSkippedTrackKeys(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const results = Array.isArray(report.results) ? report.results : [];
  return new Set(
    results
      .filter((item) => item?.status === "menu-not-found" && item?.key)
      .map((item) => item.key)
  );
}

async function likeTracksInOpenSpotifyPlaylist({
  attachUrl = "http://127.0.0.1:9222",
  maxNewLikes = Infinity,
  retryPerRow = 5,
  reportPath,
  onlyTrackKeys = null,
  retrySkippedInSameRun = false,
  removeFromPlaylist = false,
}) {
  const browser = await connectToAttachedBrowser(attachUrl);
  const finalReportPath =
    reportPath ||
    path.join(process.cwd(), "reports", `spotify-web-like-${Date.now()}.json`);

  try {
    const page = await findSpotifyPlaylistPage(browser);
    await scrollTracklistToTop(page);
    await delay(800);
    const finalized = new Set();
    const visited = new Set();
    const skipped = new Set();
    const resultMap = new Map();
    let newLikes = 0;
    let stablePasses = 0;
    let lastVisitedCount = 0;
    let expectedRowCount = 0;
    let pageUrl = page.url();
    let pageTitle = await page.title();

    const flushReport = async (error = null) => {
      pageUrl = page.url();
      pageTitle = await page.title();
      const report = buildReport({
        pageUrl,
        pageTitle,
        expectedRowCount,
        newLikes,
        maxNewLikes,
        retryPerRow,
        skipped,
        onlyTrackKeys,
        retrySkippedInSameRun,
        results: [...resultMap.values()],
        error,
      });
      writeReport(finalReportPath, report);
      return report;
    };

    while (stablePasses < 6 && newLikes < maxNewLikes) {
      const state = await getTracklistState(page);
      expectedRowCount = state.expectedRowCount || expectedRowCount;

      let processedThisPass = 0;

      for (let rowIndex = 0; rowIndex < state.rows.length; rowIndex += 1) {
        if (newLikes >= maxNewLikes) {
          break;
        }

        const rowMeta = state.rows[rowIndex];
        if (!rowMeta?.key || !rowMeta.inViewport || finalized.has(rowMeta.key) || visited.has(rowMeta.key)) {
          continue;
        }
        if (onlyTrackKeys && !onlyTrackKeys.has(rowMeta.key)) {
          continue;
        }

        let result = {
          key: rowMeta.key,
          label: rowMeta.label,
          status: "menu-not-found",
        };

        for (let attempt = 0; attempt < retryPerRow; attempt += 1) {
          try {
            await openMenuForRow(page, rowIndex);
            const action = await getMenuAction(page);

            if (action === "already-liked") {
              result.status = "already-liked";
              if (removeFromPlaylist) {
                await closeMenus(page);
                await removeRowFromPlaylistViaMenu(page, rowIndex);
              } else {
                await closeMenus(page);
              }
              break;
            }

            if (action === "can-like") {
              const clicked = await clickMenuItemByLabels(page, SPOTIFY_ADD_LIKED_LABELS);
              if (!clicked) {
                result.status = "action-not-found";
                await closeMenus(page);
                continue;
              }
              await delay(300);
              result.status = "liked";
              newLikes += 1;
              if (removeFromPlaylist) {
                await removeRowFromPlaylistViaMenu(page, rowIndex);
              }
              break;
            }

            result.status = "action-not-found";
            await closeMenus(page);
          } catch (error) {
            result.status = "menu-not-found";
            await closeMenus(page);
            await delay(160);
          }
        }

        visited.add(rowMeta.key);
        resultMap.set(rowMeta.key, result);
        if (result.status === "menu-not-found") {
          skipped.add(rowMeta.key);
        } else {
          skipped.delete(rowMeta.key);
          finalized.add(rowMeta.key);
        }
        processedThisPass += 1;
        process.stdout.write(
          `[spotify-like-attach] ${result.status} - ${result.label}\n`
        );

        if (resultMap.size % 25 === 0) {
          await flushReport();
        }

        // After removing a row the DOM shifts — re-read state before continuing
        if (removeFromPlaylist && result.status !== "menu-not-found") {
          break;
        }
      }

      if (newLikes >= maxNewLikes) {
        break;
      }

      if (!removeFromPlaylist) {
        const currentVisitedCount = visited.size;
        if (expectedRowCount && currentVisitedCount >= expectedRowCount) {
          break;
        }
        await scrollTracklistForward(page, visited);
        await delay(650);
        if (currentVisitedCount === lastVisitedCount) {
          stablePasses += 1;
        } else {
          stablePasses = 0;
          lastVisitedCount = currentVisitedCount;
        }
      } else {
        // Playlist shrinks — stable when nothing got processed this pass
        await delay(400);
        if (processedThisPass === 0) {
          stablePasses += 1;
        } else {
          stablePasses = 0;
        }
      }
    }

    if (retrySkippedInSameRun && skipped.size > 0 && newLikes < maxNewLikes) {
      process.stdout.write(
        `[spotify-like-attach] starting retry pass for ${skipped.size} skipped tracks\n`
      );

      await scrollTracklistToTop(page);
      await delay(800);

      stablePasses = 0;
      lastVisitedCount = 0;

      while (stablePasses < 6 && skipped.size > 0 && newLikes < maxNewLikes) {
        const state = await getTracklistState(page);
        expectedRowCount = state.expectedRowCount || expectedRowCount;
        let retriedThisPass = 0;

        for (let rowIndex = 0; rowIndex < state.rows.length; rowIndex += 1) {
          if (newLikes >= maxNewLikes) {
            break;
          }

          const rowMeta = state.rows[rowIndex];
          if (!rowMeta?.key || !rowMeta.inViewport || !skipped.has(rowMeta.key)) {
            continue;
          }

          let result = {
            key: rowMeta.key,
            label: rowMeta.label,
            status: "menu-not-found",
          };

          for (let attempt = 0; attempt < retryPerRow; attempt += 1) {
            try {
              await openMenuForRow(page, rowIndex);
              const action = await getMenuAction(page);

              if (action === "already-liked") {
                result.status = "already-liked";
                if (removeFromPlaylist) {
                  await closeMenus(page);
                  await removeRowFromPlaylistViaMenu(page, rowIndex);
                } else {
                  await closeMenus(page);
                }
                break;
              }

              if (action === "can-like") {
                const clicked = await clickMenuItemByLabels(page, SPOTIFY_ADD_LIKED_LABELS);
                if (!clicked) {
                  result.status = "action-not-found";
                  await closeMenus(page);
                  continue;
                }
                await delay(300);
                result.status = "liked";
                newLikes += 1;
                if (removeFromPlaylist) {
                  await removeRowFromPlaylistViaMenu(page, rowIndex);
                }
                break;
              }

              result.status = "action-not-found";
              await closeMenus(page);
            } catch (error) {
              result.status = "menu-not-found";
              await closeMenus(page);
              await delay(160);
            }
          }

          retriedThisPass += 1;
          resultMap.set(rowMeta.key, result);
          if (result.status !== "menu-not-found") {
            skipped.delete(rowMeta.key);
            finalized.add(rowMeta.key);
          }
          process.stdout.write(
            `[spotify-like-attach][retry] ${result.status} - ${result.label}\n`
          );

          if (resultMap.size % 25 === 0) {
            await flushReport();
          }

          if (removeFromPlaylist && result.status !== "menu-not-found") {
            break;
          }
        }

        if (skipped.size === 0 || newLikes >= maxNewLikes) {
          break;
        }

        if (!removeFromPlaylist) {
          await scrollTracklistForward(page, finalized);
          await delay(650);
        } else {
          await delay(400);
        }

        if (retriedThisPass === 0) {
          stablePasses += 1;
        } else {
          stablePasses = 0;
        }
      }
    }

    const report = await flushReport();

    return {
      ...report.summary,
      reportPath: finalReportPath,
      url: report.url,
      title: report.title,
    };
  } catch (error) {
    try {
      const page = await findSpotifyPlaylistPage(browser);
      const pageUrl = page.url();
      const pageTitle = await page.title();
      const existingReport = fs.existsSync(finalReportPath)
        ? JSON.parse(fs.readFileSync(finalReportPath, "utf8"))
        : null;
      const report = buildReport({
        pageUrl,
        pageTitle,
        expectedRowCount: existingReport?.summary?.expectedRowCount || 0,
        newLikes: existingReport?.summary?.newLikes || 0,
        maxNewLikes,
        retryPerRow,
        skipped: new Set(),
        onlyTrackKeys,
        retrySkippedInSameRun,
        results: existingReport?.results || [],
        error,
      });
      writeReport(finalReportPath, report);
    } catch (_) {
      // best-effort checkpoint
    }
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = {
  likeTracksInOpenSpotifyPlaylist,
  readSkippedTrackKeys,
};
