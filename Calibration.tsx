/**
 * Client-side PubChem API integration.
 * PubChem supports CORS (Access-Control-Allow-Origin: *),
 * so we can call it directly from the browser.
 * This avoids HTTP 503 errors that sometimes occur when calling from cloud server IPs.
 */

export interface PubChemCompoundData {
  name: string;
  cid: number | null;
  smiles: string | null;
  mw: number | null;
  logP: number | null;
  tpsa: number | null;
  hbd: number | null;
  hba: number | null;
  status: "success" | "not_found" | "error";
  errorMessage?: string;
}

const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

// Cache strategy:
// - Cache successes longer (default 7 days)
// - Cache not_found shorter (default 1 day)
// - Do not cache transient errors
const CACHE_PREFIX = "pubchem:compound:v1:";
const CACHE_TTL_SUCCESS_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_NOT_FOUND_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  savedAt: number;
  ttlMs: number;
  data: PubChemCompoundData;
};

function cacheKeyForName(name: string) {
  return `${CACHE_PREFIX}${name.trim().toLowerCase()}`;
}

function readCache(name: string): PubChemCompoundData | null {
  try {
    const key = cacheKeyForName(name);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.savedAt || !parsed?.ttlMs || !parsed?.data) return null;

    const expired = Date.now() - parsed.savedAt > parsed.ttlMs;
    if (expired) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(name: string, data: PubChemCompoundData) {
  try {
    const ttlMs =
      data.status === "success"
        ? CACHE_TTL_SUCCESS_MS
        : data.status === "not_found"
          ? CACHE_TTL_NOT_FOUND_MS
          : 0;

    if (!ttlMs) return;

    const key = cacheKeyForName(name);
    const entry: CacheEntry = { savedAt: Date.now(), ttlMs, data };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota / private mode errors
  }
}

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchWithRetry(
  url: string,
  opts?: {
    timeoutMs?: number;
    retries?: number;
    baseDelayMs?: number;
  }
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 400;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, timeoutMs);

      // Treat rate limit / transient upstream errors as retryable.
      if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
        if (attempt < retries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }

      return resp;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
    }
  }
  throw lastErr ?? new Error("PubChem request failed");
}

export async function fetchCompoundFromPubChem(
  name: string
): Promise<PubChemCompoundData> {
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
      errorMessage: "Empty compound name",
    };
  }

  // 1) Cache hit
  const cached = readCache(trimmed);
  if (cached) return cached;

  try {
    // Step 1: Get CID
    const cidUrl = `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(trimmed)}/cids/JSON`;
    const cidRes = await fetchWithRetry(cidUrl);
    if (!cidRes.ok) {
      const result: PubChemCompoundData = {
        name: trimmed,
        cid: null,
        smiles: null,
        mw: null,
        logP: null,
        tpsa: null,
        hbd: null,
        hba: null,
        // PubChem returns 404 for unknown names sometimes; treat as not_found.
        status: cidRes.status === 404 ? "not_found" : "error",
        errorMessage: `PubChem lookup failed (HTTP ${cidRes.status})`,
      };
      writeCache(trimmed, result);
      return result;
    }
    const cidData = await cidRes.json();
    const cid = cidData?.IdentifierList?.CID?.[0];
    if (!cid) {
      const result: PubChemCompoundData = {
        name: trimmed,
        cid: null,
        smiles: null,
        mw: null,
        logP: null,
        tpsa: null,
        hbd: null,
        hba: null,
        status: "not_found",
        errorMessage: "No CID found in PubChem",
      };
      writeCache(trimmed, result);
      return result;
    }

    // Step 2: Get properties
    const propUrl = `${PUBCHEM_BASE}/compound/cid/${cid}/property/IsomericSMILES,CanonicalSMILES,MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount/JSON`;
    const propRes = await fetchWithRetry(propUrl);
    if (!propRes.ok) {
      const result: PubChemCompoundData = {
        name: trimmed,
        cid,
        smiles: null,
        mw: null,
        logP: null,
        tpsa: null,
        hbd: null,
        hba: null,
        status: "error",
        errorMessage: `Property fetch failed (HTTP ${propRes.status})`,
      };
      // don't cache transient errors
      return result;
    }
    const propData = await propRes.json();
    const props = propData?.PropertyTable?.Properties?.[0] ?? {};

    const result: PubChemCompoundData = {
      name: trimmed,
      cid,
      smiles:
        props.IsomericSMILES ??
        props.CanonicalSMILES ??
        props.SMILES ??
        props.ConnectivitySMILES ??
        null,
      mw: props.MolecularWeight != null ? Number(props.MolecularWeight) : null,
      logP: props.XLogP != null ? Number(props.XLogP) : null,
      tpsa: props.TPSA != null ? Number(props.TPSA) : null,
      hbd: props.HBondDonorCount != null ? Number(props.HBondDonorCount) : null,
      hba:
        props.HBondAcceptorCount != null
          ? Number(props.HBondAcceptorCount)
          : null,
      status: "success",
    };

    writeCache(trimmed, result);
    return result;
  } catch (err: any) {
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
      errorMessage: err?.message ?? "Unknown error",
    };
  }
}

/**
 * Fetch multiple compounds with basic rate limiting.
 * Calls onProgress callback for each completed compound.
 */
export async function fetchCompoundsFromPubChem(
  names: string[],
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<PubChemCompoundData[]> {
  const results: PubChemCompoundData[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];

    onProgress?.(i, names.length, name);
    const result = await fetchCompoundFromPubChem(name);
    results.push(result);

    // Rate limit: 200ms between requests to respect PubChem limits
    if (i < names.length - 1) {
      await sleep(200);
    }
  }

  onProgress?.(names.length, names.length, "");
  return results;
}
