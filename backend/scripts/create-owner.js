require("dotenv").config();
const { connectDatabase } = require("../config/database");
const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { hashPassword } = require("../utils/passwords");

function readHidden(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) throw new Error("An interactive terminal is required to enter the password securely.");
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") process.exit(130);
      if (character === "\r" || character === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (character === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = String(emailArg || "").trim().toLowerCase();
  const name = nameParts.join(" ").trim() || "Lead Porch Owner";
  if (!email) {
    throw new Error("Usage: npm run create-owner -- owner@example.com 'Owner Name'");
  }
  let password = "";
  while (password.length < 12) {
    password = await readHidden("Choose a password (12+ characters): ");
    if (password.length < 12) {
      console.error("Password is too short. Please use at least 12 characters.");
    }
  }
  await connectDatabase(process.env.MONGO_URI);
  const existing = await User.findOne({ email });
  if (existing) throw new Error("That email already has an account.");

  const workspace = await Workspace.findOneAndUpdate(
    { slug: "ellie" },
    { $setOnInsert: { name: "Lead Porch", slug: "ellie", status: "active", billingStatus: "setup" } },
    { upsert: true, returnDocument: "after" },
  );
  const user = await User.create({ email, name, passwordHash: await hashPassword(password) });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: user._id, role: "owner" });
  console.log(`Created owner ${email} for workspace ${workspace.name}.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
