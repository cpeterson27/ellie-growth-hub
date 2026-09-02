class PaymentProvider {
  authorizationUrl() { throw new Error("authorizationUrl is not implemented"); }
  exchangeAuthorizationCode() { throw new Error("exchangeAuthorizationCode is not implemented"); }
  refreshAuthorization() { throw new Error("refreshAuthorization is not implemented"); }
  revokeAuthorization() { throw new Error("revokeAuthorization is not implemented"); }
  verifyAuthorization() { throw new Error("verifyAuthorization is not implemented"); }
  createHostedCheckout() { throw new Error("createHostedCheckout is not implemented"); }
  retrievePaymentStatus() { throw new Error("retrievePaymentStatus is not implemented"); }
  refundPayment() { throw new Error("refundPayment is not implemented"); }
  createSubscription() { throw Object.assign(new Error("Recurring payments are not supported by this provider adapter"), { code: "PAYMENT_RECURRING_UNSUPPORTED" }); }
  pauseSubscription() { throw Object.assign(new Error("Recurring payments are not supported by this provider adapter"), { code: "PAYMENT_RECURRING_UNSUPPORTED" }); }
  cancelSubscription() { throw Object.assign(new Error("Recurring payments are not supported by this provider adapter"), { code: "PAYMENT_RECURRING_UNSUPPORTED" }); }
  verifyWebhookSignature() { throw new Error("verifyWebhookSignature is not implemented"); }
}
module.exports = PaymentProvider;
