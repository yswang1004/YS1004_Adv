import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // SitePasswordOnly mode: if OAuth env isn't configured, skip auth entirely.
  // This avoids noisy logs and removes the need for OAuth/DB.
  const authEnabled = Boolean(
    ENV.oAuthServerUrl && ENV.cookieSecret && ENV.appId
  );

  if (authEnabled) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  } else {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
