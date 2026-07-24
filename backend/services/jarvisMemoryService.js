const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const JarvisMemoryNote = require("../models/JarvisMemoryNote");

const KNOWLEDGE_FOLDERS = [
  "00 Dashboard",
  "02 Campaigns",
  "03 Contacts & ICP",
  "04 Partners & Affiliates",
  "05 Offers & Programs",
  "06 Marketing Channels",
  "07 SOPs",
  "08 Decisions",
];

function enabled() {
  return process.env.JARVIS_OBSIDIAN_MEMORY_ENABLED === "true" && (memorySource() === "cloud" || Boolean(process.env.OBSIDIAN_VAULT_PATH?.trim()));
}

function memorySource() {
  return process.env.JARVIS_MEMORY_SOURCE === "cloud" ? "cloud" : "local";
}

function vaultPath() {
  return path.resolve(process.env.OBSIDIAN_VAULT_PATH.trim());
}

function escapeMarkdown(value) {
  return String(value || "").replaceAll("\r", "").trim();
}

async function getStatus() {
  if (memorySource() === "cloud") {
    const configured = process.env.JARVIS_OBSIDIAN_MEMORY_ENABLED === "true" && Boolean(process.env.JARVIS_MEMORY_SYNC_SECRET?.trim());
    const noteCount = configured ? await JarvisMemoryNote.countDocuments({ source: "obsidian_bridge" }) : 0;
    return { configured, enabled: configured, writable: configured, source: "cloud", noteCount };
  }

  const configured = Boolean(process.env.OBSIDIAN_VAULT_PATH?.trim());
  if (!configured) return { configured: false, enabled: false, writable: false, source: "local", noteCount: 0 };

  try {
    await fs.access(vaultPath());
    return { configured: true, enabled: enabled(), writable: true, source: "local" };
  } catch {
    return { configured: true, enabled: enabled(), writable: false, source: "local" };
  }
}

async function recordConversation({ userMessage, assistantMessage }) {
  if (memorySource() === "cloud") return { recorded: false, reason: "cloud_vault_source_of_truth" };
  if (!enabled()) return { recorded: false, reason: "memory_not_enabled" };

  const root = vaultPath();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const directory = path.join(root, "01 Inbox", "Jarvis Conversations");
  const filePath = path.join(directory, `${date}.md`);

  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Jarvis memory path is outside the configured Obsidian vault");
  }

  await fs.mkdir(directory, { recursive: true });
  const entry = `\n## ${now.toLocaleTimeString()}\n\n**You**\n${escapeMarkdown(userMessage)}\n\n**Jarvis**\n${escapeMarkdown(assistantMessage)}\n`;
  await fs.appendFile(filePath, entry, "utf8");
  return { recorded: true, file: path.relative(root, filePath) };
}

function scoreNote(fileName, content, terms) {
  const searchable = `${fileName} ${content}`.toLowerCase();
  return terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

async function findMarkdownFiles(directory, root, files = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.resolve(directory, entry.name);
    if (!entryPath.startsWith(`${root}${path.sep}`)) continue;
    if (entry.isDirectory()) await findMarkdownFiles(entryPath, root, files);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(entryPath);
    if (files.length >= 80) return files;
  }
  return files;
}

async function retrieveRelevantNotes(query) {
  if (!enabled()) return { available: false, sources: [], context: "" };

  if (memorySource() === "cloud") return retrieveCloudNotes(query);

  const root = vaultPath();
  const terms = String(query || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const files = [];
  for (const folder of KNOWLEDGE_FOLDERS) {
    const folderPath = path.join(root, folder);
    try { await findMarkdownFiles(folderPath, root, files); } catch { /* Optional vault folder. */ }
  }

  const notes = await Promise.all(files.map(async (filePath) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { file: path.relative(root, filePath), content: content.slice(0, 6000) };
    } catch { return null; }
  }));

  const ranked = notes.filter(Boolean)
    .map((note) => ({ ...note, score: scoreNote(note.file, note.content, terms) }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    available: true,
    sources: ranked.map((note) => note.file),
    context: ranked.map((note) => `Source: ${note.file}\n${note.content.slice(0, 1800)}`).join("\n\n").slice(0, 6500),
  };
}

function noteTitle(notePath) {
  return path.basename(notePath, path.extname(notePath)).replace(/[-_]/g, " ") || "Untitled note";
}

function isSafeNotePath(notePath) {
  return typeof notePath === "string" && notePath.endsWith(".md") && !notePath.startsWith("/") && !notePath.includes("..") && KNOWLEDGE_FOLDERS.some((folder) => notePath === folder || notePath.startsWith(`${folder}/`));
}

function safeSourceDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

async function syncCloudNotes(notes) {
  if (!Array.isArray(notes) || notes.length > 200) {
    const error = new Error("A sync must contain between 0 and 200 approved Markdown notes");
    error.statusCode = 400;
    throw error;
  }

  const normalized = [];
  for (const note of notes) {
    const notePath = String(note?.path || "").replaceAll("\\", "/").trim();
    const content = typeof note?.content === "string" ? note.content : "";
    if (!isSafeNotePath(notePath) || content.length > 120000) {
      const error = new Error("The sync contains an invalid approved note");
      error.statusCode = 400;
      throw error;
    }
    normalized.push({
      path: notePath,
      title: noteTitle(notePath),
      content,
      contentHash: crypto.createHash("sha256").update(content).digest("hex"),
      sourceUpdatedAt: safeSourceDate(note.updatedAt),
    });
  }

  const paths = normalized.map((note) => note.path);
  if (paths.length) {
    await JarvisMemoryNote.bulkWrite(normalized.map((note) => ({
      updateOne: {
        filter: { source: "obsidian_bridge", path: note.path },
        update: { $set: { ...note, source: "obsidian_bridge" } },
        upsert: true,
      },
    })));
  }
  const removed = await JarvisMemoryNote.deleteMany({ source: "obsidian_bridge", ...(paths.length ? { path: { $nin: paths } } : {}) });
  return { syncedCount: normalized.length, removedCount: removed.deletedCount || 0 };
}

async function retrieveCloudNotes(query) {
  const terms = String(query || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const notes = await JarvisMemoryNote.find({ source: "obsidian_bridge" }).select("path content").lean();
  const ranked = notes
    .map((note) => ({ ...note, score: scoreNote(note.path, note.content, terms) }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  return {
    available: true,
    sources: ranked.map((note) => note.path),
    context: ranked.map((note) => `Source: ${note.path}\n${note.content.slice(0, 1800)}`).join("\n\n").slice(0, 6500),
  };
}

module.exports = { getStatus, recordConversation, retrieveRelevantNotes, syncCloudNotes, memorySource };
