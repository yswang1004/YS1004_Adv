import type {
  CompoundProperties,
  BBBScreening,
  CYP2E1Screening,
  CYPInhibitionScreening,
  CYP450Panel,
  ScreeningResult,
  PotentialLevel,
  MeasuredCYPRecord,
  MeasuredSupportedIsoform,
} from "../shared/types";

interface PubChemProperty {
  CID?: number;
  CanonicalSMILES?: string;
  IsomericSMILES?: string;
  SMILES?: string;
  ConnectivitySMILES?: string;
  MolecularWeight?: number | string;
  XLogP?: number;
  TPSA?: number;
  HBondDonorCount?: number;
  HBondAcceptorCount?: number;
}

const MEASURED_ISOFORM_ALIASES: Record<string, MeasuredSupportedIsoform> = {
  CYP1A2: "CYP1A2",
  '1A2': "CYP1A2",
  CYP2D6: "CYP2D6",
  '2D6': "CYP2D6",
  CYP3A4: "CYP3A4",
  '3A4': "CYP3A4",
  CYP3A5: "CYP3A5",
  '3A5': "CYP3A5",
  'CYP3A4/5': "CYP3A4",
  'CYP3A4/3A5': "CYP3A4",
  '3A4/5': "CYP3A4",
  '3A4/3A5': "CYP3A4",
};

export async function fetchCompoundFromPubChem(
  name: string
): Promise<CompoundProperties> {
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

  try {
    const cidUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(trimmed)}/cids/JSON`;
    const cidRes = await fetch(cidUrl, { signal: AbortSignal.timeout(15000) });
    if (!cidRes.ok) {
      return {
        name: trimmed,
        cid: null,
        smiles: null,
        mw: null,
        logP: null,
        tpsa: null,
        hbd: null,
        hba: null,
        status: "not_found",
        errorMessage: `PubChem lookup failed (HTTP ${cidRes.status})`,
      };
    }
    const cidData = await cidRes.json();
    const cid = cidData?.IdentifierList?.CID?.[0];
    if (!cid) {
      return {
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
    }

    const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IsomericSMILES,CanonicalSMILES,MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount/JSON`;
    const propRes = await fetch(propUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!propRes.ok) {
      return {
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
    }
    const propData = await propRes.json();
    const props: PubChemProperty =
      propData?.PropertyTable?.Properties?.[0] ?? {};

    return {
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

export function screenBBB(compound: CompoundProperties): BBBScreening {
  const { mw, logP, tpsa, hbd, hba } = compound;

  const boiledEgg =
    tpsa !== null && logP !== null && tpsa < 79 && logP > 0.4 && logP < 6.0;

  const rules = [
    mw !== null && mw < 450,
    logP !== null && logP < 5,
    tpsa !== null && tpsa < 90,
    hbd !== null && hbd < 3,
    hba !== null && hba < 7,
  ];
  const admetlabRulesPassed = rules.filter(Boolean).length;
  const admetlab = admetlabRulesPassed === 5;

  let logPS: number | null = null;
  if (tpsa !== null && logP !== null && mw !== null) {
    logPS = parseFloat(
      (-1.0 - 0.012 * tpsa + 0.26 * logP - 0.0006 * mw).toFixed(3)
    );
  }

  let kpuuBrain: number | null = null;
  if (
    tpsa !== null &&
    logP !== null &&
    mw !== null &&
    hbd !== null &&
    hba !== null
  ) {
    const hbBonus = hbd + hba <= 5 ? 1 : 0;
    const logKpuu = -0.05 * tpsa + 0.1 * logP - 0.005 * mw + 0.1 * hbBonus;
    kpuuBrain = parseFloat(Math.pow(10, logKpuu).toFixed(6));
  }

  let bbbPotential: PotentialLevel;
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
    bbbPotential,
  };
}

function hasSulfurAtom(smiles: string): boolean {
  return /[Ss]/.test(smiles) && !/\[Si\]/.test(smiles);
}

function hasNHeterocycle(smiles: string): boolean {
  const lower = smiles.toLowerCase();
  if (/n\d|n[^a-z]|\[nh\]|n.*n/.test(lower)) return true;
  if (/N\d|N[^A-Za-z].*\d|\d.*N/.test(smiles)) return true;
  if (/N=C.*N|N.*C=N|C=NN/.test(smiles)) return true;
  return false;
}

function hasPhenylRing(smiles: string): boolean {
  if (/c1ccc/.test(smiles) || /c1cc[co]/.test(smiles)) return true;
  if ((smiles.match(/[c]/g) || []).length >= 5) return true;
  if (/C1=CC=CC=C1|C1=CC=C\(.*\)C=C1/.test(smiles)) return true;
  return false;
}

function countAromaticAtoms(smiles: string): number {
  return (smiles.match(/[cnos]/g) || []).length;
}

function countNitrogenAtoms(smiles: string): number {
  const matches = smiles.match(/N|n/g);
  return matches ? matches.length : 0;
}

function hasHalogen(smiles: string): boolean {
  return /Cl|Br|F|I/.test(smiles);
}

function hasEtherOrMethoxy(smiles: string): boolean {
  return /COC|Oc|cO|CO[^N]/.test(smiles);
}

function hasBasicAmine(smiles: string): boolean {
  return /N\(|N[Cc]|CN|NCC|N1|n1/.test(smiles);
}

function scoreToPotential(score: number): PotentialLevel {
  if (score >= 11) return "Very High";
  if (score >= 8) return "High";
  if (score >= 5) return "Moderate";
  return "Low";
}

function potentialToRepresentativeScore(potential: PotentialLevel): number {
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

function inRange(value: number | null, min: number, max: number): boolean {
  return value !== null && value >= min && value <= max;
}

function addFeature(
  features: string[],
  enabled: boolean,
  label: string,
  scoreValue: number
): number {
  if (!enabled) return 0;
  features.push(label);
  return scoreValue;
}

function finalizeCYP450Panel(entries: CYPInhibitionScreening[]): Pick<
  CYP450Panel,
  "majorFamilyScore" | "overallPotential" | "topIsoforms"
> {
  const majorFamilyScore = Number(
    (entries.reduce((sum, item) => sum + item.score, 0) / entries.length).toFixed(2)
  );
  const overallPotential = scoreToPotential(Math.round(majorFamilyScore));
  const topScore = Math.max(...entries.map(item => item.score));
  const topIsoforms = entries
    .filter(item => item.score === topScore)
    .map(item => item.isoform);

  return {
    majorFamilyScore,
    overallPotential,
    topIsoforms,
  };
}

function makePredictedIsoformResult(args: {
  isoform: CYPInhibitionScreening["isoform"];
  score: number;
  features: string[];
  summary: string;
  details?: Record<string, { score: number; description: string }>;
}): CYPInhibitionScreening {
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
    details: args.details,
  };
}

function normalizeCompoundName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeIsoform(value: string): MeasuredSupportedIsoform | null {
  const cleaned = value.toUpperCase().replace(/\s+/g, "");
  return MEASURED_ISOFORM_ALIASES[cleaned] ?? null;
}

function parseConcentrationToMicromolar(value: number, unit: string): number | null {
  const normalized = unit.trim().toLowerCase().replace(/μ/g, "u").replace(/µ/g, "u");
  if (["um", "μm", "µm", "microm", "micromolar"].includes(normalized)) {
    return value;
  }
  if (["nm", "nanom", "nanomolar"].includes(normalized)) {
    return value / 1000;
  }
  if (["mm", "millim", "millimolar"].includes(normalized)) {
    return value * 1000;
  }
  return null;
}

function measuredValueToPotential(
  value: number,
  unit: string,
  relation?: string | null
): PotentialLevel {
  const asMicromolar = parseConcentrationToMicromolar(value, unit);
  let potential: PotentialLevel;

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
    return potential === "Very High"
      ? "High"
      : potential === "High"
        ? "Moderate"
        : "Low";
  }

  return potential;
}

function applyMeasuredRecord(
  predicted: CYPInhibitionScreening,
  record?: MeasuredCYPRecord
): CYPInhibitionScreening {
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
      ...predicted.features,
    ],
  };
}

export function parseMeasuredDataCsv(text: string): MeasuredCYPRecord[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

  const findIndex = (...candidates: string[]) =>
    headers.findIndex(header => candidates.includes(header));

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

  const records: MeasuredCYPRecord[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter).map(part => part.trim().replace(/^"|"$/g, ""));
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
      note,
    });
  }

  return records;
}

function buildMeasuredRecordMap(records: MeasuredCYPRecord[]) {
  const mapped = new Map<string, MeasuredCYPRecord>();
  for (const record of records) {
    const key = `${normalizeCompoundName(record.compoundName)}::${record.isoform}`;
    mapped.set(key, record);
    if (record.isoform === "CYP3A4" && record.note?.toUpperCase().includes("3A5")) {
      mapped.set(`${normalizeCompoundName(record.compoundName)}::CYP3A5`, {
        ...record,
        isoform: "CYP3A5",
      });
    }
  }
  return mapped;
}

export function screenCYP2E1(compound: CompoundProperties): CYP2E1Screening {
  const { mw, logP, smiles, hbd, hba } = compound;
  const smilesStr = smiles ?? "";

  let totalScore = 0;
  const features: string[] = [];

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
    hlDesc =
      "Both sulfur atom and N-heterocycle present (strong heme ligation)";
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
  const optimalLogP = logP !== null && logP >= 1.0 && logP <= 4.0;

  if (optimalLogP && hasAromatic) {
    hiScore = 3;
    hiDesc = `Optimal LogP (${logP}) + aromatic ring (π-π stacking with Phe298/478)`;
    features.push("Aromatic ring (Phe298/478 π-π stacking)");
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
      hydrogenBonding: { score: hbScore, description: hbDesc },
    },
  };
}

function screenCYP1A2(compound: CompoundProperties): CYPInhibitionScreening {
  const { smiles, logP, mw } = compound;
  const s = smiles ?? "";
  const aromaticAtoms = countAromaticAtoms(s);
  const nitrogens = countNitrogenAtoms(s);
  let score = 0;
  const features: string[] = [];

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
    summary:
      "Predicted from aromaticity, nitrogen-containing motifs, and moderate lipophilicity typical of CYP1A2 binders.",
  });
}

function screenCYP2C9(compound: CompoundProperties): CYPInhibitionScreening {
  const { smiles, logP, hba, mw } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features: string[] = [];

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
    summary:
      "Predicted from hydrophobic aromatic motifs, halogens, and moderate-to-high lipophilicity often associated with CYP2C9 inhibition.",
  });
}

function screenCYP2C19(compound: CompoundProperties): CYPInhibitionScreening {
  const { smiles, logP, hba } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features: string[] = [];

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
    summary:
      "Predicted from N-heterocycles, ether-containing motifs, and aromatic lipophilic features commonly seen in CYP2C19 inhibitors.",
  });
}

function screenCYP2D6(compound: CompoundProperties): CYPInhibitionScreening {
  const { smiles, logP, mw } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features: string[] = [];

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
    summary:
      "Predicted from basic amines plus aromatic features, the classic interaction pattern for CYP2D6 ligands.",
  });
}

function screenCYP3A4(compound: CompoundProperties): CYPInhibitionScreening {
  const { smiles, logP, mw, hba } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features: string[] = [];

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
    summary:
      "Predicted from bulkier lipophilic scaffolds and broad hydrophobic contact potential characteristic of CYP3A4 binders.",
  });
}

function screenCYP3A5(compound: CompoundProperties): CYPInhibitionScreening {
  const { smiles, logP, mw, hba, hbd } = compound;
  const s = smiles ?? "";
  let score = 0;
  const features: string[] = [];

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
    summary:
      "Predicted from lipophilic aromatic scaffolds with heteroatom-mediated contacts, used here as a separate CYP3A5 heuristic from CYP3A4.",
  });
}

export function screenCYP450Panel(
  compound: CompoundProperties,
  measuredRecords: MeasuredCYPRecord[] = []
): CYP450Panel {
  const recordMap = buildMeasuredRecordMap(measuredRecords);
  const getMeasured = (isoform: MeasuredSupportedIsoform) =>
    recordMap.get(`${normalizeCompoundName(compound.name)}::${isoform}`);

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
    ...panelSummary,
  };
}

export async function screenCompound(name: string): Promise<ScreeningResult> {
  const compound = await fetchCompoundFromPubChem(name);
  const bbb = screenBBB(compound);
  const cyp450 = screenCYP450Panel(compound);
  return { compound, bbb, cyp2e1: cyp450.cyp2e1, cyp450 };
}

export async function screenCompounds(
  names: string[]
): Promise<ScreeningResult[]> {
  const results: ScreeningResult[] = [];
  for (const name of names) {
    const result = await screenCompound(name);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return results;
}
