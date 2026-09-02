const SquarePaymentProvider = require("./SquarePaymentProvider");
const providers = new Map([["square", new SquarePaymentProvider()]]);
function getPaymentProvider(name) { const provider = providers.get(name); if (!provider) { const error = new Error("Payment provider is not supported"); error.code = "PAYMENT_PROVIDER_UNSUPPORTED"; throw error; } return provider; }
function setPaymentProvider(name, provider) { providers.set(name, provider); }
module.exports = { getPaymentProvider, setPaymentProvider };
