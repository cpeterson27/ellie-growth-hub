const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "INTEGRATION_CREDENTIAL_ENCRYPTION_KEY";

function getEncryptionKey() {
  const encodedKey = process.env[KEY_ENV];

  if (!encodedKey) {
    throw new Error(`${KEY_ENV} is not configured`);
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must be a base64-encoded 32-byte key`);
  }

  return key;
}

function encryptCredentials(credentials) {
  if (!credentials || typeof credentials !== "object") {
    throw new Error("Credentials must be an object");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(credentials);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    algorithm: ALGORITHM,
    version: 1,
  };
}

function decryptCredentials(envelope) {
  if (!envelope || envelope.algorithm !== ALGORITHM || envelope.version !== 1) {
    throw new Error("Unsupported credential encryption envelope");
  }

  if (
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.authTag !== "string"
  ) {
    throw new Error("Malformed credential encryption envelope");
  }

  const key = getEncryptionKey();
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plaintext);
  } catch {
    throw new Error("Unable to decrypt credential envelope");
  }
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
};
