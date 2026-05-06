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
  status:
    | "success"
    | "not_found"
    | "name_unresolved"
    | "not_single_compound"
    | "error";
  errorMessage?: string;
}

const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

const CACHE_PREFIX = "pubchem:compound:v3:";
const CACHE_TTL_SUCCESS_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_NOT_FOUND_MS = 24 * 60 * 60 * 1000;

const NAME_NORMALIZATION_MAP: Record<string, string> = {
  "β-myrcene": "beta-Myrcene",
  "α-myrcene": "alpha-Myrcene",
  "butylated hydroxyl anisole": "Butylated hydroxyanisole",
  neohesperidine: "Neohesperidin",
  chlormethiazole: "Clomethiazole",
};

const NON_SINGLE_COMPOUND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^brij\s*\d+/i,
    reason:
      "Brij series are commercial surfactant mixtures rather than single well-defined small molecules.",
  },
  {
    pattern: /^tween\s*\d+/i,
    reason:
      "Tween series are polysorbate surfactant mixtures rather than single discrete compounds.",
  },
  {
    pattern: /microcrystalline\s+cellulose/i,
    reason:
      "Microcrystalline cellulose is an excipient/material, not a single small molecule suitable for one-CID screening.",
  },
];

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
        : data.status === "not_found" ||
            data.status === "name_unresolved" ||
            data.status === "not_single_compound"
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
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const retries = opts?.retries ?? 4;
  const baseDelayMs = opts?.baseDelayMs ?? 800;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, timeoutMs);
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

function normalizeCandidateNames(name: string): string[] {
  const trimmed = name.trim();
  const variants = new Set<string>();
  const lower = trimmed.toLowerCase();

  if (NAME_NORMALIZATION_MAP[lower]) {
    variants.add(NAME_NORMALIZATION_MAP[lower]);
  }

  const greekNormalized = trimmed
    .replace(/[βΒ]/g, "beta")
    .replace(/[αΑ]/g, "alpha")
    .replace(/\s+/g, " ");
  if (greekNormalized !== trimmed) variants.add(greekNormalized);

  const dehyphenated = trimmed.replace(/-/g, " ");
  if (dehyphenated !== trimmed) variants.add(dehyphenated);

  return Array.from(variants)
    .map(v => v.trim())
    .filter(Boolean);
}

function classifyNonSingleCompound(name: string): string | null {
  for (const entry of NON_SINGLE_COMPOUND_PATTERNS) {
    if (entry.pattern.test(name)) return entry.reason;
  }
  return null;
}

async function lookupPubChemByName(
  originalName: string,
  queryName: string
): Promise<PubChemCompoundData> {
  const cidUrl = `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(queryName)}/cids/JSON`;
  const cidRes = await fetchWithRetry(cidUrl);
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
      errorMessage: `PubChem lookup failed for \"${queryName}\" (HTTP ${cidRes.status})`,
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
      errorMessage: `No CID found in PubChem for \"${queryName}\"`,
    };
  }

  const propUrl = `${PUBCHEM_BASE}/compound/cid/${cid}/property/IsomericSMILES,CanonicalSMILES,MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount/JSON`;
  const propRes = await fetchWithRetry(propUrl);
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
      errorMessage: `Property fetch failed (HTTP ${propRes.status})`,
    };
  }

  const propData = await propRes.json();
  const props = propData?.PropertyTable?.Properties?.[0] ?? {};
  return {
    name: originalName,
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
    errorMessage:
      queryName !== originalName
        ? `Resolved via normalized name: ${queryName}`
        : undefined,
  };
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

  const nonSingleReason = classifyNonSingleCompound(trimmed);
  if (nonSingleReason) {
    const result: PubChemCompoundData = {
      name: trimmed,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "not_single_compound",
      errorMessage: nonSingleReason,
    };
    writeCache(trimmed, result);
    return result;
  }

  const cached = readCache(trimmed);
  if (cached) return cached;

  try {
    const primaryResult = await lookupPubChemByName(trimmed, trimmed);
    if (primaryResult.status === "success") {
      writeCache(trimmed, primaryResult);
      return primaryResult;
    }
    if (primaryResult.status === "error") {
      return primaryResult;
    }

    const candidates = normalizeCandidateNames(trimmed);
    for (const candidate of candidates) {
      const result = await lookupPubChemByName(trimmed, candidate);
      if (result.status === "success") {
        writeCache(trimmed, result);
        return result;
      }
      if (result.status === "error") {
        return result;
      }
    }

    const unresolved: PubChemCompoundData = {
      name: trimmed,
      cid: null,
      smiles: null,
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
      status: "name_unresolved",
      errorMessage:
        "PubChem could not resolve this name. Try a standardized compound name, synonym, or CAS-linked small-molecule name.",
    };
    writeCache(trimmed, unresolved);
    return unresolved;
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

export async function fetchCompoundsFromPubChem(
  names: string[],
  onProgress?: (completed: number, total: number, current: string) => void,
  opts?: { concurrency?: number }
): Promise<PubChemCompoundData[]> {
  const total = names.length;
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 2, 4));

  if (total === 0) return [];

  const results: PubChemCompoundData[] = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;
      const current = names[index];
      onProgress?.(completed, total, current);
      const data = await fetchCompoundFromPubChem(current);
      results[index] = data;
      completed += 1;
      onProgress?.(completed, total, current);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return results;
}
