import type {
  CompoundProperties,
  BBBScreening,
  CYP2E1Screening,
  ScreeningResult,
  PotentialLevel,
} from "../shared/types";

// ─── PubChem API ───────────────────────────────────────────────────────────────

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
    // Step 1: Get CID
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

    // Step 2: Get properties
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

// ─── BBB Screening ─────────────────────────────────────────────────────────────

export function screenBBB(compound: CompoundProperties): BBBScreening {
  const { mw, logP, tpsa, hbd, hba } = compound;

  // SwissADME BOILED-Egg: TPSA < 79 && 0.4 < LogP < 6.0
  const boiledEgg =
    tpsa !== null && logP !== null && tpsa < 79 && logP > 0.4 && logP < 6.0;

  // ADMETlab 3.0 rules
  const rules = [
    mw !== null && mw < 450,
    logP !== null && logP < 5,
    tpsa !== null && tpsa < 90,
    hbd !== null && hbd < 3,
    hba !== null && hba < 7,
  ];
  const admetlabRulesPassed = rules.filter(Boolean).length;
  const admetlab = admetlabRulesPassed === 5;

  // LogPS estimation: LogPS = -1.0 - 0.012 * TPSA + 0.26 * LogP - 0.0006 * MW
  let logPS: number | null = null;
  if (tpsa !== null && logP !== null && mw !== null) {
    logPS = parseFloat(
      (-1.0 - 0.012 * tpsa + 0.26 * logP - 0.0006 * mw).toFixed(3)
    );
  }

  // Kp,uu,brain estimation: log(Kp,uu) = -0.05 * TPSA + 0.1 * LogP - 0.005 * MW + 0.1 * (HBD+HBA <= 5 ? 1 : 0)
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

  // Overall BBB potential
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

// ─── CYP2E1 Screening ─────────────────────────────────────────────────────────

function countAromaticRings(smiles: string): number {
  // Count lowercase aromatic atoms as a proxy for aromatic ring presence
  const aromaticAtoms = (smiles.match(/[c]/g) || []).length;
  return Math.floor(aromaticAtoms / 5); // rough estimate: 5-6 atoms per ring
}

function hasSulfurAtom(smiles: string): boolean {
  // Check for sulfur in SMILES (uppercase S for aliphatic, lowercase s for aromatic)
  return /[Ss]/.test(smiles) && !/\[Si\]/.test(smiles); // exclude silicon
}

function hasNHeterocycle(smiles: string): boolean {
  // Check for nitrogen-containing heterocycles (pyrazole, imidazole, pyridine, etc.)
  // Handles both aromatic (lowercase n) and Kekulized (uppercase N) SMILES
  const lower = smiles.toLowerCase();
  // Aromatic N in ring: n followed by digit or non-letter
  if (/n\d|n[^a-z]|\[nH\]|n.*n/.test(lower)) return true;
  // Kekulized N in ring: N inside ring closure digits (e.g., N1...1, C1=CNN=C1)
  if (/N\d|N[^A-Za-z].*\d|\d.*N/.test(smiles)) return true;
  // Common N-heterocycle patterns in Kekulized SMILES
  if (/N=C.*N|N.*C=N|C=NN/.test(smiles)) return true;
  return false;
}

function hasPhenylRing(smiles: string): boolean {
  // Check for phenyl/aromatic ring patterns (both aromatic and Kekulized)
  if (/c1ccc/.test(smiles) || /c1cc[co]/.test(smiles)) return true;
  if ((smiles.match(/[c]/g) || []).length >= 5) return true;
  // Kekulized benzene patterns: C1=CC=CC=C1, etc.
  if (/C1=CC=CC=C1|C1=CC=C\(.*\)C=C1/.test(smiles)) return true;
  return false;
}

export function screenCYP2E1(compound: CompoundProperties): CYP2E1Screening {
  const { mw, logP, smiles, hbd, hba } = compound;
  const smilesStr = smiles ?? "";

  let totalScore = 0;
  const features: string[] = [];

  // 1. Molecular Volume (MW as proxy)
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

  // 2. Heme Ligation (S atom or N-heterocycle)
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

  // 3. Hydrophobic Interaction (LogP + aromatic rings for Phe298/478 stacking)
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

  // 4. Hydrogen Bonding (Thr303)
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

  // Overall CYP2E1 potential
  let potential: PotentialLevel;
  if (totalScore >= 11) {
    potential = "Very High";
  } else if (totalScore >= 8) {
    potential = "High";
  } else if (totalScore >= 5) {
    potential = "Moderate";
  } else {
    potential = "Low";
  }

  return {
    score: totalScore,
    potential,
    features,
    details: {
      molecularVolume: { score: mvScore, description: mvDesc },
      hemeLigation: { score: hlScore, description: hlDesc },
      hydrophobicInteraction: { score: hiScore, description: hiDesc },
      hydrogenBonding: { score: hbScore, description: hbDesc },
    },
  };
}

// ─── Full Screening Pipeline ───────────────────────────────────────────────────

export async function screenCompound(name: string): Promise<ScreeningResult> {
  const compound = await fetchCompoundFromPubChem(name);
  const bbb = screenBBB(compound);
  const cyp2e1 = screenCYP2E1(compound);
  return { compound, bbb, cyp2e1 };
}

export async function screenCompounds(
  names: string[]
): Promise<ScreeningResult[]> {
  // Process sequentially with small delay to respect PubChem rate limits
  const results: ScreeningResult[] = [];
  for (const name of names) {
    const result = await screenCompound(name);
    results.push(result);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return results;
}
