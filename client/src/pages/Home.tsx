import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { fetchCompoundsFromPubChem } from "@/lib/pubchem";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FlaskConical,
  Brain,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const [input, setInput] = useState("");
  const [, navigate] = useLocation();
  const [isScreening, setIsScreening] = useState(false);
  const [progress, setProgress] = useState({
    completed: 0,
    total: 0,
    current: "",
  });

  const screenWithDataMutation = trpc.screening.screenWithData.useMutation({
    onSuccess: data => {
      sessionStorage.setItem("screeningResults", JSON.stringify(data));
      navigate("/results");
    },
    onError: err => {
      toast.error("Screening calculation failed: " + err.message);
      setIsScreening(false);
    },
  });

  const handleSubmit = useCallback(async () => {
    const names = parseCompoundNames(input);

    if (names.length === 0) {
      toast.error("Please enter at least one compound name.");
      return;
    }
    if (names.length > 100) {
      toast.error("Maximum 100 compounds per batch.");
      return;
    }

    setIsScreening(true);
    setProgress({ completed: 0, total: names.length, current: names[0] });

    try {
      // Step 1: Fetch compound data from PubChem (browser-side, CORS-enabled)
      const compoundData = await fetchCompoundsFromPubChem(
        names,
        (completed, total, current) => {
          setProgress({ completed, total, current });
        }
      );

      // Step 2: Send fetched data to backend for BBB + CYP2E1 screening
      setProgress({
        completed: names.length,
        total: names.length,
        current: "Running screening models...",
      });
      screenWithDataMutation.mutate({ compounds: compoundData });
    } catch (err: any) {
      toast.error(
        "Failed to fetch compound data: " + (err?.message ?? "Unknown error")
      );
      setIsScreening(false);
    }
  }, [input, screenWithDataMutation]);

  const isPending = isScreening || screenWithDataMutation.isPending;

  const exampleCompounds = [
    "Disulfiram",
    "Fomepizole",
    "Diallyl sulfide",
    "Limonene",
    "Menthol",
    "Donepezil",
    "Diazepam",
    "Resveratrol",
    "Curcumin",
    "Caffeine",
  ];

  const loadExample = () => {
    setInput(exampleCompounds.join("\n"));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

        <div className="container relative pt-20 pb-12">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Computational Drug Screening
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent leading-tight">
              BBB Permeability &amp;
              <br />
              CYP2E1 Inhibition Screener
            </h1>

            <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mx-auto">
              Evaluate compound candidates for blood-brain barrier penetration
              potential and CYP2E1 inhibitory activity using integrated
              computational models from SwissADME, ADMETlab 3.0, and
              pharmacophore-based scoring.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="container pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <FeatureCard
            icon={<Brain className="w-5 h-5" />}
            title="BBB Penetration"
            description="BOILED-Egg model, ADMETlab 3.0 rules, LogPS & Kp,uu,brain estimation"
          />
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5" />}
            title="CYP2E1 Inhibition"
            description="Pharmacophore matching: heme ligation, π-π stacking, H-bond analysis"
          />
          <FeatureCard
            icon={<FlaskConical className="w-5 h-5" />}
            title="PubChem Integration"
            description="Auto-fetch SMILES, MW, LogP, TPSA, HBD, HBA from PubChem database"
          />
        </div>
      </section>

      {/* Input Section */}
      <section className="container pb-20 flex-1">
        <Card className="max-w-4xl mx-auto card-glow bg-card border-border">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Enter Compound Names
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  One compound per line. Up to 100 compounds per batch.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadExample}
                className="text-xs"
              >
                Load Example
              </Button>
            </div>

            <div className="relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Disulfiram\nFomepizole\nDiallyl sulfide\nLimonene\n...`}
                className="w-full h-64 p-4 rounded-lg bg-input/50 border border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                disabled={isPending}
              />
              {input.trim() && (
                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded">
                  {input.split("\n").filter(n => n.trim()).length} compound
                  {input.split("\n").filter(n => n.trim()).length !== 1
                    ? "s"
                    : ""}
                </div>
              )}
            </div>

            {isPending && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  <div className="flex-1">
                    <div className="text-sm text-primary">
                      {progress.completed < progress.total
                        ? `Fetching from PubChem: ${progress.current} (${progress.completed}/${progress.total})`
                        : "Running BBB & CYP2E1 screening models..."}
                    </div>
                    {progress.total > 0 && (
                      <div className="mt-2 w-full bg-primary/10 rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {screenWithDataMutation.isError && (
              <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <div className="text-sm text-destructive">
                  {screenWithDataMutation.error.message}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={isPending || !input.trim()}
                size="lg"
                className="gap-2 px-8"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Screening...
                  </>
                ) : (
                  <>
                    Run Screening
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6">
        <div className="container text-center text-xs text-muted-foreground">
          Powered by PubChem API, SwissADME BOILED-Egg Model &amp; ADMETlab 3.0
          Rules
        </div>
      </footer>
    </div>
  );
}

function parseCompoundNames(raw: string): string[] {
  const lines = raw.split("\n");
  const names: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // CSV/TSV compatible: take first column if delimiters are present
    const firstCell = trimmed.split(/\t|,|;/)[0]?.trim() ?? "";
    const cleaned = firstCell.replace(/^"|"$/g, "").trim();
    if (!cleaned) continue;

    // Skip common headers
    if (
      ["name", "compound", "compound_name", "compound name"].includes(
        cleaned.toLowerCase()
      )
    ) {
      continue;
    }

    names.push(cleaned);
  }

  return names;
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="bg-card/50 border-border/50 hover:border-border transition-colors">
      <CardContent className="p-5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
