type PubChemViewSection = {
  TOCHeading?: string;
  Description?: string;
  Information?: Array<{
    Value?: {
      StringWithMarkup?: Array<{ String?: string }>;
      String?: string;
    };
  }>;
  Section?: PubChemViewSection[];
};

type PubChemViewRecord = {
  Record?: {
    Section?: PubChemViewSection[];
  };
};

function pickFirstTextFromSection(
  section: PubChemViewSection | undefined
): string | null {
  if (!section) return null;

  const infos = section.Information ?? [];
  for (const info of infos) {
    const v = info.Value;
    const fromMarkup = v?.StringWithMarkup?.map(x => x.String)
      .filter(Boolean)
      .join(" ");
    if (fromMarkup) return fromMarkup.trim();
    if (v?.String) return String(v.String).trim();
  }

  // DFS into children
  for (const child of section.Section ?? []) {
    const t = pickFirstTextFromSection(child);
    if (t) return t;
  }

  return null;
}

function findSectionByHeading(
  sections: PubChemViewSection[] | undefined,
  heading: string
): PubChemViewSection | undefined {
  if (!sections) return undefined;
  for (const s of sections) {
    if ((s.TOCHeading ?? "").toLowerCase() === heading.toLowerCase()) return s;
    const found = findSectionByHeading(s.Section, heading);
    if (found) return found;
  }
  return undefined;
}

export async function fetchPubChemDescriptionByCid(
  cid: number
): Promise<string | null> {
  // PUG-View provides narrative content (descriptions, safety, etc.)
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) return null;

  const data = (await resp.json()) as PubChemViewRecord;
  const sections = data.Record?.Section;
  if (!sections) return null;

  // Common headings for a human-readable intro
  const candidates = [
    "Record Description",
    "Description",
    "Drug and Medication Information",
    "Biological Test Results",
  ];

  for (const h of candidates) {
    const sec = findSectionByHeading(sections, h);
    const text = pickFirstTextFromSection(sec);
    if (text) return text;
  }

  // Fallback: first text we can find
  for (const s of sections) {
    const text = pickFirstTextFromSection(s);
    if (text) return text;
  }

  return null;
}
