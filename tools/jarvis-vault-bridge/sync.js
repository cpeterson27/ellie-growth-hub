#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");

const FOLDERS = ["00 Dashboard", "02 Campaigns", "03 Contacts & ICP", "04 Partners & Affiliates", "05 Offers & Programs", "06 Marketing Channels", "07 SOPs", "08 Decisions"];

async function loadLocalEnv() {
  try {
    const content = await fs.readFile(path.join(__dirname, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function collect(directory, root, notes = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.resolve(directory, entry.name);
    if (!fullPath.startsWith(`${root}${path.sep}`)) continue;
    if (entry.isDirectory()) await collect(fullPath, root, notes);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const [content, stat] = await Promise.all([fs.readFile(fullPath, "utf8"), fs.stat(fullPath)]);
      notes.push({ path: path.relative(root, fullPath).split(path.sep).join("/"), content, updatedAt: stat.mtime.toISOString() });
    }
  }
  return notes;
}

async function sync() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  const apiUrl = (process.env.JARVIS_API_URL || "").replace(/\/$/, "");
  const secret = process.env.JARVIS_MEMORY_SYNC_SECRET;
  if (!vaultPath || !apiUrl || !secret) throw new Error("Set OBSIDIAN_VAULT_PATH, JARVIS_API_URL, and JARVIS_MEMORY_SYNC_SECRET before syncing.");
  const root = path.resolve(vaultPath);
  const notes = [];
  for (const folder of FOLDERS) {
    try { await collect(path.join(root, folder), root, notes); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const response = await fetch(`${apiUrl}/jarvis/memory/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ notes }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.error || `Sync failed (${response.status})`);
  console.log(`Jarvis vault synced: ${body.data.syncedCount} notes; ${body.data.removedCount} removed from cloud mirror.`);
}

async function run() {
  try { await loadLocalEnv(); await sync(); } catch (error) { console.error(`Jarvis vault sync failed: ${error.message}`); process.exitCode = 1; }
}

run();
if (process.argv.includes("--watch")) setInterval(run, 60_000);
