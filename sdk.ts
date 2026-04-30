export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Optional: site-wide password gate.
  // Provide one of these in Render env:
  // - SITE_PASSWORD (plain)
  // - SITE_PASSWORD_SHA256 (hex)
  sitePassword: process.env.SITE_PASSWORD ?? "",
  sitePasswordSha256: process.env.SITE_PASSWORD_SHA256 ?? "",
};
