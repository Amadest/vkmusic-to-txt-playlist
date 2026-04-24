const { connectToAttachedBrowser } = require("./src/lib/browser");

async function main() {
  const browser = await connectToAttachedBrowser("http://127.0.0.1:9222");
  const pages = browser.contexts().flatMap(c => c.pages());
  const page = pages.find(p => p.url().includes("open.spotify.com/playlist/"));
  if (!page) { console.log("No playlist tab found"); await browser.close(); return; }

  const state = await page.evaluate(() => {
    const tracklist = document.querySelector('[data-testid="playlist-tracklist"]');
    if (!tracklist) return { error: "no tracklist" };

    const rows = [...tracklist.querySelectorAll('[data-testid="tracklist-row"]')];

    let scrollNode = null;
    let el = tracklist.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === "scroll" || s.overflowY === "auto") && el.scrollHeight > el.clientHeight) {
        scrollNode = el; break;
      }
      el = el.parentElement;
    }

    const containerRect = scrollNode ? scrollNode.getBoundingClientRect() : { top: 0 };

    return {
      scrollTop: scrollNode ? Math.round(scrollNode.scrollTop) : null,
      clientHeight: scrollNode ? scrollNode.clientHeight : null,
      ariaRowcount: tracklist.getAttribute("aria-rowcount"),
      sampleRows: rows.slice(0, 5).map(row => ({
        ariaRowindex: row.getAttribute("aria-rowindex"),
        hasTrackLink: !!row.querySelector('a[href^="/track/"]'),
        trackId: (row.querySelector('a[href^="/track/"]')?.getAttribute("href") || "").split("/track/")[1]?.split("?")[0]?.slice(0, 12),
        topRelContainer: Math.round(row.getBoundingClientRect().top - containerRect.top + (scrollNode?.scrollTop || 0)),
      })),
      rowsBetweenFirst2: rows.length >= 2
        ? Math.round(rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top)
        : null,
    };
  });

  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
