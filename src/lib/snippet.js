function getVkExportSnippet() {
  return `(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => (value || "").replace(/[\\s\\n ]+/g, " ").trim();

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

  async function loadFullPlaylist() {
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
            key: titleLink?.getAttribute("href") || artist + " - " + title,
            line: artist + " - " + title
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
            key: artist + " - " + title,
            line: artist + " - " + title
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
          "[class*='vkuiCellButton__host'][role='button']"
        ].join(", ")
      );

      if (!expandButton) {
        return false;
      }

      const text = clean(expandButton.textContent || "").toLowerCase();
      if (text && !text.includes("показать все")) {
        return false;
      }

      expandButton.click();
      await delay(1500);
      return true;
    }

    const expectedTrackCount = getExpectedTrackCount();
    const collectedTracks = [];
    const appendVisibleTracks = () => {
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
    };

    await expandPlaylistIfNeeded();
    appendVisibleTracks();

    let stablePasses = 0;
    let lastSeenCount = collectedTracks.length;
    let lastScrollHeight = -1;

    while (stablePasses < 6) {
      const rows = document.querySelectorAll("[class*='vkitAudioRow__root'], .audio_row__performer_title");
      rows[rows.length - 1]?.scrollIntoView({ block: "end" });
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
      await delay(900);
      await expandPlaylistIfNeeded();
      appendVisibleTracks();

      if (expectedTrackCount && collectedTracks.length >= expectedTrackCount) {
        break;
      }

      const currentScrollHeight = document.body.scrollHeight;
      if (collectedTracks.length === lastSeenCount && currentScrollHeight === lastScrollHeight) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
        lastSeenCount = collectedTracks.length;
        lastScrollHeight = currentScrollHeight;
      }
    }

    return collectedTracks.map((track) => track.line);
  }

  const title = clean(document.querySelector("h1")?.textContent || document.title || "vk-playlist");
  const tracks = await loadFullPlaylist();

  if (tracks.length === 0) {
    alert("Music not found");
    return;
  }

  console.log("VK playlist export: found " + tracks.length + " tracks");
  saveToFile(title + ".txt", tracks.join("\\n"));
})();`;
}

module.exports = {
  getVkExportSnippet,
};
