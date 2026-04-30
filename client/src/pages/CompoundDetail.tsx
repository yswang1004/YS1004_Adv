import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Navbar } from "@/components/Navbar";
import { LevelBadge } from "@/components/LevelBadge";
import { trpc } from "@/lib/trpc";
import { ensure3DMolLoaded } from "@/lib/3dmol";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Atom,
  Brain,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import type { ScreeningResult } from "../../../shared/types";

export default function CompoundDetail() {
  const params = useParams<{ index: string }>();
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const stored = sessionStorage.getItem("screeningResults");
    if (stored) {
      try {
        const results: ScreeningResult[] = JSON.parse(stored);
        const idx = parseInt(params.index ?? "0", 10);
        if (idx >= 0 && idx < results.length) {
          setResult(results[idx]);
        } else {
          navigate("/results");
        }
      } catch {
        navigate("/");
      }
    } else {
      navigate("/");
    }
  }, [params.index, navigate]);

  const compoundMaybe = result?.compound ?? null;
  const compoundName = compoundMaybe?.name ?? "";
  const compoundCid = compoundMaybe?.cid ?? null;

  // NOTE: Hooks must always be called unconditionally.
  // We keep queries here and control execution with `enabled`.
  const pubchemQuery = trpc.literature.pubchemDescription.useQuery(
    { cid: compoundCid ?? 0, name: compoundName },
    { enabled: Boolean(compoundCid) }
  );

  const pubmedQuery = trpc.literature.pubmedRecent.useQuery(
    { term: compoundName || " ", years: 5, limit: 20 },
    { enabled: Boolean(compoundName) }
  );

  const rxnormQuery = trpc.literature.rxnormProducts.useQuery(
    { name: compoundName || " ", limit: 15 },
    { enabled: Boolean(compoundName) }
  );

  const ctQuery = trpc.literature.clinicalTrials.useQuery(
    { term: compoundName || " ", limit: 10 },
    { enabled: Boolean(compoundName) }
  );

  const sdfQuery = trpc.literature.pubchem3dSdf.useQuery(
    { cid: compoundCid ?? 0 },
    { enabled: Boolean(compoundCid) }
  );

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [show3d, setShow3d] = useState(false);

  const has3d = useMemo(() => {
    const sdf = sdfQuery.data?.sdf;
    return Boolean(sdf && sdf.includes("V2000"));
  }, [sdfQuery.data?.sdf]);

  useEffect(() => {
    if (!show3d) return;
    if (!has3d) return;
    if (!viewerRef.current) return;

    const sdf = sdfQuery.data?.sdf;
    if (!sdf) return;

    let viewer: any;

    (async () => {
      const $3Dmol = await ensure3DMolLoaded();
      viewerRef.current!.innerHTML = "";
      viewer = $3Dmol.createViewer(viewerRef.current, {
        backgroundColor: "white",
      });
      viewer.addModel(sdf, "sdf");
      viewer.setStyle({}, { stick: {}, sphere: { scale: 0.25 } });
      viewer.zoomTo();
      viewer.render();
    })().catch(() => {
      // ignore
    });

    return () => {
      try {
        viewer?.clear();
      } catch {
        // ignore
      }
    };
  }, [show3d, has3d, sdfQuery.data?.sdf]);

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="container py-8 flex-1 max-w-5xl">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  const { compound, bbb, cyp2e1 } = result;

  const copySmiles = () => {
    if (compound.smiles) {
      navigator.clipboard.writeText(compound.smiles);
      toast.success("SMILES copied to clipboard");
    }
  };

  const admetRules = [
    {
      name: "MW < 450",
      pass: compound.mw != null && Number(compound.mw) < 450,
      value: compound.mw != null ? Number(compound.mw).toFixed(1) : undefined,
    },
    {
      name: "LogP < 5",
      pass: compound.logP != null && Number(compound.logP) < 5,
      value:
        compound.logP != null ? Number(compound.logP).toFixed(1) : undefined,
    },
    {
      name: "TPSA < 90",
      pass: compound.tpsa != null && Number(compound.tpsa) < 90,
      value:
        compound.tpsa != null ? Number(compound.tpsa).toFixed(1) : undefined,
    },
    {
      name: "HBD < 3",
      pass: compound.hbd != null && Number(compound.hbd) < 3,
      value: compound.hbd != null ? String(compound.hbd) : undefined,
    },
    {
      name: "HBA < 7",
      pass: compound.hba != null && Number(compound.hba) < 7,
      value: compound.hba != null ? String(compound.hba) : undefined,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="container py-8 flex-1 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/results")}
            className="gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Results
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {compound.name}
            </h1>
            {compound.cid && (
              <p className="text-xs text-muted-foreground mt-0.5">
                PubChem CID: {compound.cid}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Compound Info */}
          <div className="space-y-6">
            {/* SMILES */}
            <Card className="card-glow bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Atom className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Structure
                  </h3>
                </div>
                {compound.smiles ? (
                  <div className="relative group">
                    <code className="block p-3 rounded-md bg-muted/50 text-xs font-mono text-foreground break-all leading-relaxed">
                      {compound.smiles}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={copySmiles}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    SMILES not available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 3D Preview */}
            {compound.cid && (
              <Card className="card-glow bg-card border-border">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      3D Structure Preview
                    </h3>
                    <div className="flex items-center gap-2">
                      {has3d && (
                        <Button
                          size="sm"
                          variant={show3d ? "default" : "outline"}
                          onClick={() => setShow3d(v => !v)}
                        >
                          {show3d ? "Hide" : "Show"}
                        </Button>
                      )}
                      <a
                        className="text-xs text-primary hover:underline"
                        href={
                          compound.cid
                            ? `https://pubchem.ncbi.nlm.nih.gov/compound/${compound.cid}#section=3D-Conformer`
                            : "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open PubChem 3D
                      </a>
                    </div>
                  </div>

                  {sdfQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading 3D conformer…
                    </p>
                  ) : has3d ? (
                    show3d ? (
                      <div
                        ref={viewerRef}
                        className="w-full h-72 rounded-md bg-white"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        3D conformer available. Click “Show” to preview.
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No 3D conformer found on PubChem for this compound.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Properties */}
            <Card className="card-glow bg-card border-border">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Physicochemical Properties
                </h3>
                <div className="space-y-2.5">
                  <PropRow
                    label="Molecular Weight"
                    value={
                      compound.mw != null
                        ? Number(compound.mw).toFixed(2)
                        : undefined
                    }
                    unit="g/mol"
                  />
                  <PropRow
                    label="LogP"
                    value={
                      compound.logP != null
                        ? Number(compound.logP).toFixed(2)
                        : undefined
                    }
                  />
                  <PropRow
                    label="TPSA"
                    value={
                      compound.tpsa != null
                        ? Number(compound.tpsa).toFixed(2)
                        : undefined
                    }
                    unit="A²"
                  />
                  <PropRow
                    label="H-Bond Donors"
                    value={String(compound.hbd ?? "—")}
                  />
                  <PropRow
                    label="H-Bond Acceptors"
                    value={String(compound.hba ?? "—")}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Overview (PubChem) */}
            {compound.cid && (
              <Card className="card-glow bg-card border-border">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Overview (PubChem)
                    </h3>
                    <a
                      className="text-xs text-primary hover:underline"
                      href={
                        pubchemQuery.data?.pubchemUrl ??
                        `https://pubchem.ncbi.nlm.nih.gov/compound/${compound.cid}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open PubChem
                    </a>
                  </div>

                  {pubchemQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading description…
                    </p>
                  ) : pubchemQuery.data?.description ? (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {pubchemQuery.data.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No description found.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent literature (PubMed) */}
            <Card className="card-glow bg-card border-border">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Recent papers (last 5 years)
                  </h3>
                  <a
                    className="text-xs text-primary hover:underline"
                    href={
                      pubmedQuery.data?.pubmedSearchUrl ??
                      `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(compound.name)}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open PubMed
                  </a>
                </div>

                {pubmedQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Searching PubMed…
                  </p>
                ) : pubmedQuery.data?.articles?.length ? (
                  <ul className="space-y-2">
                    {pubmedQuery.data.articles.slice(0, 10).map(a => (
                      <li key={a.pmid} className="text-sm">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground hover:underline"
                        >
                          {a.title || `PMID ${a.pmid}`}
                        </a>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[a.journal, a.pubDate].filter(Boolean).join(" • ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recent papers found.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Marketed drug products (RxNorm) */}
            <Card className="card-glow bg-card border-border">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Marketed drug products (RxNorm)
                  </h3>
                  <a
                    className="text-xs text-primary hover:underline"
                    href={
                      rxnormQuery.data?.rxnavSearchUrl ??
                      `https://mor.nlm.nih.gov/RxNav/search?searchBy=STRING&searchTerm=${encodeURIComponent(compound.name)}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open RxNav
                  </a>
                </div>

                {rxnormQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : rxnormQuery.data?.products?.length ? (
                  <ul className="space-y-1.5">
                    {rxnormQuery.data.products.slice(0, 10).map(p => (
                      <li key={p.rxcui} className="text-sm">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground hover:underline"
                        >
                          {p.name}
                        </a>
                        {p.tty && (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            ({p.tty})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No RxNorm products found for this name.
                  </p>
                )}

                <p className="text-xs text-muted-foreground/70">
                  Note: RxNorm coverage is strongest for US drug vocabularies.
                </p>
              </CardContent>
            </Card>

            {/* Clinical trials (ClinicalTrials.gov) */}
            <Card className="card-glow bg-card border-border">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Clinical trials (ClinicalTrials.gov)
                  </h3>
                  <a
                    className="text-xs text-primary hover:underline"
                    href={
                      ctQuery.data?.ctgovSearchUrl ??
                      `https://clinicaltrials.gov/search?query=${encodeURIComponent(compound.name)}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ClinicalTrials.gov
                  </a>
                </div>

                {ctQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : ctQuery.data?.trials?.length ? (
                  <ul className="space-y-2">
                    {ctQuery.data.trials.slice(0, 8).map(t => (
                      <li key={t.nctId} className="text-sm">
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground hover:underline"
                        >
                          {t.title}
                        </a>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[t.nctId, t.status, t.startDate]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No trials found.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Middle: BBB Screening */}
          <Card className="card-glow bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    BBB Penetration
                  </h3>
                </div>
                <LevelBadge level={bbb.bbbPotential} />
              </div>

              {/* BOILED-Egg */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">
                    SwissADME BOILED-Egg
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      bbb.boiledEgg
                        ? "text-[oklch(0.8_0.18_155)]"
                        : "text-[oklch(0.72_0.15_25)]"
                    }`}
                  >
                    {bbb.boiledEgg ? "Pass" : "Fail"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground/70 mb-2">
                  TPSA &lt; 79 &amp;&amp; 0.4 &lt; LogP &lt; 6.0
                </div>
              </div>

              {/* ADMETlab Rules */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    ADMETlab 3.0 Rules
                  </span>
                  <span className="text-xs font-mono font-semibold text-foreground">
                    {bbb.admetlabRulesPassed}/5
                  </span>
                </div>
                <div className="space-y-1.5">
                  {admetRules.map(rule => (
                    <div
                      key={rule.name}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        {rule.pass ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.8_0.18_155)]" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-[oklch(0.72_0.15_25)]" />
                        )}
                        <span className="text-muted-foreground">
                          {rule.name}
                        </span>
                      </div>
                      <span className="font-mono text-foreground/70">
                        {rule.value ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* LogPS & Kp,uu */}
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      LogPS (est.)
                    </span>
                    <span className="text-xs font-mono font-semibold text-foreground">
                      {bbb.logPS != null ? Number(bbb.logPS).toFixed(3) : "—"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">
                    Permeability-Surface Area Product
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      Kp,uu,brain (est.)
                    </span>
                    <span className="text-xs font-mono font-semibold text-foreground">
                      {bbb.kpuuBrain != null
                        ? Number(bbb.kpuuBrain) < 0.001
                          ? Number(bbb.kpuuBrain).toExponential(3)
                          : Number(bbb.kpuuBrain).toFixed(4)
                        : "—"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">
                    Unbound Brain-to-Plasma Ratio
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right: CYP2E1 Screening */}
          <Card className="card-glow bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    CYP2E1 Inhibition
                  </h3>
                </div>
                <LevelBadge level={cyp2e1.potential} />
              </div>

              {/* Total Score */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    Total Score
                  </span>
                  <span className="text-sm font-mono font-bold text-foreground">
                    {cyp2e1.score}/14
                  </span>
                </div>
                <Progress value={(cyp2e1.score / 14) * 100} className="h-2" />
              </div>

              {/* Feature Breakdown */}
              <div className="space-y-4">
                <ScoreSection
                  title="Molecular Volume"
                  score={cyp2e1.details.molecularVolume.score}
                  maxScore={4}
                  description={cyp2e1.details.molecularVolume.description}
                />
                <ScoreSection
                  title="Heme Ligation"
                  score={cyp2e1.details.hemeLigation.score}
                  maxScore={5}
                  description={cyp2e1.details.hemeLigation.description}
                />
                <ScoreSection
                  title="Hydrophobic Interaction"
                  score={cyp2e1.details.hydrophobicInteraction.score}
                  maxScore={3}
                  description={
                    cyp2e1.details.hydrophobicInteraction.description
                  }
                />
                <ScoreSection
                  title="H-Bond (Thr303)"
                  score={cyp2e1.details.hydrogenBonding.score}
                  maxScore={2}
                  description={cyp2e1.details.hydrogenBonding.description}
                />
              </div>

              {/* Features List */}
              {cyp2e1.features.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border/50">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    Key Structural Features
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {cyp2e1.features.map((f, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary border border-primary/20"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PropRow({
  label,
  value,
  unit,
}: {
  label: string;
  value?: string | null;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono text-foreground">
        {value ?? "—"}
        {unit && value && (
          <span className="text-muted-foreground/60 ml-1">{unit}</span>
        )}
      </span>
    </div>
  );
}

function ScoreSection({
  title,
  score,
  maxScore,
  description,
}: {
  title: string;
  score: number;
  maxScore: number;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="text-xs font-mono text-muted-foreground">
          {score}/{maxScore}
        </span>
      </div>
      <Progress value={(score / maxScore) * 100} className="h-1.5 mb-1" />
      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
