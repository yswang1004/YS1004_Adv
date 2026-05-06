import { describe, expect, it } from "vitest";
import {
  screenBBB,
  screenCYP2E1,
  screenCYP450Panel,
  parseMeasuredDataCsv,
} from "./screening";
import type { CompoundProperties } from "../shared/types";

function mockCompound(
  overrides: Partial<CompoundProperties> = {}
): CompoundProperties {
  return {
    name: "TestCompound",
    cid: 12345,
    smiles: "CCCC",
    mw: 200,
    logP: 2.5,
    tpsa: 40,
    hbd: 1,
    hba: 2,
    status: "success",
    ...overrides,
  };
}

describe("screenBBB", () => {
  it("returns Very High for compound passing all criteria with good LogPS", () => {
    const compound = mockCompound({
      name: "Fomepizole",
      mw: 82.1,
      logP: 1.4,
      tpsa: 28.7,
      hbd: 1,
      hba: 1,
    });
    const result = screenBBB(compound);
    expect(result.boiledEgg).toBe(true);
    expect(result.admetlab).toBe(true);
    expect(result.admetlabRulesPassed).toBe(5);
    expect(result.bbbPotential).toBe("Very High");
    expect(result.logPS).not.toBeNull();
    expect(result.kpuuBrain).not.toBeNull();
  });

  it("handles null values gracefully", () => {
    const compound = mockCompound({
      mw: null,
      logP: null,
      tpsa: null,
      hbd: null,
      hba: null,
    });
    const result = screenBBB(compound);
    expect(result.boiledEgg).toBe(false);
    expect(result.admetlab).toBe(false);
    expect(result.logPS).toBeNull();
    expect(result.kpuuBrain).toBeNull();
    expect(result.bbbPotential).toBe("Low");
  });

  it("calculates LogPS correctly", () => {
    const compound = mockCompound({ mw: 100, logP: 2.0, tpsa: 20 });
    const result = screenBBB(compound);
    expect(result.logPS).toBeCloseTo(-0.78, 2);
  });
});

describe("screenCYP2E1", () => {
  it("gives high score for small molecule with sulfur", () => {
    const compound = mockCompound({
      name: "Diallyl sulfide",
      smiles: "C=CCSCC=C",
      mw: 114.21,
      logP: 2.2,
      hbd: 0,
      hba: 1,
    });
    const result = screenCYP2E1(compound);
    expect(result.details.molecularVolume.score).toBe(4);
    expect(result.details.hemeLigation.score).toBe(4);
    expect(result.score).toBeGreaterThanOrEqual(8);
  });

  it("detects aromatic rings for pi-pi stacking", () => {
    const compound = mockCompound({
      smiles: "c1ccccc1O",
      mw: 94.11,
      logP: 1.5,
      hbd: 1,
      hba: 1,
    });
    const result = screenCYP2E1(compound);
    expect(result.details.hydrophobicInteraction.score).toBe(3);
    expect(result.features).toContain(
      "Aromatic ring (Phe298/478 π-π stacking)"
    );
  });
});

describe("measured CYP import", () => {
  it("parses measured CSV rows", () => {
    const records = parseMeasuredDataCsv([
      "compound,isoform,value,unit,relation,note",
      "Caffeine,CYP1A2,8.2,uM,=,IC50",
      "Donepezil,CYP2D6,450,nM,<,Ki",
    ].join("\n"));

    expect(records).toHaveLength(2);
    expect(records[0].isoform).toBe("CYP1A2");
    expect(records[1].isoform).toBe("CYP2D6");
  });

  it("prioritizes measured data over prediction for supported isoforms", () => {
    const compound = mockCompound({
      name: "Caffeine",
      smiles: "Cn1cnc2n(C)c(=O)n(C)c(=O)c12",
      mw: 194.19,
      logP: -0.1,
      hbd: 0,
      hba: 6,
    });

    const panel = screenCYP450Panel(compound, [
      {
        compoundName: "Caffeine",
        isoform: "CYP1A2",
        value: 0.8,
        unit: "uM",
        relation: "=",
        note: "Literature IC50",
      },
    ]);

    expect(panel.cyp1a2.source).toBe("measured");
    expect(panel.cyp1a2.measuredValue).toBe(0.8);
    expect(panel.cyp1a2.potential).toBe("Very High");
  });

  it("adds independent CYP3A5 prediction entry", () => {
    const compound = mockCompound({
      name: "Tacrolimus",
      smiles: "COc1ccc(CCN(C)C)cc1OC",
      mw: 403.0,
      logP: 3.2,
      hbd: 2,
      hba: 6,
    });

    const panel = screenCYP450Panel(compound);
    expect(panel.cyp3a5.isoform).toBe("CYP3A5");
    expect(["Very High", "High", "Moderate", "Low"]).toContain(
      panel.cyp3a5.potential
    );
  });
});
