import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("./src/pages/CoachingAdmin.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./src/pages/Coaching.css", import.meta.url), "utf8");

for (const value of [
  "coaching-program-grid",
  "coaching-program-card__header",
  "coaching-program-card__identity",
  "coaching-program-card__details",
  "coaching-program-card__actions",
  "coaching-program-card__danger",
  "Duration",
  "Price",
  "Stages",
  "Version",
  "Skool",
  "Edit program",
  "Map Skool",
  "Manage Skool",
  "Archive",
]) assert(page.includes(value), `Programs UI is missing ${value}`);

for (const value of [
  "repeat(auto-fit,minmax(min(100%,380px),1fr))",
  "min-width:0",
  "overflow-wrap:anywhere",
  "@media(max-width:1100px)",
  "@media(max-width:720px)",
  "@media(max-width:420px)",
]) assert(styles.includes(value), `Programs responsive CSS is missing ${value}`);

assert(page.includes('variant="outline" onClick={() => onMapSkool(program)}'));
assert(page.includes('variant="danger" onClick={() => onArchive(program)}'));
assert(page.includes('<Button size="sm" onClick={() => onEdit(program)}>Edit program</Button>'));
console.log("Coaching Programs hierarchy, actions, metadata and responsive layout contracts passed.");
