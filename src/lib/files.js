const fs = require("node:fs");
const path = require("node:path");

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readPlaylistFile(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function validatePlaylistLines(lines) {
  const invalidLines = [];

  lines.forEach((line, index) => {
    if (!/\s-\s/.test(line)) {
      invalidLines.push({
        lineNumber: index + 1,
        value: line,
      });
    }
  });

  return {
    totalLines: lines.length,
    invalidFormatCount: invalidLines.length,
    invalidLines,
    overFreeLimit: lines.length > 500,
  };
}

function writePlaylistFile(filePath, lines) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

function splitPlaylistLines(lines, maxLines) {
  if (!Number.isInteger(maxLines) || maxLines <= 0) {
    throw new Error("maxLines must be a positive integer");
  }

  const chunks = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    chunks.push(lines.slice(index, index + maxLines));
  }

  return chunks;
}

function sanitizeFileName(value) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    .slice(0, 180);
}

module.exports = {
  ensureDirectory,
  readPlaylistFile,
  sanitizeFileName,
  splitPlaylistLines,
  validatePlaylistLines,
  writePlaylistFile,
};
