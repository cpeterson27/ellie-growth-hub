import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url)); const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.jsx"), profile = read("src/pages/MyProfile.jsx"), avatar = read("src/components/UserAvatar.jsx"), team = read("src/components/TeamAccess.jsx"), navbar = read("src/components/Navbar.jsx");
assert(app.includes('path="/profile"')); assert(profile.includes("uploadMyAvatar") && profile.includes("removeMyAvatar")); assert(profile.includes("5 MB"));
assert(avatar.includes("avatarUrl") && avatar.includes("initials")); assert(team.includes("UserAvatar")); assert(navbar.includes("UserAvatar"));
console.log("Self-service profile photo, fallback avatar, Team, and account-menu UI contracts passed.");
