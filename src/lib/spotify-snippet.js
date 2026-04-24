function getSpotifyLikeSnippet() {
  return `(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => (value || "").replace(/[\\s\\n ]+/g, " ").trim();
  const addNeedle = "\\u0434\\u043e\\u0431\\u0430\\u0432\\u0438\\u0442\\u044c \\u0432 \\u043b\\u044e\\u0431\\u0438\\u043c\\u044b\\u0435 \\u0442\\u0440\\u0435\\u043a\\u0438";
  const removeNeedle = "\\u0443\\u0434\\u0430\\u043b\\u0438\\u0442\\u044c \\u0438\\u0437 \\u043b\\u044e\\u0431\\u0438\\u043c\\u044b\\u0445 \\u0442\\u0440\\u0435\\u043a\\u043e\\u0432";
  const maxNewLikes =
    Number(window.__spotifyLikeOptions?.maxNewLikes || 0) || Infinity;
  const verifyEachLike = window.__spotifyLikeOptions?.verify === true;
  const downloadReport = window.__spotifyLikeOptions?.downloadReport === true;
  const retryPerRow = Math.max(
    1,
    Number(window.__spotifyLikeOptions?.retryPerRow || 3) || 3
  );
  const onlyLabels = Array.isArray(window.__spotifyLikeOptions?.onlyLabels)
    ? window.__spotifyLikeOptions.onlyLabels
    : null;

  function getTracklist() {
    return document.querySelector('[data-testid="playlist-tracklist"]');
  }

  function getRows() {
    const tracklist = getTracklist();
    return tracklist
      ? [...tracklist.querySelectorAll('[data-testid="tracklist-row"]')]
      : [];
  }

  function getExpectedRowCount() {
    const value = Number(getTracklist()?.getAttribute("aria-rowcount") || "0");
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function getTrackId(row) {
    const href =
      row.querySelector('a[href^="/track/"]')?.getAttribute("href") || "";
    return href.split("/track/")[1]?.split("?")[0] || "";
  }

  function getRowLabel(row) {
    return clean(row.textContent || "").slice(0, 220);
  }

  function normalizeMatchLabel(value) {
    return clean(value || "")
      .replace(/^\\d+/, "")
      .replace(
        /\\d+\\s+(?:\\u0441\\u0435\\u043a\\u0443\\u043d\\u0434(?:\\u044b|\\u0430)?|\\u043c\\u0438\\u043d\\u0443\\u0442(?:\\u044b|\\u0443|\\u0430)?|\\u0447\\u0430\\u0441(?:\\u0430|\\u043e\\u0432)?|\\u0434\\u0435\\u043d\\u044c|\\u0434\\u043d\\u044f|\\u0434\\u043d\\u0435\\u0439|\\u043d\\u0435\\u0434\\u0435\\u043b\\u044f|\\u043d\\u0435\\u0434\\u0435\\u043b\\u0438|\\u043d\\u0435\\u0434\\u0435\\u043b\\u044c|\\u043c\\u0435\\u0441\\u044f\\u0446(?:\\u0430|\\u0435\\u0432)?|\\u0433\\u043e\\u0434(?:\\u0430|\\u043e\\u0432)?|\\u043b\\u0435\\u0442)\\s+\\u043d\\u0430\\u0437\\u0430\\u0434\\d{1,2}:\\d{2}$/i,
        ""
      )
      .replace(/\\d{1,2}:\\d{2}$/, "")
      .toLowerCase();
  }

  const onlyLabelSet = onlyLabels
    ? new Set(onlyLabels.map((label) => normalizeMatchLabel(label)))
    : null;

  function isVisible(element) {
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
  }

  async function closeMenus() {
    for (let index = 0; index < 8; index += 1) {
      for (const button of getOpenMenuButtons()) {
        button.click();
      }

      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      );
      document.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Escape",
          bubbles: true,
        })
      );
      await delay(100);

      document.body.click();
      await delay(120);

      if (getOpenMenuButtons().length === 0 && getVisibleMenus().length === 0) {
        break;
      }
    }
  }

  function getVisibleMenus() {
    return [...document.querySelectorAll('[role="menu"]')].filter(isVisible);
  }

  function getOpenMenuButtons() {
    return [
      ...document.querySelectorAll(
        '[data-testid="more-button"][data-context-menu-open="true"], [data-testid="more-button"][aria-expanded="true"]'
      ),
    ];
  }

  function getVisibleMenuItems(menu) {
    return [...menu.querySelectorAll('[role="menuitem"]')]
      .filter(isVisible)
      .map((element) => ({
        element,
        text: clean(element.textContent || ""),
      }));
  }

  async function openSingleMenu(row) {
    const moreButton = row.querySelector('[data-testid="more-button"]');
    if (!moreButton) {
      return null;
    }

    await closeMenus();
    row.scrollIntoView({ block: "center" });
    await delay(120);
    moreButton.click();
    await delay(280);

    const menus = getVisibleMenus();
    if (menus.length === 0) {
      return null;
    }

    if (menus.length === 1) {
      return menus[0];
    }

    const buttonRect = moreButton.getBoundingClientRect();
    return (
      menus
        .map((menu) => {
          const rect = menu.getBoundingClientRect();
          return {
            menu,
            distance:
              Math.abs(rect.top - buttonRect.top) +
              Math.abs(rect.left - buttonRect.left),
          };
        })
        .sort((left, right) => left.distance - right.distance)[0]?.menu || null
    );
  }

  async function verifyLiked(row) {
    const menu = await openSingleMenu(row);
    if (!menu) {
      return false;
    }

    const items = getVisibleMenuItems(menu);
    const confirmed = items.some((item) =>
      item.text.toLowerCase().includes(removeNeedle)
    );
    await closeMenus();
    return confirmed;
  }

  async function processRow(row) {
    const label = getRowLabel(row);
    let lastStatus = "menu-not-found";

    for (let attempt = 0; attempt < retryPerRow; attempt += 1) {
      const menu = await openSingleMenu(row);
      if (!menu) {
        lastStatus = "menu-not-found";
        await delay(180);
        continue;
      }

      const items = getVisibleMenuItems(menu);
      const hasRemove = items.some((item) =>
        item.text.toLowerCase().includes(removeNeedle)
      );
      if (hasRemove) {
        await closeMenus();
        return { label, status: "already-liked" };
      }

      const addItem = items.find((item) =>
        item.text.toLowerCase().includes(addNeedle)
      );
      if (!addItem) {
        lastStatus = "add-action-not-found";
        await closeMenus();
        await delay(180);
        continue;
      }

      addItem.element.click();
      await delay(450);

      if (!verifyEachLike) {
        await closeMenus();
        return {
          label,
          status: "liked",
        };
      }

      const confirmed = await verifyLiked(row);
      if (confirmed) {
        return {
          label,
          status: "liked",
        };
      }

      lastStatus = "click-failed";
      await delay(180);
    }

    return { label, status: lastStatus };
  }

  const processed = new Set();
  const results = [];
  const expectedRowCount = getExpectedRowCount();
  let newLikes = 0;
  let stablePasses = 0;
  let lastProcessedCount = 0;

  while (stablePasses < 6) {
    const rows = getRows();

    for (const row of rows) {
      if (newLikes >= maxNewLikes) {
        break;
      }

      const key = getTrackId(row) || getRowLabel(row);
      if (!key || processed.has(key)) {
        continue;
      }

      if (onlyLabelSet) {
        const matchLabel = normalizeMatchLabel(getRowLabel(row));
        if (!onlyLabelSet.has(matchLabel)) {
          continue;
        }
      }

      const result = await processRow(row);
      processed.add(key);
      results.push({ key, ...result });
      if (result.status === "liked") {
        newLikes += 1;
      }
      console.log("[spotify-like]", result.status, "-", result.label);
    }

    const currentProcessedCount = processed.size;
    if (newLikes >= maxNewLikes) {
      break;
    }
    if (expectedRowCount && currentProcessedCount >= expectedRowCount) {
      break;
    }

    const currentRows = getRows();
    currentRows[currentRows.length - 1]?.scrollIntoView({ block: "end" });
    await delay(700);

    if (currentProcessedCount === lastProcessedCount) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
      lastProcessedCount = currentProcessedCount;
    }
  }

  const summary = results.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  const finalSummary = {
    ...summary,
    expectedRowCount,
    newLikes,
    maxNewLikes: Number.isFinite(maxNewLikes) ? maxNewLikes : null,
    verifyEachLike,
    retryPerRow,
  };

  const report = {
    url: location.href,
    title: document.title,
    generatedAt: new Date().toISOString(),
    summary: finalSummary,
    results,
  };

  window.__spotifyLikeLastRun = report;

  if (downloadReport) {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.download = "spotify-like-report-" + Date.now() + ".json";
    link.href = URL.createObjectURL(blob);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  console.log("[spotify-like] summary", finalSummary);
  return report;
})();`;
}

module.exports = {
  getSpotifyLikeSnippet,
};
