const axios = require("axios");
const crypto = require("crypto");
const PaymentProvider = require("./PaymentProvider");

const DEFAULT_SCOPES = Object.freeze(["MERCHANT_PROFILE_READ", "PAYMENTS_READ", "PAYMENTS_WRITE", "ORDERS_READ", "ORDERS_WRITE"]);
const safeEqual = (a, b) => { const left = Buffer.from(String(a || "")); const right = Buffer.from(String(b || "")); return left.length === right.length && crypto.timingSafeEqual(left, right); };

class SquarePaymentProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.http = options.http || axios;
    this.appId = options.appId ?? process.env.SQUARE_APPLICATION_ID;
    this.appSecret = options.appSecret ?? process.env.SQUARE_APPLICATION_SECRET;
    this.redirectUri = options.redirectUri ?? process.env.SQUARE_REDIRECT_URI;
    this.webhookUrl = options.webhookUrl ?? process.env.SQUARE_WEBHOOK_URL;
    this.signatureKey = options.signatureKey ?? process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    this.version = options.version ?? process.env.SQUARE_API_VERSION ?? "2026-08-19";
    this.environment = options.environment ?? process.env.SQUARE_ENVIRONMENT ?? "sandbox";
    this.apiBase = this.environment === "production" ? "https://connect.squareup.com/v2" : "https://connect.squareupsandbox.com/v2";
    this.oauthBase = this.environment === "production" ? "https://connect.squareup.com/oauth2" : "https://connect.squareupsandbox.com/oauth2";
  }
  assertConfigured() { if (!this.appId || !this.appSecret || !this.redirectUri) { const error = new Error("Square OAuth is not configured"); error.code = "SQUARE_NOT_CONFIGURED"; throw error; } }
  authorizationUrl(state) { this.assertConfigured(); const query = new URLSearchParams({ client_id: this.appId, scope: DEFAULT_SCOPES.join(" "), session: "false", state, redirect_uri: this.redirectUri }); return `${this.oauthBase}/authorize?${query}`; }
  async exchangeAuthorizationCode(code) { this.assertConfigured(); const { data } = await this.http.post(`${this.oauthBase}/token`, { client_id: this.appId, client_secret: this.appSecret, code, grant_type: "authorization_code", redirect_uri: this.redirectUri }, { headers: { "Square-Version": this.version, "Content-Type": "application/json" } }); return data; }
  async refreshAuthorization(refreshToken) { this.assertConfigured(); const { data } = await this.http.post(`${this.oauthBase}/token`, { client_id: this.appId, client_secret: this.appSecret, refresh_token: refreshToken, grant_type: "refresh_token" }, { headers: { "Square-Version": this.version, "Content-Type": "application/json" } }); return data; }
  async revokeAuthorization(accessToken) { this.assertConfigured(); await this.http.post(`${this.oauthBase}/revoke`, { client_id: this.appId, access_token: accessToken }, { headers: { Authorization: `Client ${this.appSecret}`, "Square-Version": this.version, "Content-Type": "application/json" } }); }
  headers(token, idempotencyKey) { return { Authorization: `Bearer ${token}`, "Square-Version": this.version, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }; }
  async verifyAuthorization(accessToken) { const [merchant, locations] = await Promise.all([this.http.get(`${this.apiBase}/merchants/me`, { headers: this.headers(accessToken) }), this.http.get(`${this.apiBase}/locations`, { headers: this.headers(accessToken) })]); const location = (locations.data?.locations || []).find((item) => item.status === "ACTIVE") || locations.data?.locations?.[0]; return { merchantId: merchant.data?.merchant?.id, merchantName: merchant.data?.merchant?.business_name || merchant.data?.merchant?.country || "Square seller", locationId: location?.id || "", locationName: location?.name || "", capabilities: location?.capabilities || [] }; }
  async createHostedCheckout(accessToken, input) { const body = { idempotency_key: input.idempotencyKey, order: { location_id: input.locationId, reference_id: input.referenceId, line_items: [{ name: input.description, quantity: "1", base_price_money: { amount: input.amountMinor, currency: input.currency } }] }, checkout_options: { redirect_url: input.redirectUrl } }; const { data } = await this.http.post(`${this.apiBase}/online-checkout/payment-links`, body, { headers: this.headers(accessToken) }); return { checkoutId: data.payment_link?.id, orderId: data.payment_link?.order_id, url: data.payment_link?.url }; }
  async retrievePaymentStatus(accessToken, paymentId) { const { data } = await this.http.get(`${this.apiBase}/payments/${encodeURIComponent(paymentId)}`, { headers: this.headers(accessToken) }); return data.payment; }
  async refundPayment(accessToken, input) { const { data } = await this.http.post(`${this.apiBase}/refunds`, { idempotency_key: input.idempotencyKey, payment_id: input.paymentId, amount_money: { amount: input.amountMinor, currency: input.currency }, reason: input.reason }, { headers: this.headers(accessToken) }); return data.refund; }
  verifyWebhookSignature(rawBody, signature) { if (!this.signatureKey || !this.webhookUrl || !rawBody || !signature) return false; const digest = crypto.createHmac("sha256", this.signatureKey).update(`${this.webhookUrl}${rawBody}`).digest("base64"); return safeEqual(digest, signature); }
}
SquarePaymentProvider.DEFAULT_SCOPES = DEFAULT_SCOPES;
module.exports = SquarePaymentProvider;
