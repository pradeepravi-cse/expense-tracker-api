export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  OIDC_ISSUER:
    process.env.OIDC_ISSUER ||
    'https://auth.rpradeepkumar.com/realms/expensetracker',
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || 'expense-tracker',
  OIDC_JWKS_URI: process.env.OIDC_JWKS_URI || undefined,
  OIDC_CLIENT: process.env.OIDC_CLIENT || undefined,
};
