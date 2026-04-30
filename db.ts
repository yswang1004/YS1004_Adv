import { ONE_YEAR_MS, SITE_AUTH_COOKIE_NAME } from "@shared/const";
import type { Express, Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies";
import { sha256Hex, safeEqual } from "./crypto";
import { ENV } from "./env";

function parseCookies(cookieHeader: string | undefined) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;

  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim();
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join("=").trim());
  }
  return out;
}

function getConfiguredPasswordHash() {
  if (ENV.sitePasswordSha256) return ENV.sitePasswordSha256;
  if (ENV.sitePassword) return sha256Hex(ENV.sitePassword);
  return "";
}

function isSitePasswordEnabled() {
  return Boolean(getConfiguredPasswordHash());
}

export function sitePasswordMiddleware(app: Express) {
  app.use((req, res, next) => {
    if (!isSitePasswordEnabled()) return next();

    // Allow the gate endpoints
    if (req.path.startsWith("/api/site-auth/")) return next();

    // Gate only APIs (UI can load, but API cannot be used without password)
    if (!req.path.startsWith("/api/")) return next();

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SITE_AUTH_COOKIE_NAME];
    if (token && safeEqual(token, getConfiguredPasswordHash())) return next();

    res.status(401).json({ error: "SITE_PASSWORD_REQUIRED" });
  });
}

export function registerSitePasswordRoutes(app: Express) {
  app.get("/api/site-auth/status", (req: Request, res: Response) => {
    if (!isSitePasswordEnabled()) {
      res.json({ enabled: false, authed: true });
      return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SITE_AUTH_COOKIE_NAME];
    const authed = Boolean(
      token && safeEqual(token, getConfiguredPasswordHash())
    );
    res.json({ enabled: true, authed });
  });

  app.post("/api/site-auth/login", (req: Request, res: Response) => {
    if (!isSitePasswordEnabled()) {
      res.json({ success: true, enabled: false });
      return;
    }

    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const hash = sha256Hex(password);
    const ok = safeEqual(hash, getConfiguredPasswordHash());

    if (!ok) {
      res.status(401).json({ error: "INVALID_PASSWORD" });
      return;
    }

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(SITE_AUTH_COOKIE_NAME, getConfiguredPasswordHash(), {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });

    res.json({ success: true, enabled: true });
  });

  app.post("/api/site-auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(SITE_AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}
