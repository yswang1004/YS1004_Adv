import { useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type CalibRow = {
  compound_name: string;
  bbb_metric: number; // %ID in brain
  time_point?: string;
  species?: string;
  route?: string;
  perfusion?: string;
  reference?: string;
};

function parseCSV(text: string): CalibRow[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const iName = idx("compound_name");
  const iMetric = idx("bbb_metric");
  if (iName < 0 || iMetric < 0) return [];

  const opt = {
    time_point: idx("time_point"),
    species: idx("species"),
    route: idx("route"),
    perfusion: idx("perfusion"),
    reference: idx("reference"),
  };

  const rows: CalibRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const name = (cols[iName] ?? "").trim();
    if (!name) continue;
    const raw = (cols[iMetric] ?? "").trim().replace(/%/g, "");
    const metric = Number(raw);
    if (!Number.isFinite(metric)) continue;

    const row: CalibRow = {
      compound_name: name,
      bbb_metric: metric,
    };

    (Object.keys(opt) as (keyof typeof opt)[]).forEach(k => {
      const j = opt[k];
      if (j != null && j >= 0) {
        const v = (cols[j] ?? "").trim();
        if (v) (row as any)[k] = v;
      }
    });

    rows.push(row);
  }
  return rows;
}

export default function Calibration() {
  const [raw, setRaw] = useState<string>(
    "compound_name,bbb_metric,time_point,species,route,perfusion,reference\nDSF,0.3,,,,,\nLimonene,0.07,,,,,"
  );
  const [error, setError] = useState<string>("");
  const [saved, setSaved] = useState<boolean>(false);

  const parsed = useMemo(() => {
    try {
      const rows = parseCSV(raw);
      setError("");
      return rows;
    } catch {
      setError("Failed to parse CSV. Please check formatting.");
      return [];
    }
  }, [raw]);

  const onFile = async (file: File) => {
    const text = await file.text();
    setRaw(text);
    setSaved(false);
  };

  const save = () => {
    if (parsed.length === 0) {
      setError(
        "No valid rows found. CSV must include: compound_name, bbb_metric"
      );
      return;
    }
    localStorage.setItem("bbbCalibration", JSON.stringify(parsed));
    setSaved(true);
    setError("");
  };

  const clear = () => {
    localStorage.removeItem("bbbCalibration");
    setSaved(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Calibration (Literature %ID in brain)
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a small calibration set to reduce false positives. Metric is
            %ID in brain (dose percent found in brain).
          </p>
        </div>

        {error && (
          <Alert className="border-rose-500/40 bg-rose-500/10 text-rose-200">
            {error}
          </Alert>
        )}
        {saved && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
            Saved. Results page will apply calibration automatically.
          </Alert>
        )}

        <Card className="card-glow bg-card border-border">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <Button onClick={save}>Save</Button>
              <Button variant="secondary" onClick={clear}>
                Clear
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">CSV Preview</div>
              <textarea
                className="w-full h-64 rounded-md border border-border bg-background p-3 font-mono text-xs"
                value={raw}
                onChange={e => {
                  setRaw(e.target.value);
                  setSaved(false);
                }}
              />
              <div className="text-xs text-muted-foreground">
                Required columns: <code>compound_name</code>,
                <code>bbb_metric</code>. Optional:
                <code>time_point,species,route,perfusion,reference</code>.
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Parsed rows: <span className="text-foreground">{parsed.length}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
