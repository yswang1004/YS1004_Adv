export type * from "../drizzle/schema";
export * from "./_core/errors";

/** Potential level for BBB and CYP inhibition screening */
export type PotentialLevel = "Very High" | "High" | "Moderate" | "Low";

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
  boiledEgg: boolean;
  admetlab: boolean;
  admetlabRulesPassed: number;
  logPS: number | null;
  kpuuBrain: number | null;
  bbbPotential: PotentialLevel;
}

/** CYP inhibition result for a single isoform */
export interface CYPInhibitionScreening {
  isoform: "CYP1A2" | "CYP2C9" | "CYP2C19" | "CYP2D6" | "CYP2E1" | "CYP3A4";
  score: number;
  potential: PotentialLevel;
  features: string[];
  summary: string;
  source: "predicted" | "measured";
  measuredValue?: number | null;
  measuredUnit?: string | null;
  measuredRelation?: string | null;
  details?: Record<string, { score: number; description: string }>;
}

/** CYP2E1 inhibition screening result */
export interface CYP2E1Screening extends CYPInhibitionScreening {
  isoform: "CYP2E1";
  details: {
    molecularVolume: { score: number; description: string };
    hemeLigation: { score: number; description: string };
    hydrophobicInteraction: { score: number; description: string };
    hydrogenBonding: { score: number; description: string };
  };
}

/** Multi-isoform CYP450 panel */
export interface CYP450Panel {
  cyp1a2: CYPInhibitionScreening;
  cyp2c9: CYPInhibitionScreening;
  cyp2c19: CYPInhibitionScreening;
  cyp2d6: CYPInhibitionScreening;
  cyp2e1: CYP2E1Screening;
  cyp3a4: CYPInhibitionScreening;
  majorFamilyScore: number;
  overallPotential: PotentialLevel;
  topIsoforms: string[];
}

/** Complete screening result for a single compound */
export interface ScreeningResult {
  compound: CompoundProperties;
  bbb: BBBScreening;
  cyp2e1: CYP2E1Screening;
  cyp450: CYP450Panel;
}
