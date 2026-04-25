const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");
const { chromium, firefox } = require("playwright");

const BROWSER_DEFINITIONS = {
  chrome: {
    engine: "chromium",
    executableCandidates: {
      win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ],
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ],
      linux: [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/snap/bin/chromium",
      ],
    },
  },
  edge: {
    engine: "chromium",
    executableCandidates: {
      win32: [
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ],
      darwin: [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ],
      linux: [
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable",
      ],
    },
  },
  firefox: {
    engine: "firefox",
    executableCandidates: {
      win32: [
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
        "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
      ],
      darwin: ["/Applications/Firefox.app/Contents/MacOS/firefox"],
      linux: ["/usr/bin/firefox"],
    },
  },
};

function normalizeBrowserName(value) {
  const normalized = (value || "chrome").toLowerCase().trim();
  const aliases = {
    chrome: "chrome",
    googlechrome: "chrome",
    edge: "edge",
    msedge: "edge",
    microsoftedge: "edge",
    firefox: "firefox",
    ff: "firefox",
  };

  const browserName = aliases[normalized];
  if (!browserName) {
    throw new Error(
      `Unsupported browser "${value}". Supported browsers: chrome, edge, firefox.`
    );
  }

  return browserName;
}

function getBrowserDefinition(browserName) {
  const definition = BROWSER_DEFINITIONS[browserName];
  if (!definition) {
    throw new Error(`Unsupported browser "${browserName}".`);
  }

  return definition;
}

function resolveExecutablePath(browserName, explicitPath) {
  if (explicitPath) {
    const resolvedExplicitPath = path.resolve(explicitPath);
    if (!fs.existsSync(resolvedExplicitPath)) {
      throw new Error(
        `Browser executable not found at "${resolvedExplicitPath}".`
      );
    }

    return resolvedExplicitPath;
  }

  const definition = getBrowserDefinition(browserName);
  const platform = os.platform();
  const candidates = definition.executableCandidates[platform] || [];
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (!match) {
    throw new Error(
      `Could not find a local ${browserName} installation. Use --executable-path to point to the browser binary.`
    );
  }

  return match;
}

async function launchManagedContext({
  browserName,
  profileDir,
  headless,
  executablePath,
}) {
  const normalizedBrowserName = normalizeBrowserName(browserName);
  const definition = getBrowserDefinition(normalizedBrowserName);
  const launcher = definition.engine === "firefox" ? firefox : chromium;
  const launchOptions = {
    headless,
    args: definition.engine === "chromium" ? ["--no-first-run"] : [],
  };

  if (executablePath) {
    launchOptions.executablePath = resolveExecutablePath(
      normalizedBrowserName,
      executablePath
    );
  } else if (definition.engine === "chromium") {
    launchOptions.channel =
      normalizedBrowserName === "edge" ? "msedge" : "chrome";
  } else {
    launchOptions.executablePath = resolveExecutablePath(normalizedBrowserName);
  }

  return launcher.launchPersistentContext(profileDir, launchOptions);
}

async function connectToAttachedBrowser(attachUrl) {
  const resolvedAttachUrl = await resolveAttachUrl(attachUrl);
  return chromium.connectOverCDP(resolvedAttachUrl);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const request = client.get(parsedUrl, (response) => {
      let body = "";
      response.setEncoding("utf8");

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(
            new Error(
              `Could not query DevTools endpoint ${url}. Status: ${response.statusCode}`
            )
          );
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(
            new Error(`Could not parse DevTools response from ${url}.`)
          );
        }
      });
    });

    request.on("error", reject);
  });
}

async function resolveAttachUrl(attachUrl) {
  if (attachUrl.startsWith("ws://") || attachUrl.startsWith("wss://")) {
    return attachUrl;
  }

  const baseUrl = attachUrl.replace(/\/$/, "");
  const versionInfo = await fetchJson(`${baseUrl}/json/version`);
  if (!versionInfo.webSocketDebuggerUrl) {
    throw new Error(
      `DevTools endpoint ${attachUrl} did not return webSocketDebuggerUrl.`
    );
  }

  return versionInfo.webSocketDebuggerUrl;
}

module.exports = {
  connectToAttachedBrowser,
  launchManagedContext,
  normalizeBrowserName,
  resolveExecutablePath,
};
