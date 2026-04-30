export type ClinicalTrial = {
  nctId: string;
  title: string;
  status?: string;
  startDate?: string;
  completionDate?: string;
  url: string;
};

type CtgovResp = {
  studies?: Array<any>;
  nextPageToken?: string;
};

export async function fetchClinicalTrials(params: {
  term: string;
  max?: number;
}): Promise<ClinicalTrial[]> {
  const term = params.term.trim();
  if (!term) return [];
  const max = Math.min(Math.max(params.max ?? 10, 1), 20);

  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("query.term", term);
  url.searchParams.set("pageSize", String(max));

  // Keep payload small
  url.searchParams.set(
    "fields",
    [
      "protocolSection.identificationModule.nctId",
      "protocolSection.identificationModule.briefTitle",
      "protocolSection.statusModule.overallStatus",
      "protocolSection.statusModule.startDateStruct",
      "protocolSection.statusModule.completionDateStruct",
    ].join(",")
  );

  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) return [];

  const data = (await resp.json()) as CtgovResp;
  const studies = data.studies ?? [];

  const out: ClinicalTrial[] = [];
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
      url: `https://clinicaltrials.gov/study/${id}`,
    });
  }

  return out;
}
