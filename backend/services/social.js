function getSocialApiKeys() {
  return {
    metaAppId: process.env.META_APP_ID,
    metaAppSecret: process.env.META_APP_SECRET,
    xApiKey: process.env.X_API_KEY,
    xApiSecret: process.env.X_API_SECRET,
  };
}

async function publishSocial(content) {
  const keys = getSocialApiKeys();
  if (!keys.metaAppId || !keys.metaAppSecret) {
    return { success: false, message: "Social integration is not configured." };
  }
  return {
    success: false,
    message: "Social publishing integration is not yet implemented.",
  };
}

module.exports = { publishSocial };
