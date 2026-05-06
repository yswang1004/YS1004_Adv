import { describe, expect, it } from "vitest";
import { screenBBB, screenCYP2E1 } from "./screening";
import type { CompoundProperties } from "../shared/types";

// Helper to create a mock compound
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
    // Fomepizole-like: small, moderate LogP, low TPSA
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

  it("BOILED-Egg fails when TPSA >= 79", () => {
    const compound = mockCompound({ tpsa: 80 });
    const result = screenBBB(compound);
    expect(result.boiledEgg).toBe(false);
  });

  it("BOILED-Egg fails when LogP <= 0.4", () => {
    const compound = mockCompound({ logP: 0.3 });
    const result = screenBBB(compound);
    expect(result.boiledEgg).toBe(false);
  });

  it("BOILED-Egg fails when LogP >= 6.0", () => {
    const compound = mockCompound({ logP: 6.5 });
    const result = screenBBB(compound);
    expect(result.boiledEgg).toBe(false);
  });

  it("ADMETlab fails when MW >= 450", () => {
    const compound = mockCompound({ mw: 500 });
    const result = screenBBB(compound);
    expect(result.admetlab).toBe(false);
  });

  it("ADMETlab fails when LogP >= 5", () => {
    const compound = mockCompound({ logP: 5.5 });
    const result = screenBBB(compound);
    expect(result.admetlab).toBe(false);
  });

  it("ADMETlab fails when TPSA >= 90", () => {
    const compound = mockCompound({ tpsa: 95 });
    const result = screenBBB(compound);
    expect(result.admetlab).toBe(false);
  });

  it("ADMETlab fails when HBD >= 3", () => {
    const compound = mockCompound({ hbd: 4 });
    const result = screenBBB(compound);
    expect(result.admetlab).toBe(false);
  });

  it("ADMETlab fails when HBA >= 7", () => {
    const compound = mockCompound({ hba: 8 });
    const result = screenBBB(compound);
    expect(result.admetlab).toBe(false);
  });

  it("returns Low for compound failing most criteria", () => {
    const compound = mockCompound({
      mw: 600,
      logP: 0.1,
      tpsa: 150,
      hbd: 5,
      hba: 10,
    });
    const result = screenBBB(compound);
    expect(result.bbbPotential).toBe("Low");
    expect(result.boiledEgg).toBe(false);
    expect(result.admetlab).toBe(false);
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
    // LogPS = -1.0 - 0.012 * TPSA + 0.26 * LogP - 0.0006 * MW
    const compound = mockCompound({ mw: 100, logP: 2.0, tpsa: 20 });
    const result = screenBBB(compound);
    // -1.0 - 0.012*20 + 0.26*2.0 - 0.0006*100 = -1.0 - 0.24 + 0.52 - 0.06 = -0.78
    expect(result.logPS).toBeCloseTo(-0.78, 2);
  });
});

describe("screenCYP2E1", () => {
  it("gives high score for small molecule with sulfur", () => {
    // Diallyl sulfide-like
    const compound = mockCompound({
      name: "Diallyl sulfide",
      smiles: "C=CCSCC=C",
      mw: 114.21,
      logP: 2.2,
      hbd: 0,
      hba: 1,
    });
    const result = screenCYP2E1(compound);
    expect(result.details.molecularVolume.score).toBe(4); // MW < 150
    expect(result.details.hemeLigation.score).toBe(4); // Has S
    expect(result.score).toBeGreaterThanOrEqual(8);
  });

  it("gives high score for N-heterocycle compound (aromatic SMILES)", () => {
    // Fomepizole-like (4-methylpyrazole) - aromatic notation
    const compound = mockCompound({
      name: "Fomepizole",
      smiles: "Cc1cc[nH]n1",
      mw: 82.1,
      logP: 1.4,
      hbd: 1,
      hba: 1,
    });
    const result = screenCYP2E1(compound);
    expect(result.details.hemeLigation.score).toBe(4); // N-heterocycle
    expect(result.details.molecularVolume.score).toBe(4); // MW < 150
  });

  it("gives high score for N-heterocycle compound (Kekulized SMILES from PubChem)", () => {
    // Fomepizole - PubChem Kekulized notation
    const compound = mockCompound({
      name: "Fomepizole",
      smiles: "CC1=CNN=C1",
      mw: 82.1,
      logP: 1.4,
      hbd: 1,
      hba: 1,
    });
    const result = screenCYP2E1(compound);
    expect(result.details.hemeLigation.score).toBe(4); // N-heterocycle in Kekulized form
    expect(result.details.molecularVolume.score).toBe(4); // MW < 150
  });

  it("gives low score for large molecule without key features", () => {
    const compound = mockCompound({
      mw: 500,
      logP: 5.5,
      smiles: "CCCCCCCCCCCCCCCC",
      hbd: 0,
      hba: 0,
    });
    const result = screenCYP2E1(compound);
    expect(result.details.molecularVolume.score).toBe(0); // MW >= 450
    expect(result.details.hemeLigation.score).toBe(0); // No S or N-het
    expect(result.potential).toBe("Low");
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
    expect(result.details.hydrophobicInteraction.score).toBe(3); // Aromatic + optimal LogP
    expect(result.features).toContain(
      "Aromatic ring (Phe298/478 π-π stacking)"
    );
  });

  it("handles empty SMILES gracefully", () => {
    const compound = mockCompound({ smiles: null });
    const result = screenCYP2E1(compound);
    expect(result.details.hemeLigation.score).toBe(0);
    expect(result.details.hydrophobicInteraction.score).toBeLessThanOrEqual(2);
  });

  it("potential levels are correct strings", () => {
    const compound = mockCompound();
    const result = screenCYP2E1(compound);
    expect(["Very High", "High", "Moderate", "Low"]).toContain(
      result.potential
    );
  });
});
