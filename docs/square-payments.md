# Square payments

Growth Operator uses a provider-neutral payment domain with Square as the first adapter. Each workspace authorizes its own Square seller account through OAuth. Growth Operator is not the merchant of record, does not collect platform fees, and never receives raw card data. Checkout occurs on a Square-hosted page and funds flow directly to the connected seller.

## Required environment variables

- `SQUARE_APPLICATION_ID`
- `SQUARE_APPLICATION_SECRET`
- `SQUARE_REDIRECT_URI` — production: `https://ellie-ai-backend.onrender.com/api/payments/square/oauth/callback`
- `SQUARE_WEBHOOK_URL` — production: `https://ellie-ai-backend.onrender.com/api/payments/square/webhook`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_ENVIRONMENT` — `sandbox` or `production`
- `SQUARE_API_VERSION` — currently tested with `2026-08-19`
- `PAYMENT_OAUTH_STATE_SECRET` — a separate high-entropy secret is recommended; the integration encryption key is a supported fallback
- `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` — existing base64-encoded 32-byte key
- `FRONTEND_URL`

Never expose application secrets, webhook signature keys, encryption keys, access tokens, or refresh tokens to the frontend.

## Square dashboard setup

1. Create/select the Square application for Growth Operator.
2. Add the exact OAuth redirect URI above.
3. Request only `MERCHANT_PROFILE_READ`, `PAYMENTS_READ`, `PAYMENTS_WRITE`, `ORDERS_READ`, and `ORDERS_WRITE`.
4. Add the exact webhook URL and subscribe to payment updates needed to confirm completed/failed/cancelled payments and refund updates.
5. Copy the webhook signature key into Render without exposing it in source control.
6. Start with `SQUARE_ENVIRONMENT=sandbox`; perform one controlled live-provider test only after explicit approval.

## Safety and lifecycle

- OAuth state expires after ten minutes, is signed, is bound to the initiating user/workspace, and can be consumed only once.
- Callback authorization rechecks active membership and `payments.manage`.
- Tokens are stored only in the encrypted credential envelope.
- A Square merchant can be actively attached to only one workspace, preventing ambiguous webhook routing.
- Hosted checkout creation is idempotent and workspace associations are validated server-side.
- A transaction becomes paid only after a signature-verified, idempotently processed Square webhook.
- Automatic enrollment is disabled by default. If enabled, it creates only a pending enrollment after verified payment and never assigns a coach.
- Refunds require `payments.manage`, a reason, a valid remaining balance, and an idempotency key.
- Disconnect revokes Square authorization and preserves payment/audit history.

## Initial release limitations

Recurring/subscription billing is capability-gated and intentionally unavailable until a complete Square subscription lifecycle is implemented and reviewed. There is no automatic dunning, automatic coach assignment, automatic outreach, or automatic refunding.

## Local verification

From `backend`: `npm run test:square-payments`

From `frontend`: `node test-payments-ui.js`, followed by the focused lint and production build.
