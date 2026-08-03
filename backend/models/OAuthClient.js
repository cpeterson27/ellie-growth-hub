const mongoose = require("mongoose");

const oauthClientSchema = new mongoose.Schema({
  clientId: { type: String, required: true, unique: true, index: true },
  clientName: { type: String, default: "AI assistant", maxlength: 160 },
  redirectUris: { type: [String], required: true },
  grantTypes: { type: [String], default: ["authorization_code", "refresh_token"] },
  responseTypes: { type: [String], default: ["code"] },
  tokenEndpointAuthMethod: { type: String, enum: ["none"], default: "none" },
}, { timestamps: true });

module.exports = mongoose.model("OAuthClient", oauthClientSchema);
