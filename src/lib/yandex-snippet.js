function getYandexMusicExportSnippet() {
  return `(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => (value || "").replace(/[\\s\\n ]+/g, " ").trim();
  const maxStablePasses = Number(window.__yandexMusicExportOptions?.maxStablePasses || 8) || 8;

  function saveToFile(filename, content) {
    const data = content.replace(/\\n/g, "\\r\\n");
    const blob = new Blob([data], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function getTitle() {
    return (
      clean(document.querySelector("h1")?.textContent || "") ||
      clean(document.querySelector("[class*='page-playlist__title']")?.textContent || "") ||
      clean(document.title || "") ||
      "yandex-music"
    ).replace(/\\s*[—-]\\s*Яндекс Музыка.*$/i, "");
  }

  function extractVisibleTracks() {
    const rows = [
      ...document.querySelectorAll([
        ".d-track",
        "[class*='CommonTrack_root']",
        "[class*='Track_track']",
        "[data-testid*='track']",
        "[aria-label][role='button']",
      ].join(", ")),
    ];

    return rows
      .map((row) => {
        const trackLink =
          row.querySelector("a[href*='/album/'][href*='/track/']") ||
          row.querySelector("a[href*='/track/']");
        const artistLinks = [...row.querySelectorAll("a[href*='/artist/']")];
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
          key: href || artist + " - " + title,
          line: artist + " - " + title,
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
      .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight));
  }

  function scrollForward() {
    const nodes = getScrollableNodes();
    const node = nodes.find((element) => element.scrollTop < element.scrollHeight - element.clientHeight - 4);
    if (node) {
      node.scrollTop += Math.max(500, Math.floor(node.clientHeight * 0.8));
      return node.scrollTop + ":" + node.scrollHeight;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    return window.scrollY + ":" + document.body.scrollHeight;
  }

  const collected = [];
  appendWithOverlap(collected, extractVisibleTracks());

  let stablePasses = 0;
  let lastCount = collected.length;
  let lastScrollState = "";

  while (stablePasses < maxStablePasses) {
    const state = scrollForward();
    await delay(900);
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
    if (seen.has(track.key)) continue;
    seen.add(track.key);
    unique.push(track.line);
  }

  if (unique.length === 0) {
    alert("Yandex Music tracks not found");
    return;
  }

  console.log("Yandex Music export: found " + unique.length + " tracks");
  saveToFile(getTitle() + ".txt", unique.join("\\n"));
})();`;
}

module.exports = {
  getYandexMusicExportSnippet,
};
