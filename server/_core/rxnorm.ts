export type RxNormDrugProduct = {
  name: string;
  rxcui: string;
  tty?: string;
  url: string;
};

type GetDrugsResp = {
  drugGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{
        rxcui?: string;
        name?: string;
        tty?: string;
      }>;
    }>;
  };
};

export async function fetchRxNormDrugProducts(params: {
  name: string;
  max?: number;
}): Promise<RxNormDrugProduct[]> {
  const name = params.name.trim();
  if (!name) return [];
  const max = Math.min(Math.max(params.max ?? 20, 1), 50);

  // RxNorm API: getDrugs?name=...
  const url = new URL("https://rxnav.nlm.nih.gov/REST/drugs.json");
  url.searchParams.set("name", name);

  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) return [];

  const data = (await resp.json()) as GetDrugsResp;
  const groups = data.drugGroup?.conceptGroup ?? [];

  const out: RxNormDrugProduct[] = [];
  for (const g of groups) {
    const tty = g.tty;
    const props = g.conceptProperties ?? [];
    for (const p of props) {
      if (!p?.rxcui || !p?.name) continue;
      out.push({
        name: p.name,
        rxcui: p.rxcui,
        tty: p.tty ?? tty,
        url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${encodeURIComponent(p.rxcui)}`,
      });
    }
  }

  // Prioritize branded and clinical drug concepts if present
  const priority = new Map([
    ["SBD", 1],
    ["SCD", 2],
    ["BPCK", 3],
    ["GPCK", 4],
    ["BN", 5],
    ["IN", 6],
  ]);

  out.sort(
    (a, b) =>
      (priority.get(a.tty ?? "") ?? 99) - (priority.get(b.tty ?? "") ?? 99)
  );

  // De-duplicate by name
  const seen = new Set<string>();
  const dedup: RxNormDrugProduct[] = [];
  for (const x of out) {
    const key = x.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(x);
    if (dedup.length >= max) break;
  }

  return dedup;
}
