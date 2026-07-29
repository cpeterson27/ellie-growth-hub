const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Passwords must contain at least 12 characters.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const derived = await scrypt(String(password || ""), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

module.exports = { hashPassword, verifyPassword };
