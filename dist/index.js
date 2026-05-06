var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/rxnorm.ts
var rxnorm_exports = {};
__export(rxnorm_exports, {
  fetchRxNormDrugProducts: () => fetchRxNormDrugProducts
});
async function fetchRxNormDrugProducts(params) {
  const name = params.name.trim();
  if (!name) return [];
  const max = Math.min(Math.max(params.max ?? 20, 1), 50);
  const url = new URL("https://rxnav.nlm.nih.gov/REST/drugs.json");
  url.searchParams.set("name", name);
  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15e3)
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const groups = data.drugGroup?.conceptGroup ?? [];
  const out = [];
  for (const g of groups) {
    const tty = g.tty;
    const props = g.conceptProperties ?? [];
    for (const p of props) {
      if (!p?.rxcui || !p?.name) continue;
      out.push({
        name: p.name,
        rxcui: p.rxcui,
        tty: p.tty ?? tty,
        url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${encodeURIComponent(p.rxcui)}`
      });
    }
  }
  const priority = /* @__PURE__ */ new Map([
    ["SBD", 1],
    ["SCD", 2],
    ["BPCK", 3],
    ["GPCK", 4],
    ["BN", 5],
    ["IN", 6]
  ]);
  out.sort(
    (a, b) => (priority.get(a.tty ?? "") ?? 99) - (priority.get(b.tty ?? "") ?? 99)
  );
  const seen = /* @__PURE__ */ new Set();
  const dedup = [];
  for (const x of out) {
    const key = x.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(x);
    if (dedup.length >= max) break;
  }
  return dedup;
}
var init_rxnorm = __esm({
  "server/_core/rxnorm.ts"() {
    "use strict";
  }
});

// server/_core/clinicaltrials.ts
var clinicaltrials_exports = {};
__export(clinicaltrials_exports, {
  fetchClinicalTrials: () => fetchClinicalTrials
});
async function fetchClinicalTrials(params) {
  const term = params.term.trim();
  if (!term) return [];
  const max = Math.min(Math.max(params.max ?? 10, 1), 20);
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("query.term", term);
  url.searchParams.set("pageSize", String(max));
  url.searchParams.set(
    "fields",
    [
      "protocolSection.identificationModule.nctId",
      "protocolSection.identificationModule.briefTitle",
      "protocolSection.statusModule.overallStatus",
      "protocolSection.statusModule.startDateStruct",
      "protocolSection.statusModule.completionDateStruct"
    ].join(",")
  );
  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15e3)
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const studies = data.studies ?? [];
  const out = [];
  for (const s of studies) {
    const ps = s?.protocolSection;
    const id = ps?.identificationModule?.nctId;
    const title = ps?.identificationModule?.briefTitle;
    if (!id || !title) continue;
    const status = ps?.statusModule?.overallStatus;
    const startDate = ps?.statusModule?.startDateStruct?.date;
    const completionDate = ps?.statusModule?.completionDateStruct?.date;
    out.push({
      nctId: id,
      title,
      status,
      startDate,
      completionDate,
      url: `https://clinicaltrials.gov/study/${id}`
    });
  }
  return out;
}
var init_clinicaltrials = __esm({
  "server/_core/clinicaltrials.ts"() {
    "use strict";
  }
});

// server/_core/pubchem3d.ts
var pubchem3d_exports = {};
__export(pubchem3d_exports, {
  fetchPubChem3dSdfByCid: () => fetchPubChem3dSdfByCid
});
async function fetchPubChem3dSdfByCid(cid) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15e3) });
  if (!resp.ok) return null;
  const text2 = await resp.text();
  if (!text2 || text2.toLowerCase().includes("error")) return text2 || null;
  return text2;
}
var init_pubchem3d = __esm({
  "server/_core/pubchem3d.ts"() {
    "use strict";
  }
});

// server/_core/pubchemView.ts
var pubchemView_exports = {};
__export(pubchemView_exports, {
  fetchPubChemDescriptionByCid: () => fetchPubChemDescriptionByCid
});
function pickFirstTextFromSection(section) {
  if (!section) return null;
  const infos = section.Information ?? [];
  for (const info of infos) {
    const v = info.Value;
    const fromMarkup = v?.StringWithMarkup?.map((x) => x.String).filter(Boolean).join(" ");
    if (fromMarkup) return fromMarkup.trim();
    if (v?.String) return String(v.String).trim();
  }
  for (const child of section.Section ?? []) {
    const t2 = pickFirstTextFromSection(child);
    if (t2) return t2;
  }
  return null;
}
function findSectionByHeading(sections, heading) {
  if (!sections) return void 0;
  for (const s of sections) {
    if ((s.TOCHeading ?? "").toLowerCase() === heading.toLowerCase()) return s;
    const found = findSectionByHeading(s.Section, heading);
    if (found) return found;
  }
  return void 0;
}
async function fetchPubChemDescriptionByCid(cid) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15e3) });
  if (!resp.ok) return null;
  const data = await resp.json();
  const sections = data.Record?.Section;
  if (!sections) return null;
  const candidates = [
    "Record Description",
    "Description",
    "Drug and Medication Information",
    "Biological Test Results"
  ];
  for (const h of candidates) {
    const sec = findSectionByHeading(sections, h);
    const text2 = pickFirstTextFromSection(sec);
    if (text2) return text2;
  }
  for (const s of sections) {
    const text2 = pickFirstTextFromSection(s);
    if (text2) return text2;
  }
  return null;
}
var init_pubchemView = __esm({
  "server/_core/pubchemView.ts"() {
    "use strict";
  }
});

// server/_core/pubmed.ts
var pubmed_exports = {};
__export(pubmed_exports, {
  fetchPubMedRecentArticles: () => fetchPubMedRecentArticles
});
function yearRangeLastNYears(n) {
  const now = /* @__PURE__ */ new Date();
  const currentYear = now.getFullYear();
  const minYear = currentYear - (n - 1);
  return { minYear, maxYear: currentYear };
}
async function fetchPubMedRecentArticles(params) {
  const years = params.years ?? 5;
  const retmax = Math.min(Math.max(params.retmax ?? 20, 1), 50);
  const { minYear, maxYear } = yearRangeLastNYears(years);
  const term = params.term.trim();
  if (!term) return [];
  const esearch = new URL(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
  );
  esearch.searchParams.set("db", "pubmed");
  esearch.searchParams.set("retmode", "json");
  esearch.searchParams.set("sort", "date");
  esearch.searchParams.set("retmax", String(retmax));
  esearch.searchParams.set("term", term);
  esearch.searchParams.set("datetype", "pdat");
  esearch.searchParams.set("mindate", String(minYear));
  esearch.searchParams.set("maxdate", String(maxYear));
  const es = await fetch(esearch.toString(), {
    signal: AbortSignal.timeout(15e3)
  });
  if (!es.ok) return [];
  const esData = await es.json();
  const ids = esData?.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const esummary = new URL(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
  );
  esummary.searchParams.set("db", "pubmed");
  esummary.searchParams.set("retmode", "json");
  esummary.searchParams.set("id", ids.join(","));
  const sum = await fetch(esummary.toString(), {
    signal: AbortSignal.timeout(15e3)
  });
  if (!sum.ok) return [];
  const sumData = await sum.json();
  const result = sumData.result ?? {};
  const articles = [];
  for (const pmid of ids) {
    const item = result[pmid];
    if (!item) continue;
    const title = item.title?.trim() ?? "";
    const journal = item.fulljournalname ?? item.source;
    const pubDate = item.pubdate ?? item.epubdate;
    const authorNames = Array.isArray(item.authors) ? item.authors.map((a) => a?.name).filter(Boolean).slice(0, 6).join(", ") : void 0;
    articles.push({
      pmid,
      title,
      journal,
      pubDate,
      authors: authorNames,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    });
  }
  return articles;
}
var init_pubmed = __esm({
  "server/_core/pubmed.ts"() {
    "use strict";
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var SITE_AUTH_COOKIE_NAME = "site_auth";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var screeningSessions = mysqlTable("screening_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  compoundCount: int("compoundCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var screeningResults = mysqlTable("screening_results", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  compoundName: varchar("compoundName", { length: 200 }).notNull(),
  cid: int("cid"),
  smiles: text("smiles"),
  mw: text("mw"),
  logP: text("logP"),
  tpsa: text("tpsa"),
  hbd: int("hbd"),
  hba: int("hba"),
  boiledEgg: varchar("boiledEgg", { length: 10 }),
  admetlabRulesPassed: int("admetlabRulesPassed"),
  logPS: text("logPS"),
  kpuuBrain: text("kpuuBrain"),
  bbbPotential: varchar("bbbPotential", { length: 20 }),
  cypScore: int("cypScore"),
  cypPotential: varchar("cypPotential", { length: 20 }),
  cypFeatures: text("cypFeatures"),
  resultJson: json("resultJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
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
  sitePasswordSha256: process.env.SITE_PASSWORD_SHA256 ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function saveScreeningSession(userId, results) {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot save screening session: database not available"
    );
    return null;
  }
  try {
    const [session] = await db.insert(screeningSessions).values({
      userId,
      compoundCount: results.length
    }).$returningId();
    const sessionId = session.id;
    for (const r of results) {
      await db.insert(screeningResults).values({
        sessionId,
        compoundName: r.compound.name,
        cid: r.compound.cid ?? null,
        smiles: r.compound.smiles ?? null,
        mw: r.compound.mw?.toString() ?? null,
        logP: r.compound.logP?.toString() ?? null,
        tpsa: r.compound.tpsa?.toString() ?? null,
        hbd: r.compound.hbd ?? null,
        hba: r.compound.hba ?? null,
        boiledEgg: r.bbb.boiledEgg ? "Yes" : "No",
        admetlabRulesPassed: r.bbb.admetlabRulesPassed,
        logPS: r.bbb.logPS?.toString() ?? null,
        kpuuBrain: r.bbb.kpuuBrain?.toString() ?? null,
        bbbPotential: r.bbb.bbbPotential,
        cypScore: r.cyp2e1.score,
        cypPotential: r.cyp2e1.potential,
        cypFeatures: r.cyp2e1.features.join("; "),
        resultJson: r
      });
    }
    return sessionId;
  } catch (error) {
    console.error("[Database] Failed to save screening session:", error);
    return null;
  }
}
async function getScreeningHistory(userId, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  try {
    if (!userId) return [];
    return db.select().from(screeningSessions).where(eq(screeningSessions.userId, userId)).orderBy(desc(screeningSessions.createdAt)).limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get screening history:", error);
    return [];
  }
}
async function getSessionResults(sessionId) {
  const db = await getDb();
  if (!db) return [];
  try {
    return db.select().from(screeningResults).where(eq(screeningResults.sessionId, sessionId));
  } catch (error) {
    console.error("[Database] Failed to get session results:", error);
    return [];
  }
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    } else {
      console.warn("[OAuth] Disabled (OAUTH_SERVER_URL not set)");
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/crypto.ts
import crypto from "crypto";
function sha256Hex(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
function safeEqual(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

// server/_core/sitePassword.ts
function parseCookies(cookieHeader) {
  const out = {};
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
function sitePasswordMiddleware(app) {
  app.use((req, res, next) => {
    if (!isSitePasswordEnabled()) return next();
    if (req.path.startsWith("/api/site-auth/")) return next();
    if (!req.path.startsWith("/api/")) return next();
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SITE_AUTH_COOKIE_NAME];
    if (token && safeEqual(token, getConfiguredPasswordHash())) return next();
    res.status(401).json({ error: "SITE_PASSWORD_REQUIRED" });
  });
}
function registerSitePasswordRoutes(app) {
  app.get("/api/site-auth/status", (req, res) => {
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
  app.post("/api/site-auth/login", (req, res) => {
    if (!isSitePasswordEnabled()) {
      res.json({ success: true, enabled: false });
      return;
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const hash = sha256Hex(password);
    const ok = safeEqual(hash, getConfiguredPasswordHash());
    if (!ok) {
      res.status(401).json({ error: "INVALID_PASSWORD" });
      return;
    }
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(SITE_AUTH_COOKIE_NAME, getConfiguredPasswordHash(), {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS
    });
    res.json({ success: true, enabled: true });
  });
  app.post("/api/site-auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(SITE_AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/:path(*)", async (req, res) => {
    const key = req.params.path;
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(
          `[StorageProxy] forge error: ${forgeResp.status} ${body}`
        );
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";

// server/screening.ts
var MEASURED_ISOFORM_ALIASES = {
  CYP1A2: "CYP1A2",
  "1A2": "CYP1A2",
  CYP2D6: "CYP2D6",
  "2D6": "CYP2D6",
  CYP3A4: "CYP3A4",
  "3A4": "CYP3A4",
  CYP3A5: "CYP3A5",
  "3A5": "CYP3A5",
  "CYP3A4/5": "CYP3A4",
  "CYP3A4/3A5": "CYP3A4",
  "3A4/5": "CYP3A4",
  "3A4/3A5": "CYP3A4"
};
var NAME_NORMALIZATION_MAP = {
  "\u03B2-myrcene": "beta-Myrcene",
  "\u03B1-myrcene": "alpha-Myrcene",
  "butylated hydroxyl anisole": "Butylated hydroxyanisole",
  neohesperidine: "Neohesperidin",
  chlormethiazole: "Clomethiazole"
};
var NON_SINGLE_COMPOUND_PATTERNS = [
  {
    pattern: /^brij\s*\d+/i,
    reason: "Brij series are commercial surfactant mixtures rather than single well-defined small molecules."
  },
  {
    pattern: /^tween\s*\d+/i,
    reason: "Tween series are polysorbate surfactant mixtures rather than single discrete compounds."
  },
  {
    pattern: /microcrystalline\s+cellulose/i,
    reason: "Microcrystalline cellulose is an excipient/material, not a single small molecule suitable for one-CID screening."
  }
];
function normalizeCandidateNames(name) {
  const trimmed = name.trim();
  const variants = /* @__PURE__ */ new Set();
  const lower = trimmed.toLowerCase();
  if (NAME_NORMALIZATION_MAP[lower]) variants.add(NAME_NORMALIZATION_MAP[lower]);
  const greekNormalized = trimmed.replace(/[βΒ]/g, "beta").replace(/[αΑ]/g, "alpha").replace(/\s+/g, " ");
  if (greekNormalized !== trimmed) variants.add(greekNormalized);
  const dehyphenated = trimmed.replace(/-/g, " ");
  if (dehyphenated !== trimmed) variants.add(dehyphenated);
  return Array.from(variants).map((v) => v.trim()).filter(Boolean);
}
function classifyNonSingleCompound(name) {
  for (const entry of NON_SINGLE_COMPOUND_PATTERNS) {
    if (entry.pattern.test(name)) return entry.reason;
  }
  return null;
}
async function lookupPubChemByName(originalName, queryName) {
  const cidUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(queryName)}/cids/JSON`;
  const cidRes = await fetch(cidUrl, { signal: AbortSignal.timeout(2e4) });
  if (!cidRes.ok) {
    return {
      name: originalName,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: cidRes.status === 404 ? "not_found" : "error",
      errorMessage: `PubChem lookup failed for ${queryName} (HTTP ${cidRes.status})`
    };
  }
  const cidData = await cidRes.json();
  const cid = cidData?.IdentifierList?.CID?.[0];
  if (!cid) {
    return {
      name: originalName,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "not_found",
      errorMessage: `No CID found in PubChem for ${queryName}`
    };
  }
  const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IsomericSMILES,CanonicalSMILES,MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount/JSON`;
  const propRes = await fetch(propUrl, {
    signal: AbortSignal.timeout(2e4)
  });
  if (!propRes.ok) {
    return {
      name: originalName,
      cid,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "error",
      errorMessage: `Property fetch failed (HTTP ${propRes.status})`
    };
  }
  const propData = await propRes.json();
  const props = propData?.PropertyTable?.Properties?.[0] ?? {};
  return {
    name: originalName,
    cid,
    smiles: props.IsomericSMILES ?? props.CanonicalSMILES ?? props.SMILES ?? props.ConnectivitySMILES ?? null,
    mw: props.MolecularWeight != null ? Number(props.MolecularWeight) : null,
    logP: props.XLogP != null ? Number(props.XLogP) : null,
    tpsa: props.TPSA != null ? Number(props.TPSA) : null,
    hbd: props.HBondDonorCount != null ? Number(props.HBondDonorCount) : null,
    hba: props.HBondAcceptorCount != null ? Number(props.HBondAcceptorCount) : null,
    status: "success",
    errorMessage: queryName !== originalName ? `Resolved via normalized name: ${queryName}` : void 0
  };
}
async function fetchCompoundFromPubChem(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      name: trimmed,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "error",
      errorMessage: "Empty compound name"
    };
  }
  const nonSingleReason = classifyNonSingleCompound(trimmed);
  if (nonSingleReason) {
    return {
      name: trimmed,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "not_single_compound",
      errorMessage: nonSingleReason
    };
  }
  try {
    const primaryResult = await lookupPubChemByName(trimmed, trimmed);
    if (primaryResult.status === "success") return primaryResult;
    if (primaryResult.status === "error") return primaryResult;
    const candidates = normalizeCandidateNames(trimmed);
    for (const candidate of candidates) {
      const result = await lookupPubChemByName(trimmed, candidate);
      if (result.status === "success") return result;
      if (result.status === "error") return result;
    }
    return {
      name: trimmed,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "name_unresolved",
      errorMessage: "PubChem could not resolve this name. Try a standardized compound name, synonym, or CAS-linked small-molecule name."
    };
  } catch (err) {
    return {
      name: trimmed,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "error",
      errorMessage: err?.message ?? "Unknown error"
    };
  }
}
function screenBBB(compound) {
  const { mw, logP, tpsa, hbd, hba } = compound;
  const boiledEgg = tpsa !== null && logP !== null && tpsa < 79 && logP > 0.4 && logP < 6;
  const rules = [
    mw !== null && mw < 450,
    logP !== null && logP < 5,
    tpsa !== null && tpsa < 90,
    hbd !== null && hbd < 3,
    hba !== null && hba < 7
  ];
  const admetlabRulesPassed = rules.filter(Boolean).length;
  const admetlab = admetlabRulesPassed === 5;
  let logPS = null;
  if (tpsa !== null && logP !== null && mw !== null) {
    logPS = parseFloat(
      (-1 - 0.012 * tpsa + 0.26 * logP - 6e-4 * mw).toFixed(3)
    );
  }
  let kpuuBrain = null;
  if (tpsa !== null && logP !== null && mw !== null && hbd !== null && hba !== null) {
    const hbBonus = hbd + hba <= 5 ? 1 : 0;
    const logKpuu = -0.05 * tpsa + 0.1 * logP - 5e-3 * mw + 0.1 * hbBonus;
    kpuuBrain = parseFloat(Math.pow(10, logKpuu).toFixed(6));
  }
  let bbbPotential;
  if (boiledEgg && admetlab && logPS !== null && logPS > -1.5) {
    bbbPotential = "Very High";
  } else if (boiledEgg && admetlabRulesPassed >= 4) {
    bbbPotential = "High";
  } else if (admetlabRulesPassed >= 3 || boiledEgg) {
    bbbPotential = "Moderate";
  } else {
    bbbPotential = "Low";
  }
  return {
    boiledEgg,
    admetlab,
    admetlabRulesPassed,
    logPS,
    kpuuBrain,
    bbbPotential
  };
}
function hasSulfurAtom(smiles) {
  return /[Ss]/.test(smiles) && !/\[Si\]/.test(smiles);
}
function hasNHeterocycle(smiles) {
  const lower = smiles.toLowerCase();
  if (/n\d|n[^a-z]|\[nh\]|n.*n/.test(lower)) return true;
  if (/N\d|N[^A-Za-z].*\d|\d.*N/.test(smiles)) return true;
  if (/N=C.*N|N.*C=N|C=NN/.test(smiles)) return true;
  return false;
}
function hasPhenylRing(smiles) {
  if (/c1ccc/.test(smiles) || /c1cc[co]/.test(smiles)) return true;
  if ((smiles.match(/[c]/g) || []).length >= 5) return true;
  if (/C1=CC=CC=C1|C1=CC=C\(.*\)C=C1/.test(smiles)) return true;
  return false;
}
function countAromaticAtoms(smiles) {
  return (smiles.match(/[cnos]/g) || []).length;
}
function countNitrogenAtoms(smiles) {
  const matches = smiles.match(/N|n/g);
  return matches ? matches.length : 0;
}
function hasHalogen(smiles) {
  return /Cl|Br|F|I/.test(smiles);
}
function hasEtherOrMethoxy(smiles) {
  return /COC|Oc|cO|CO[^N]/.test(smiles);
}
function hasBasicAmine(smiles) {
  return /N\(|N[Cc]|CN|NCC|N1|n1/.test(smiles);
}
function scoreToPotential(score) {
  if (score >= 11) return "Very High";
  if (score >= 8) return "High";
  if (score >= 5) return "Moderate";
  return "Low";
}
function potentialToRepresentativeScore(potential) {
  switch (potential) {
    case "Very High":
      return 12;
    case "High":
      return 9;
    case "Moderate":
      return 6;
    default:
      return 2;
  }
}
function inRange(value, min, max) {
  return value !== null && value >= min && value <= max;
}
function addFeature(features, enabled, label, scoreValue) {
  if (!enabled) return 0;
  features.push(label);
  return scoreValue;
}
function finalizeCYP450Panel(entries) {
  const majorFamilyScore = Number(
    (entries.reduce((sum, item) => sum + item.score, 0) / entries.length).toFixed(2)
  );
  const overallPotential = scoreToPotential(Math.round(majorFamilyScore));
  const topScore = Math.max(...entries.map((item) => item.score));
  const topIsoforms = entries.filter((item) => item.score === topScore).map((item) => item.isoform);
  return {
    majorFamilyScore,
    overallPotential,
    topIsoforms
  };
}
function makePredictedIsoformResult(args) {
  return {
    isoform: args.isoform,
    score: args.score,
    potential: scoreToPotential(args.score),
    features: args.features,
    summary: args.summary,
    source: "predicted",
    measuredValue: null,
    measuredUnit: null,
    measuredRelation: null,
    measuredNote: null,
    details: args.details
  };
}
function normalizeCompoundName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function normalizeIsoform(value) {
  const cleaned = value.toUpperCase().replace(/\s+/g, "");
  return MEASURED_ISOFORM_ALIASES[cleaned] ?? null;
}
function parseConcentrationToMicromolar(value, unit) {
  const normalized = unit.trim().toLowerCase().replace(/μ/g, "u").replace(/µ/g, "u");
  if (["um", "\u03BCm", "\xB5m", "microm", "micromolar"].includes(normalized)) {
    return value;
  }
  if (["nm", "nanom", "nanomolar"].includes(normalized)) {
    return value / 1e3;
  }
  if (["mm", "millim", "millimolar"].includes(normalized)) {
    return value * 1e3;
  }
  return null;
}
function measuredValueToPotential(value, unit, relation) {
  const asMicromolar = parseConcentrationToMicromolar(value, unit);
  let potential;
  if (asMicromolar == null) {
    if (value <= 1) potential = "Very High";
    else if (value <= 10) potential = "High";
    else if (value <= 50) potential = "Moderate";
    else potential = "Low";
  } else if (asMicromolar <= 1) {
    potential = "Very High";
  } else if (asMicromolar <= 10) {
    potential = "High";
  } else if (asMicromolar <= 50) {
    potential = "Moderate";
  } else {
    potential = "Low";
  }
  if (relation && relation.includes(">") && potential !== "Low") {
    return potential === "Very High" ? "High" : potential === "High" ? "Moderate" : "Low";
  }
  return potential;
}
function applyMeasuredRecord(predicted, record) {
  if (!record || predicted.isoform !== record.isoform) return predicted;
  const potential = measuredValueToPotential(
    record.value,
    record.unit,
    record.relation
  );
  return {
    ...predicted,
    score: potentialToRepresentativeScore(potential),
    potential,
    source: "measured",
    measuredValue: record.value,
    measuredUnit: record.unit,
    measuredRelation: record.relation ?? null,
    measuredNote: record.note ?? null,
    summary: `Measured ${predicted.isoform} inhibition data available; experimental value shown with priority over prediction.`,
    features: [
      `Measured value available (${record.relation ?? ""}${record.value} ${record.unit})`,
      ...predicted.features
    ]
  };
}
function parseMeasuredDataCsv(text2) {
  const trimmed = text2.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes("	") ? "	" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const findIndex = (...candidates) => headers.findIndex((header) => candidates.includes(header));
  const compoundIdx = findIndex("compound", "compound_name", "name", "drug");
  const isoformIdx = findIndex("isoform", "cyp", "enzyme");
  const valueIdx = findIndex("value", "ic50", "ki", "inhibition_value");
  const unitIdx = findIndex("unit", "units");
  const relationIdx = findIndex("relation", "operator", "sign");
  const noteIdx = findIndex("note", "notes", "comment", "comments", "source");
  if (compoundIdx === -1 || isoformIdx === -1 || valueIdx === -1) {
    throw new Error(
      "Measured data CSV must include compound, isoform, and value columns."
    );
  }
  const records = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter).map((part) => part.trim().replace(/^"|"$/g, ""));
    const compoundName = cols[compoundIdx] ?? "";
    const isoform = normalizeIsoform(cols[isoformIdx] ?? "");
    const value = Number(cols[valueIdx]);
    const unit = unitIdx >= 0 ? cols[unitIdx] ?? "uM" : "uM";
    const relation = relationIdx >= 0 ? cols[relationIdx] ?? null : null;
    const note = noteIdx >= 0 ? cols[noteIdx] ?? null : null;
    if (!compoundName || !isoform || !Number.isFinite(value)) continue;
    records.push({
      compoundName,
      isoform,
      value,
      unit: unit || "uM",
      relation,
      note
    });
  }
  return records;
}
function buildMeasuredRecordMap(records) {
  const mapped = /* @__PURE__ */ new Map();
  for (const record of records) {
    const key = `${normalizeCompoundName(record.compoundName)}::${record.isoform}`;
    mapped.set(key, record);
    if (record.isoform === "CYP3A4" && record.note?.toUpperCase().includes("3A5")) {
      mapped.set(`${normalizeCompoundName(record.compoundName)}::CYP3A5`, {
        ...record,
        isoform: "CYP3A5"
      });
    }
  }
  return mapped;
}
function screenCYP2E1(compound) {
  const { mw, logP, smiles, hbd, hba } = compound;
  const smilesStr = smiles ?? "";
  let totalScore = 0;
  const features = [];
  let mvScore = 0;
  let mvDesc = "";
  if (mw !== null) {
    if (mw < 150) {
      mvScore = 4;
      mvDesc = `Very small molecule (MW=${mw} < 150)`;
    } else if (mw < 250) {
      mvScore = 3;
      mvDesc = `Small molecule (MW=${mw} < 250)`;
    } else if (mw < 350) {
      mvScore = 2;
      mvDesc = `Medium molecule (MW=${mw} < 350)`;
    } else if (mw < 450) {
      mvScore = 1;
      mvDesc = `Large molecule (MW=${mw} < 450)`;
    } else {
      mvScore = 0;
      mvDesc = `Too large for CYP2E1 pocket (MW=${mw} >= 450)`;
    }
  } else {
    mvDesc = "MW data unavailable";
  }
  totalScore += mvScore;
  if (mvScore >= 3) features.push("Small molecular volume");
  let hlScore = 0;
  let hlDesc = "";
  const hasS = smilesStr ? hasSulfurAtom(smilesStr) : false;
  const hasNHet = smilesStr ? hasNHeterocycle(smilesStr) : false;
  if (hasS && hasNHet) {
    hlScore = 5;
    hlDesc = "Both sulfur atom and N-heterocycle present (strong heme ligation)";
    features.push("Sulfur atom (heme ligation)");
    features.push("N-heterocycle (heme ligation)");
  } else if (hasS) {
    hlScore = 4;
    hlDesc = "Sulfur atom present (direct heme iron coordination)";
    features.push("Sulfur atom (heme ligation)");
  } else if (hasNHet) {
    hlScore = 4;
    hlDesc = "N-heterocycle present (pyrazole/imidazole-type heme ligation)";
    features.push("N-heterocycle (heme ligation)");
  } else {
    hlScore = 0;
    hlDesc = "No heme-coordinating atoms detected";
  }
  totalScore += hlScore;
  let hiScore = 0;
  let hiDesc = "";
  const hasAromatic = smilesStr ? hasPhenylRing(smilesStr) : false;
  const optimalLogP = logP !== null && logP >= 1 && logP <= 4;
  if (optimalLogP && hasAromatic) {
    hiScore = 3;
    hiDesc = `Optimal LogP (${logP}) + aromatic ring (\u03C0-\u03C0 stacking with Phe298/478)`;
    features.push("Aromatic ring (Phe298/478 \u03C0-\u03C0 stacking)");
    features.push("Optimal lipophilicity (LogP 1-4)");
  } else if (optimalLogP) {
    hiScore = 2;
    hiDesc = `Optimal LogP (${logP}) for hydrophobic pocket`;
    features.push("Optimal lipophilicity (LogP 1-4)");
  } else if (hasAromatic) {
    hiScore = 1;
    hiDesc = "Aromatic ring present but LogP outside optimal range";
    features.push("Aromatic ring present");
  } else {
    hiScore = 0;
    hiDesc = "Limited hydrophobic interaction potential";
  }
  totalScore += hiScore;
  let hbScore = 0;
  let hbDesc = "";
  if (hbd !== null && hba !== null) {
    if (hbd >= 1 && hba >= 1 && hbd + hba <= 6) {
      hbScore = 2;
      hbDesc = `Good H-bond profile (HBD=${hbd}, HBA=${hba}) for Thr303 interaction`;
      features.push("H-bond potential (Thr303 interaction)");
    } else if (hbd >= 1 || hba >= 1) {
      hbScore = 1;
      hbDesc = `Partial H-bond capability (HBD=${hbd}, HBA=${hba})`;
      features.push("Partial H-bond potential");
    } else {
      hbScore = 0;
      hbDesc = "No H-bond donors/acceptors";
    }
  } else {
    hbDesc = "HBD/HBA data unavailable";
  }
  totalScore += hbScore;
  const potential = scoreToPotential(totalScore);
  return {
    isoform: "CYP2E1",
    score: totalScore,
    potential,
    features,
    summary: `Predicted ${potential} CYP2E1 inhibition potential based on size, heme ligation, hydrophobicity, and H-bond profile.`,
    source: "predicted",
    measuredValue: null,
    measuredUnit: null,
    measuredRelation: null,
    measuredNote: null,
    details: {
      molecularVolume: { score: mvScore, description: mvDesc },
      hemeLigation: { score: hlScore, description: hlDesc },
      hydrophobicInteraction: { score: hiScore, description: hiDesc },
      hydrogenBonding: { score: hbScore, description: hbDesc }
    }
  };
}
function screenCYP1A2(compound) {
  const { smiles, logP, mw } = compound;
  const s = smiles ?? "";
  const aromaticAtoms = countAromaticAtoms(s);
  const nitrogens = countNitrogenAtoms(s);
  let score = 0;
  const features = [];
  if (aromaticAtoms >= 6) {
    score += 4;
    features.push("Extended aromatic surface");
  } else if (aromaticAtoms >= 3) {
    score += 2;
  }
  score += addFeature(features, nitrogens >= 1, "Ring/basic nitrogen", 3);
  score += addFeature(
    features,
    inRange(logP, 1.5, 4.5),
    "Favorable lipophilicity",
    2
  );
  if (mw !== null && mw <= 400) {
    score += 2;
  }
  return makePredictedIsoformResult({
    isoform: "CYP1A2",
    score,
    features,
    summary: "Predicted from aromaticity, nitrogen-containing motifs, and moderate lipophilicity typical of CYP1A2 binders."
  });
}
function screenCYP2C9(compound) {
  const { smiles, logP, hba, mw } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features = [];
  score += addFeature(features, hasPhenylRing(s), "Hydrophobic/aromatic anchor", 3);
  score += addFeature(features, hasHalogen(s), "Halogen substituent", 2);
  score += addFeature(features, hba !== null && hba >= 2, "Acceptor-rich motif", 2);
  if (inRange(logP, 2, 5)) {
    score += 2;
  }
  if (mw !== null && mw >= 220 && mw <= 450) {
    score += 2;
  }
  return makePredictedIsoformResult({
    isoform: "CYP2C9",
    score,
    features,
    summary: "Predicted from hydrophobic aromatic motifs, halogens, and moderate-to-high lipophilicity often associated with CYP2C9 inhibition."
  });
}
function screenCYP2C19(compound) {
  const { smiles, logP, hba } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features = [];
  score += addFeature(features, hasNHeterocycle(s), "N-heterocycle", 4);
  score += addFeature(features, hasEtherOrMethoxy(s), "Ether/methoxy motif", 2);
  score += addFeature(features, hasPhenylRing(s), "Aromatic ring", 2);
  if (inRange(logP, 1, 4.5)) {
    score += 2;
  }
  if (hba !== null && hba >= 2) {
    score += 1;
  }
  return makePredictedIsoformResult({
    isoform: "CYP2C19",
    score,
    features,
    summary: "Predicted from N-heterocycles, ether-containing motifs, and aromatic lipophilic features commonly seen in CYP2C19 inhibitors."
  });
}
function screenCYP2D6(compound) {
  const { smiles, logP, mw } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features = [];
  score += addFeature(features, hasBasicAmine(s), "Basic amine center", 5);
  score += addFeature(features, hasPhenylRing(s), "Aromatic pharmacophore", 2);
  if (inRange(logP, 1.5, 5)) {
    score += 2;
  }
  if (mw !== null && mw >= 180 && mw <= 450) {
    score += 1;
  }
  return makePredictedIsoformResult({
    isoform: "CYP2D6",
    score,
    features,
    summary: "Predicted from basic amines plus aromatic features, the classic interaction pattern for CYP2D6 ligands."
  });
}
function screenCYP3A4(compound) {
  const { smiles, logP, mw, hba } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features = [];
  score += addFeature(
    features,
    inRange(mw, 250, 650),
    "Larger scaffold tolerated by CYP3A4",
    3
  );
  score += addFeature(features, hasPhenylRing(s), "Hydrophobic aromatic motif", 2);
  score += addFeature(features, inRange(logP, 2, 6), "High lipophilicity", 3);
  if (hba !== null && hba >= 2) {
    score += 1;
  }
  if (hasHalogen(s) || hasEtherOrMethoxy(s)) {
    score += 1;
  }
  return makePredictedIsoformResult({
    isoform: "CYP3A4",
    score,
    features,
    summary: "Predicted from bulkier lipophilic scaffolds and broad hydrophobic contact potential characteristic of CYP3A4 binders."
  });
}
function screenCYP3A5(compound) {
  const { smiles, logP, mw, hba, hbd } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features = [];
  score += addFeature(
    features,
    inRange(mw, 220, 620),
    "Medium-to-large scaffold tolerated by CYP3A5",
    2
  );
  score += addFeature(features, hasPhenylRing(s), "Hydrophobic aromatic surface", 2);
  score += addFeature(features, inRange(logP, 1.5, 5.5), "Lipophilic binding profile", 2);
  score += addFeature(features, hba !== null && hba >= 2, "Acceptor-rich contact pattern", 2);
  score += addFeature(features, hbd !== null && hbd >= 1, "Polar interaction handle", 1);
  if (hasEtherOrMethoxy(s) || hasBasicAmine(s)) {
    score += 2;
    features.push("Flexible heteroatom/basic motif");
  }
  return makePredictedIsoformResult({
    isoform: "CYP3A5",
    score,
    features,
    summary: "Predicted from lipophilic aromatic scaffolds with heteroatom-mediated contacts, used here as a separate CYP3A5 heuristic from CYP3A4."
  });
}
function screenCYP450Panel(compound, measuredRecords = []) {
  const recordMap = buildMeasuredRecordMap(measuredRecords);
  const getMeasured = (isoform) => recordMap.get(`${normalizeCompoundName(compound.name)}::${isoform}`);
  const cyp1a2 = applyMeasuredRecord(screenCYP1A2(compound), getMeasured("CYP1A2"));
  const cyp2c9 = screenCYP2C9(compound);
  const cyp2c19 = screenCYP2C19(compound);
  const cyp2d6 = applyMeasuredRecord(screenCYP2D6(compound), getMeasured("CYP2D6"));
  const cyp2e1 = screenCYP2E1(compound);
  const cyp3a4 = applyMeasuredRecord(screenCYP3A4(compound), getMeasured("CYP3A4"));
  const cyp3a5 = applyMeasuredRecord(screenCYP3A5(compound), getMeasured("CYP3A5"));
  const entries = [cyp1a2, cyp2c9, cyp2c19, cyp2d6, cyp2e1, cyp3a4, cyp3a5];
  const panelSummary = finalizeCYP450Panel(entries);
  return {
    cyp1a2,
    cyp2c9,
    cyp2c19,
    cyp2d6,
    cyp2e1,
    cyp3a4,
    cyp3a5,
    ...panelSummary
  };
}
async function screenCompound(name) {
  const compound = await fetchCompoundFromPubChem(name);
  const bbb = screenBBB(compound);
  const cyp450 = screenCYP450Panel(compound);
  return { compound, bbb, cyp2e1: cyp450.cyp2e1, cyp450 };
}
async function screenCompounds(names) {
  const results = [];
  for (const name of names) {
    const result = await screenCompound(name);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return results;
}

// server/routers.ts
var compoundDataSchema = z2.object({
  name: z2.string(),
  cid: z2.number().nullable(),
  smiles: z2.string().nullable(),
  mw: z2.number().nullable(),
  logP: z2.number().nullable(),
  tpsa: z2.number().nullable(),
  hbd: z2.number().nullable(),
  hba: z2.number().nullable(),
  status: z2.enum([
    "success",
    "not_found",
    "name_unresolved",
    "not_single_compound",
    "error"
  ]),
  errorMessage: z2.string().optional()
});
var appRouter = router({
  literature: router({
    rxnormProducts: publicProcedure.input(
      z2.object({
        name: z2.string().min(1).max(200),
        limit: z2.number().min(1).max(50).optional()
      })
    ).query(async ({ input }) => {
      const { fetchRxNormDrugProducts: fetchRxNormDrugProducts2 } = await Promise.resolve().then(() => (init_rxnorm(), rxnorm_exports));
      const products = await fetchRxNormDrugProducts2({
        name: input.name,
        max: input.limit ?? 20
      });
      return {
        name: input.name,
        products,
        rxnavSearchUrl: `https://mor.nlm.nih.gov/RxNav/search?searchBy=STRING&searchTerm=${encodeURIComponent(input.name)}`
      };
    }),
    clinicalTrials: publicProcedure.input(
      z2.object({
        term: z2.string().min(1).max(200),
        limit: z2.number().min(1).max(20).optional()
      })
    ).query(async ({ input }) => {
      const { fetchClinicalTrials: fetchClinicalTrials2 } = await Promise.resolve().then(() => (init_clinicaltrials(), clinicaltrials_exports));
      const trials = await fetchClinicalTrials2({
        term: input.term,
        max: input.limit ?? 10
      });
      return {
        term: input.term,
        trials,
        ctgovSearchUrl: `https://clinicaltrials.gov/search?query=${encodeURIComponent(input.term)}`
      };
    }),
    pubchem3dSdf: publicProcedure.input(z2.object({ cid: z2.number().int().positive() })).query(async ({ input }) => {
      const { fetchPubChem3dSdfByCid: fetchPubChem3dSdfByCid2 } = await Promise.resolve().then(() => (init_pubchem3d(), pubchem3d_exports));
      const sdf = await fetchPubChem3dSdfByCid2(input.cid);
      return {
        cid: input.cid,
        sdf,
        pubchem3dUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${input.cid}#section=3D-Conformer`
      };
    }),
    pubchemDescription: publicProcedure.input(
      z2.object({
        cid: z2.number().int().positive(),
        name: z2.string().optional()
      })
    ).query(async ({ input }) => {
      const { fetchPubChemDescriptionByCid: fetchPubChemDescriptionByCid2 } = await Promise.resolve().then(() => (init_pubchemView(), pubchemView_exports));
      const desc2 = await fetchPubChemDescriptionByCid2(input.cid);
      return {
        cid: input.cid,
        name: input.name ?? null,
        description: desc2,
        pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${input.cid}`
      };
    }),
    pubmedRecent: publicProcedure.input(
      z2.object({
        term: z2.string().min(1).max(200),
        years: z2.number().min(1).max(10).optional(),
        limit: z2.number().min(1).max(50).optional()
      })
    ).query(async ({ input }) => {
      const { fetchPubMedRecentArticles: fetchPubMedRecentArticles2 } = await Promise.resolve().then(() => (init_pubmed(), pubmed_exports));
      const articles = await fetchPubMedRecentArticles2({
        term: input.term,
        years: input.years ?? 5,
        retmax: input.limit ?? 20
      });
      const q = new URLSearchParams({ term: input.term }).toString();
      return {
        term: input.term,
        years: input.years ?? 5,
        pubmedSearchUrl: `https://pubmed.ncbi.nlm.nih.gov/?${q}`,
        articles
      };
    })
  }),
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  screening: router({
    /** Screen a single compound by name (server-side PubChem fetch - fallback) */
    single: publicProcedure.input(z2.object({ name: z2.string().min(1).max(200) })).mutation(async ({ input }) => {
      return screenCompound(input.name);
    }),
    /** Screen multiple compounds by name (server-side PubChem fetch - fallback) */
    batch: publicProcedure.input(
      z2.object({
        names: z2.array(z2.string().min(1).max(200)).min(1).max(100)
      })
    ).mutation(async ({ input, ctx }) => {
      const results = await screenCompounds(input.names);
      const userId = ctx.user?.id ?? null;
      saveScreeningSession(userId, results).catch(
        (err) => console.error("[Screening] Failed to save session:", err)
      );
      return results;
    }),
    /**
     * Screen compounds with pre-fetched data from frontend.
     * The frontend fetches PubChem data directly (CORS-enabled),
     * then sends the data here for BBB + CYP450 screening calculations.
     */
    screenWithData: publicProcedure.input(
      z2.object({
        compounds: z2.array(compoundDataSchema).min(1).max(100),
        measuredDataCsv: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const measuredRecords = input.measuredDataCsv ? parseMeasuredDataCsv(input.measuredDataCsv) : [];
      const results = input.compounds.map((compoundData) => {
        const compound = {
          name: compoundData.name,
          cid: compoundData.cid,
          smiles: compoundData.smiles,
          mw: compoundData.mw,
          logP: compoundData.logP,
          tpsa: compoundData.tpsa,
          hbd: compoundData.hbd,
          hba: compoundData.hba,
          status: compoundData.status,
          errorMessage: compoundData.errorMessage
        };
        const bbb = screenBBB(compound);
        const cyp450 = screenCYP450Panel(compound, measuredRecords);
        return { compound, bbb, cyp2e1: cyp450.cyp2e1, cyp450 };
      });
      const userId = ctx.user?.id ?? null;
      saveScreeningSession(userId, results).catch(
        (err) => console.error("[Screening] Failed to save session:", err)
      );
      return results;
    }),
    /** Get screening history */
    history: publicProcedure.input(
      z2.object({ limit: z2.number().min(1).max(50).optional() }).optional()
    ).query(async ({ ctx, input }) => {
      return getScreeningHistory(ctx.user?.id ?? null, input?.limit ?? 20);
    }),
    /** Get results for a specific session */
    sessionResults: publicProcedure.input(z2.object({ sessionId: z2.number() })).query(async ({ input }) => {
      return getSessionResults(input.sessionId);
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  const authEnabled = Boolean(
    ENV.oAuthServerUrl && ENV.cookieSecret && ENV.appId
  );
  if (authEnabled) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  } else {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusRuntime(),
  vitePluginManusDebugCollector()
];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerSitePasswordRoutes(app);
  sitePasswordMiddleware(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
