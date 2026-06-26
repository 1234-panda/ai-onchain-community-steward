const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

function loadEnvFile(file) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

module.exports = { loadEnv };
