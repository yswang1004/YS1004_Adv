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
  Upload,
} from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const [input, setInput] = useState("");
  const [measuredDataCsv, setMeasuredDataCsv] = useState("");
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

  const handleMeasuredFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setMeasuredDataCsv(text);
      toast.success(`Loaded measured data file: ${file.name}`);
    } catch (err: any) {
      toast.error(`Failed to read file: ${err?.message ?? "Unknown error"}`);
    }
  };

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
      const compoundData = await fetchCompoundsFromPubChem(
        names,
        (completed, total, current) => {
          setProgress({ completed, total, current });
        }
      );

      setProgress({
        completed: names.length,
        total: names.length,
        current: "Running screening models...",
      });
      screenWithDataMutation.mutate({ compounds: compoundData, measuredDataCsv });
    } catch (err: any) {
      toast.error(
        "Failed to fetch compound data: " + (err?.message ?? "Unknown error")
      );
      setIsScreening(false);
    }
  }, [input, measuredDataCsv, screenWithDataMutation]);

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

  const measuredDataExample = [
    "compound,isoform,value,unit,relation,note",
    "Caffeine,CYP1A2,8.2,uM,=,Literature IC50",
    "Donepezil,CYP2D6,0.45,uM,=,Literature Ki",
    "Diazepam,CYP3A4,12.4,uM,=,Literature IC50",
    "Tacrolimus,CYP3A5,4.8,uM,=,Literature IC50",
  ].join("\n");

  const loadExample = () => {
    setInput(exampleCompounds.join("\n"));
  };

  const loadMeasuredExample = () => {
    setMeasuredDataCsv(measuredDataExample);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

        <div className="container relative pt-20 pb-12">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Major CYP450 Family Screening
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent leading-tight">
              BBB Permeability &amp;
              <br />
              Major CYP450 Inhibition Screener
            </h1>

            <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mx-auto">
              Evaluate compound candidates for blood-brain barrier penetration
              potential and inhibition across major CYP450 family enzymes
              (CYP1A2, 2C9, 2C19, 2D6, 2E1, 3A4, 3A5) using integrated
              computational models and measured-value-first interpretation when
              IC50/Ki data are provided.
            </p>
          </div>
        </div>
      </section>

      <section className="container pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <FeatureCard
            icon={<Brain className="w-5 h-5" />}
            title="BBB Penetration"
            description="BOILED-Egg model, ADMETlab 3.0 rules, LogPS & Kp,uu,brain estimation"
          />
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5" />}
            title="Major CYP450 Panel"
            description="Screen CYP1A2, 2C9, 2C19, 2D6, 2E1, 3A4, and 3A5 inhibition potential together"
          />
          <FeatureCard
            icon={<FlaskConical className="w-5 h-5" />}
            title="Measured Data Priority"
            description="Optional CSV import lets CYP1A2, CYP2D6, CYP3A4, and CYP3A5 show measured IC50/Ki before prediction"
          />
        </div>
      </section>

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

            <div className="mt-6 border-t border-border pt-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Optional measured CYP data import
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    CSV/TSV columns: <code>compound, isoform, value</code>.
                    Optional columns: <code>unit, relation, note</code>.
                    Supported measured-priority isoforms: CYP1A2, CYP2D6,
                    CYP3A4, CYP3A5.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt"
                      className="hidden"
                      onChange={handleMeasuredFileUpload}
                      disabled={isPending}
                    />
                    <span className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-input bg-background text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors">
                      <Upload className="w-4 h-4" />
                      Upload CSV
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMeasuredExample}
                    disabled={isPending}
                  >
                    Load measured example
                  </Button>
                </div>
              </div>

              <textarea
                value={measuredDataCsv}
                onChange={e => setMeasuredDataCsv(e.target.value)}
                placeholder={measuredDataExample}
                className="w-full h-40 p-4 rounded-lg bg-input/50 border border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                disabled={isPending}
              />
            </div>

            {isPending && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  <div className="flex-1">
                    <div className="text-sm text-primary">
                      {progress.completed < progress.total
                        ? `Fetching from PubChem: ${progress.current} (${progress.completed}/${progress.total})`
                        : "Running BBB & major CYP450 screening models..."}
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

      <footer className="border-t border-border/50 py-6">
        <div className="container text-center text-xs text-muted-foreground">
          Powered by PubChem API, SwissADME BOILED-Egg Model, ADMETlab 3.0
          Rules, and measured IC50/Ki data import
        </div>
      </footer>
    </div>
  );
}

function parseCompoundNames(input: string): string[] {
  const names = input
    .split(/[\n,;]/)
    .map(s => s.trim())
    .filter(Boolean);
  return Array.from(new Set(names));
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
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 card-glow">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
