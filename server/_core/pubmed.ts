export type PubMedArticle = {
  pmid: string;
  title: string;
  journal?: string;
  pubDate?: string;
  authors?: string;
  url: string;
};

type ESearchResp = {
  esearchresult?: {
    idlist?: string[];
  };
};

type ESummaryResp = {
  result?: Record<string, any>;
};

function yearRangeLastNYears(n: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const minYear = currentYear - (n - 1);
  return { minYear, maxYear: currentYear };
}

export async function fetchPubMedRecentArticles(params: {
  term: string;
  years?: number;
  retmax?: number;
}): Promise<PubMedArticle[]> {
  const years = params.years ?? 5;
  const retmax = Math.min(Math.max(params.retmax ?? 20, 1), 50);
  const { minYear, maxYear } = yearRangeLastNYears(years);

  const term = params.term.trim();
  if (!term) return [];

  // ESearch with year filter on publication date
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
    signal: AbortSignal.timeout(15_000),
  });
  if (!es.ok) return [];

  const esData = (await es.json()) as ESearchResp;
  const ids = esData?.esearchresult?.idlist ?? [];
  if (!ids.length) return [];

  // ESummary to get titles, journal, pub dates
  const esummary = new URL(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
  );
  esummary.searchParams.set("db", "pubmed");
  esummary.searchParams.set("retmode", "json");
  esummary.searchParams.set("id", ids.join(","));

  const sum = await fetch(esummary.toString(), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!sum.ok) return [];

  const sumData = (await sum.json()) as ESummaryResp;
  const result = sumData.result ?? {};

  const articles: PubMedArticle[] = [];
  for (const pmid of ids) {
    const item = result[pmid];
    if (!item) continue;
    const title = (item.title as string | undefined)?.trim() ?? "";
    const journal =
      (item.fulljournalname as string | undefined) ??
      (item.source as string | undefined);
    const pubDate =
      (item.pubdate as string | undefined) ??
      (item.epubdate as string | undefined);

    const authorNames = Array.isArray(item.authors)
      ? item.authors
          .map((a: any) => a?.name)
          .filter(Boolean)
          .slice(0, 6)
          .join(", ")
      : undefined;

    articles.push({
      pmid,
      title,
      journal,
      pubDate,
      authors: authorNames,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }

  return articles;
}
