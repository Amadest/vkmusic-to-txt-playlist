#!/usr/bin/env node

const path = require("node:path");
const {
  ensureDirectory,
  readPlaylistFile,
  sanitizeFileName,
  splitPlaylistLines,
  validatePlaylistLines,
  writePlaylistFile,
} = require("./lib/files");
const { getVkExportSnippet } = require("./lib/snippet");

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const eqIndex = token.indexOf("=");
    if (eqIndex !== -1) {
      const key = token.slice(2, eqIndex);
      const value = token.slice(eqIndex + 1);
      args[key] = value === "" ? true : value;
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function getConfigValue(args, key, fallback) {
  if (args[key] !== undefined) {
    return args[key];
  }

  const envKey = `npm_config_${key.replace(/-/g, "_")}`;
  if (process.env[envKey] !== undefined) {
    return process.env[envKey];
  }

  return fallback;
}

function isBooleanLikeConfigValue(value) {
  return value === true || value === "true";
}

function getRequiredArg(args, key, message) {
  const value = getConfigValue(args, key);
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function printUsage() {
  process.stdout.write(`vkmusic-to-txt-playlist

Commands:
  export   --playlist <url> [--browser <chrome|edge|firefox>] [--attach] [--attach-url <url>] [--out <path>] [--profile-dir <path>] [--executable-path <path>] [--headless]
  validate --path <file>
  split    --path <file> [--max-lines <number>] [--out-dir <path>]
  snippet
`);
}

async function runExport(args) {
  const { normalizeBrowserName } = require("./lib/browser");
  const { exportVkPlaylist, exportVkPlaylistAttached } = require("./lib/vk");
  const rawBrowserValue = getConfigValue(args, "browser");
  const playlistUrl =
    getConfigValue(args, "playlist") ||
    args._[0];
  if (!playlistUrl) {
    throw new Error("Missing --playlist <url>");
  }

  if (isBooleanLikeConfigValue(rawBrowserValue)) {
    throw new Error(
      'PowerShell/npm lost the value for --browser. Use `--browser=firefox` or run `node src/cli.js export --browser firefox --playlist "<url>"`.'
    );
  }

  const browserName = normalizeBrowserName(
    getConfigValue(args, "browser", "chrome")
  );
  const attachUrl =
    getConfigValue(args, "attach-url") ||
    (getConfigValue(args, "attach") ? "http://127.0.0.1:9222" : undefined);
  const profileDir = path.resolve(
    getConfigValue(
      args,
      "profile-dir",
      path.join(process.cwd(), ".session", browserName)
    )
  );

  let result;
  let usedAttachMode = false;
  if (attachUrl) {
    usedAttachMode = true;
    if (browserName === "firefox") {
      throw new Error(
        "Attach mode is supported only for Chrome/Edge-style Chromium browsers. Firefox should use the managed session mode or the F12 snippet fallback."
      );
    }

    result = await exportVkPlaylistAttached({
      playlistUrl,
      outPath: getConfigValue(args, "out")
        ? path.resolve(getConfigValue(args, "out"))
        : undefined,
      attachUrl,
    });
  } else {
    ensureDirectory(profileDir);

    result = await exportVkPlaylist({
      playlistUrl,
      outPath: getConfigValue(args, "out")
        ? path.resolve(getConfigValue(args, "out"))
        : undefined,
      profileDir,
      browserName,
      executablePath: getConfigValue(args, "executable-path")
        ? path.resolve(getConfigValue(args, "executable-path"))
        : undefined,
      headless: Boolean(getConfigValue(args, "headless", false)),
    });
  }

  process.stdout.write(
    JSON.stringify(
      {
        browser: result.browser,
        playlistTitle: result.playlistTitle,
        trackCount: result.trackCount,
        outPath: result.outPath,
        sample: result.sample,
      },
      null,
      2
    ) + "\n"
  );

  return usedAttachMode;
}

function runValidate(args) {
  const filePath = path.resolve(
    getConfigValue(args, "path") || args._[0] || (() => {
      throw new Error("Missing --path <file>");
    })()
  );
  const lines = readPlaylistFile(filePath);
  const result = validatePlaylistLines(lines);

  process.stdout.write(
    JSON.stringify(
      {
        path: filePath,
        totalLines: result.totalLines,
        invalidFormatCount: result.invalidFormatCount,
        overFreeLimit: result.overFreeLimit,
        sample: lines.slice(0, 5),
        invalidLines: result.invalidLines.slice(0, 10),
      },
      null,
      2
    ) + "\n"
  );
}

function runSplit(args) {
  const filePath = path.resolve(
    getConfigValue(args, "path") || args._[0] || (() => {
      throw new Error("Missing --path <file>");
    })()
  );
  const maxLines = Number(getConfigValue(args, "max-lines", 500));
  const outDir = path.resolve(
    getConfigValue(args, "out-dir") ||
      path.join(process.cwd(), "split", sanitizeFileName(path.basename(filePath, path.extname(filePath))))
  );
  const lines = readPlaylistFile(filePath);
  const chunks = splitPlaylistLines(lines, maxLines);

  ensureDirectory(outDir);

  const written = chunks.map((chunk, index) => {
    const chunkPath = path.join(
      outDir,
      `${sanitizeFileName(path.basename(filePath, path.extname(filePath)))}.part${String(index + 1).padStart(2, "0")}.txt`
    );
    writePlaylistFile(chunkPath, chunk);
    return chunkPath;
  });

  process.stdout.write(
    JSON.stringify(
      {
        path: filePath,
        totalLines: lines.length,
        maxLines,
        chunkCount: written.length,
        outDir,
        files: written,
      },
      null,
      2
    ) + "\n"
  );
}

function runSnippet() {
  process.stdout.write(`${getVkExportSnippet()}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  const args = parseArgs(rest);

  if (command === "export") {
    const usedAttachMode = await runExport(args);
    if (usedAttachMode) {
      process.exit(0);
    }
    return;
  }

  if (command === "validate") {
    runValidate(args);
    return;
  }

  if (command === "split") {
    runSplit(args);
    return;
  }

  if (command === "snippet") {
    runSnippet();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
