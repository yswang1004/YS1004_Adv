/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

/** Potential level for BBB and CYP2E1 screening */
export type PotentialLevel = "Very High" | "High" | "Moderate" | "Low";

/** Confidence level for model trustworthiness */
export type ConfidenceLevel = "High" | "Medium" | "Low";

export interface ConfidenceBlock {
  /** 0-100 */
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
}

export interface ScreeningConfidence {
  bbb: ConfidenceBlock;
  cyp2e1: ConfidenceBlock;
  overall: ConfidenceBlock;
  /** Risk flags that often drive false positives (e.g., reactive/chelator) */
  flags: string[];
}

/** Raw physicochemical properties from PubChem */
export interface CompoundProperties {
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

/** BBB screening result */
export interface BBBScreening {
  /** SwissADME BOILED-Egg: TPSA < 79 && 0.4 < LogP < 6.0 */
  boiledEgg: boolean;
  /** ADMETlab 3.0: MW<450, LogP<5, TPSA<90, HBD<3, HBA<7 */
  admetlab: boolean;
  /** Number of ADMETlab rules passed (out of 5) */
  admetlabRulesPassed: number;
  /** Estimated LogPS value */
  logPS: number | null;
  /** Estimated Kp,uu,brain value */
  kpuuBrain: number | null;
  /** Overall BBB potential level */
  bbbPotential: PotentialLevel;
}

/** CYP2E1 inhibition screening result */
export interface CYP2E1Screening {
  /** Total inhibition score */
  score: number;
  /** Overall CYP2E1 inhibition potential */
  potential: PotentialLevel;
  /** Key structural features identified */
  features: string[];
  /** Detailed feature breakdown */
  details: {
    molecularVolume: { score: number; description: string };
    hemeLigation: { score: number; description: string };
    hydrophobicInteraction: { score: number; description: string };
    hydrogenBonding: { score: number; description: string };
  };
}

/** Complete screening result for a single compound */
export interface ScreeningResult {
  compound: CompoundProperties;
  bbb: BBBScreening;
  cyp2e1: CYP2E1Screening;
  /** Model confidence report (helps reduce false positives) */
  confidence?: ScreeningConfidence;
  /** Overall ranking score (0-100) for prioritization */
  rankScore?: number;
}
