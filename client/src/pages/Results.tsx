import { useState, useMemo, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/Navbar";
import { LevelBadge } from "@/components/LevelBadge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { RadarCompare } from "@/components/RadarCompare";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  ArrowLeft,
  Search,
  Eye,
  BarChart3,
  X,
} from "lucide-react";
import type { ScreeningResult } from "../../../shared/types";

type SortField =
  | "rankScore"
  | "confidence"
  | "name"
  | "mw"
  | "logP"
  | "tpsa"
  | "hbd"
  | "hba"
  | "logPS"
  | "kpuuBrain"
  | "bbbPotential"
  | "cyp2e1Score"
  | "cyp2e1Potential"
  | "admetlabRules"
  | "boiledEgg";

type SortDirection = "asc" | "desc";

const potentialOrder = { "Very High": 4, High: 3, Moderate: 2, Low: 1 };

export default function Results() {
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [calibration] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("bbbCalibration") ?? "[]");
    } catch {
      return [];
    }
  });
  const [sortField, setSortField] = useState<SortField>("rankScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [filter, setFilter] = useState("");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const stored = sessionStorage.getItem("screeningResults");
    if (stored) {
      try {
        setResults(JSON.parse(stored));
      } catch {
        navigate("/");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    // Apply literature calibration (if provided)
    const calibMap = new Map<string, any>();
    for (const row of calibration ?? []) {
      const key = String(row.compound_name ?? "").trim().toLowerCase();
      if (key) calibMap.set(key, row);
    }

    let data: any[] = results.map(r => {
      const key = r.compound.name.toLowerCase();
      const lit = calibMap.get(key);
      let litPct: number | null = null;
      let adjRank = r.rankScore ?? null;
      let note = "";

      if (lit && typeof lit.bbb_metric === "number") {
        litPct = lit.bbb_metric;
        // 3-bin label for %ID in brain
        const label = litPct < 0.1 ? "Low" : litPct <= 0.3 ? "Medium" : "High";
        const pred = r.bbb.bbbPotential;

        // Penalize clear overestimation to reduce false positives
        if ((pred === "Very High" || pred === "High") && label === "Low") {
          adjRank = (adjRank ?? 0) - 20;
          note = "Overestimated vs literature";
        } else if (pred === "Very High" && label === "Medium") {
          adjRank = (adjRank ?? 0) - 10;
          note = "Slight overestimation";
        } else if (pred === "Low" && label === "High") {
          adjRank = (adjRank ?? 0) + 10;
          note = "Underestimated vs literature";
        }
      }

      // Extra penalty when confidence is low (generic false-positive control)
      if (r.confidence?.overall?.score != null && adjRank != null) {
        const conf = r.confidence.overall.score / 100;
        adjRank = Math.round(adjRank - 15 * (1 - conf));
      }

      if (adjRank != null) {
        adjRank = Math.max(0, Math.min(100, adjRank));
      }

      return { ...r, _litPct: litPct, _adjRank: adjRank, _calibNote: note };
    });
    if (filter.trim()) {
      const q = filter.toLowerCase();
      data = data.filter(r => r.compound.name.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "rankScore":
          valA = a._adjRank ?? a.rankScore ?? -Infinity;
          valB = b._adjRank ?? b.rankScore ?? -Infinity;
          break;
        case "confidence":
          valA = a.confidence?.overall.score ?? -Infinity;
          valB = b.confidence?.overall.score ?? -Infinity;
          break;
        case "name":
          valA = a.compound.name.toLowerCase();
          valB = b.compound.name.toLowerCase();
          break;
        case "mw":
          valA = a.compound.mw ?? -Infinity;
          valB = b.compound.mw ?? -Infinity;
          break;
        case "logP":
          valA = a.compound.logP ?? -Infinity;
          valB = b.compound.logP ?? -Infinity;
          break;
        case "tpsa":
          valA = a.compound.tpsa ?? -Infinity;
          valB = b.compound.tpsa ?? -Infinity;
          break;
        case "hbd":
          valA = a.compound.hbd ?? -Infinity;
          valB = b.compound.hbd ?? -Infinity;
          break;
        case "hba":
          valA = a.compound.hba ?? -Infinity;
          valB = b.compound.hba ?? -Infinity;
          break;
        case "logPS":
          valA = a.bbb.logPS ?? -Infinity;
          valB = b.bbb.logPS ?? -Infinity;
          break;
        case "kpuuBrain":
          valA = a.bbb.kpuuBrain ?? -Infinity;
          valB = b.bbb.kpuuBrain ?? -Infinity;
          break;
        case "bbbPotential":
          valA = potentialOrder[a.bbb.bbbPotential];
          valB = potentialOrder[b.bbb.bbbPotential];
          break;
        case "cyp2e1Score":
          valA = a.cyp2e1.score;
          valB = b.cyp2e1.score;
          break;
        case "cyp2e1Potential":
          valA = potentialOrder[a.cyp2e1.potential];
          valB = potentialOrder[b.cyp2e1.potential];
          break;
        case "admetlabRules":
          valA = a.bbb.admetlabRulesPassed;
          valB = b.bbb.admetlabRulesPassed;
          break;
        case "boiledEgg":
          valA = a.bbb.boiledEgg ? 1 : 0;
          valB = b.bbb.boiledEgg ? 1 : 0;
          break;
        default:
          return 0;
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [results, sortField, sortDir, filter]);

  // Toggle selection
  const toggleSelect = (name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (next.size >= 10) return prev; // max 10
        next.add(name);
      }
      return next;
    });
  };

  // Select all visible
  const toggleSelectAll = () => {
    const successItems = filteredAndSorted.filter(
      r => r.compound.status === "success"
    );
    const allSelected = successItems.every(r =>
      selectedNames.has(r.compound.name)
    );
    if (allSelected) {
      setSelectedNames(new Set());
    } else {
      const names = successItems.slice(0, 10).map(r => r.compound.name);
      setSelectedNames(new Set(names));
    }
  };

  // Get selected results
  const selectedResults = useMemo(
    () =>
      results.filter(
        r =>
          selectedNames.has(r.compound.name) && r.compound.status === "success"
      ),
    [results, selectedNames]
  );

  const exportCSV = () => {
    const headers = [
      "RankScore",
      "AdjustedRankScore",
      "Literature_%ID_in_brain",
      "CalibrationNote",
      "ConfidenceLevel",
      "ConfidenceScore",
      "ConfidenceFlags",
      "Compound",
      "SMILES",
      "MW",
      "LogP",
      "TPSA",
      "HBD",
      "HBA",
      "BOILED-Egg",
      "ADMETlab Rules (of 5)",
      "LogPS",
      "Kp,uu,brain",
      "BBB Potential",
      "CYP2E1 Score",
      "CYP2E1 Potential",
      "CYP2E1 Features",
    ];
    const rows = filteredAndSorted.map(r => [
      r.rankScore ?? "",
      (r as any)._adjRank ?? "",
      (r as any)._litPct ?? "",
      (r as any)._calibNote ?? "",
      r.confidence?.overall.level ?? "",
      r.confidence?.overall.score ?? "",
      r.confidence?.flags.join("; ") ?? "",
      r.compound.name,
      r.compound.smiles ?? "",
      r.compound.mw ?? "",
      r.compound.logP ?? "",
      r.compound.tpsa ?? "",
      r.compound.hbd ?? "",
      r.compound.hba ?? "",
      r.bbb.boiledEgg ? "Yes" : "No",
      r.bbb.admetlabRulesPassed,
      r.bbb.logPS ?? "",
      r.bbb.kpuuBrain ?? "",
      r.bbb.bbbPotential,
      r.cyp2e1.score,
      r.cyp2e1.potential,
      r.cyp2e1.features.join("; "),
    ]);
    const csv = [headers, ...rows]
      .map(row =>
        row
          .map(cell => {
            const s = String(cell);
            return s.includes(",") || s.includes('"')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "screening_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary" />
    );
  };

  const SortableHeader = ({
    field,
    children,
    className = "",
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-accent/50 transition-colors whitespace-nowrap ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1.5">
        {children}
        <SortIcon field={field} />
      </div>
    </TableHead>
  );

  if (results.length === 0) return null;

  const successCount = results.filter(
    r => r.compound.status === "success"
  ).length;
  const failedCount = results.length - successCount;
  const successVisible = filteredAndSorted.filter(
    r => r.compound.status === "success"
  );
  const allVisibleSelected =
    successVisible.length > 0 &&
    successVisible.every(r => selectedNames.has(r.compound.name));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="container py-8 flex-1">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
                className="gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <h1 className="text-2xl font-bold text-foreground">
                Screening Results
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {successCount} compound{successCount !== 1 ? "s" : ""} screened
              successfully
              {failedCount > 0 && (
                <span className="text-destructive">
                  {" "}
                  ({failedCount} failed)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Compare button */}
            {selectedNames.size >= 2 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowCompare(true)}
                className="gap-1.5 animate-in fade-in slide-in-from-right-2 duration-200"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Compare ({selectedNames.size})
              </Button>
            )}
            {selectedNames.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedNames(new Set());
                  setShowCompare(false);
                }}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </Button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter compounds..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg bg-input/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/50 w-48"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Radar Chart Comparison Panel */}
        {showCompare && selectedResults.length >= 2 && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <RadarCompare
              selected={selectedResults}
              onClose={() => setShowCompare(false)}
              onRemove={name => {
                setSelectedNames(prev => {
                  const next = new Set(prev);
                  next.delete(name);
                  if (next.size < 2) setShowCompare(false);
                  return next;
                });
              }}
            />
          </div>
        )}

        {/* Selection hint */}
        {selectedNames.size === 0 && (
          <div className="mb-4 text-xs text-muted-foreground/70 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Select 2 or more compounds using the checkboxes to enable radar
            chart comparison.
          </div>
        )}
        {selectedNames.size === 1 && (
          <div className="mb-4 text-xs text-primary/80 flex items-center gap-1.5 animate-in fade-in duration-200">
            <BarChart3 className="w-3.5 h-3.5" />
            Select at least 1 more compound to compare.
          </div>
        )}

        {/* Results Table */}
        <Card className="card-glow bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <SortableHeader field="rankScore">Rank</SortableHeader>
                    <SortableHeader field="confidence">Conf.</SortableHeader>
                    <SortableHeader field="name">Compound</SortableHeader>
                    <SortableHeader field="mw">MW</SortableHeader>
                    <SortableHeader field="logP">LogP</SortableHeader>
                    <SortableHeader field="tpsa">TPSA</SortableHeader>
                    <SortableHeader field="hbd">HBD</SortableHeader>
                    <SortableHeader field="hba">HBA</SortableHeader>
                    <SortableHeader field="boiledEgg">
                      BOILED-Egg
                    </SortableHeader>
                    <SortableHeader field="admetlabRules">
                      ADMETlab
                    </SortableHeader>
                    <SortableHeader field="logPS">LogPS</SortableHeader>
                    <SortableHeader field="kpuuBrain">Kp,uu</SortableHeader>
                    <SortableHeader field="bbbPotential">BBB</SortableHeader>
                    <SortableHeader field="cyp2e1Score">
                      CYP Score
                    </SortableHeader>
                    <SortableHeader field="cyp2e1Potential">
                      CYP2E1
                    </SortableHeader>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((r, i) => {
                    const originalIndex = results.indexOf(r);
                    const isFailed = r.compound.status !== "success";
                    const isSelected = selectedNames.has(r.compound.name);
                    return (
                      <TableRow
                        key={r.compound.name + i}
                        className={`hover:bg-accent/30 transition-colors ${
                          isFailed ? "opacity-50" : ""
                        } ${isSelected ? "bg-primary/5 hover:bg-primary/10" : ""}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              toggleSelect(r.compound.name)
                            }
                            disabled={
                              isFailed ||
                              (!isSelected && selectedNames.size >= 10)
                            }
                            aria-label={`Select ${r.compound.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r._adjRank != null ? r._adjRank : r.rankScore != null ? r.rankScore : "—"}
                        </TableCell>
                        <TableCell>
                          {r.confidence ? (
                            <div className="flex flex-col gap-1">
                              <ConfidenceBadge level={r.confidence.overall.level} />
                              {r.confidence.flags.length > 0 && (
                                <span
                                  className="text-[10px] text-muted-foreground"
                                  title={r.confidence.flags.join("; ")}
                                >
                                  flags: {r.confidence.flags.length}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-foreground whitespace-nowrap">
                          {r.compound.name}
                          {isFailed && (
                            <span className="ml-2 text-xs text-destructive">
                              ({r.compound.status})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.compound.mw != null
                            ? Number(r.compound.mw).toFixed(1)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.compound.logP != null
                            ? Number(r.compound.logP).toFixed(1)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.compound.tpsa != null
                            ? Number(r.compound.tpsa).toFixed(1)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.compound.hbd ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.compound.hba ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-medium ${
                              r.bbb.boiledEgg
                                ? "text-[oklch(0.8_0.18_155)]"
                                : "text-muted-foreground"
                            }`}
                          >
                            {r.bbb.boiledEgg ? "Pass" : "Fail"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.bbb.admetlabRulesPassed}/5
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.bbb.logPS != null
                            ? Number(r.bbb.logPS).toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.bbb.kpuuBrain != null
                            ? Number(r.bbb.kpuuBrain) < 0.001
                              ? Number(r.bbb.kpuuBrain).toExponential(2)
                              : Number(r.bbb.kpuuBrain).toFixed(4)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <LevelBadge level={r.bbb.bbbPotential} />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold">
                          {r.cyp2e1.score}
                        </TableCell>
                        <TableCell>
                          <LevelBadge level={r.cyp2e1.potential} />
                        </TableCell>
                        <TableCell>
                          <Link href={`/compound/${originalIndex}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="font-medium">Potential Levels:</span>
          <LevelBadge level="Very High" />
          <LevelBadge level="High" />
          <LevelBadge level="Moderate" />
          <LevelBadge level="Low" />
        </div>
      </div>
    </div>
  );
}
