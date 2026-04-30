import { useMemo } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScreeningResult } from "../../../shared/types";

/**
 * Distinct color palette for up to 10 compounds.
 * Uses vivid, well-separated hues for clear visual distinction.
 */
const COMPOUND_COLORS = [
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fb923c", // orange
  "#60a5fa", // blue
  "#facc15", // yellow
  "#f87171", // red
  "#2dd4bf", // teal
  "#c084fc", // purple
];

/** Axes for the radar chart with their normalization ranges */
const RADAR_AXES = [
  { key: "mw", label: "MW", min: 0, max: 600, invert: true },
  { key: "logP", label: "LogP", min: -3, max: 8, invert: false },
  { key: "tpsa", label: "TPSA", min: 0, max: 200, invert: true },
  { key: "logPS", label: "LogPS", min: -4, max: 0, invert: false },
  { key: "kpuu", label: "Kp,uu", min: 0, max: 1, invert: false },
  { key: "cypScore", label: "CYP Score", min: 0, max: 16, invert: false },
] as const;

/**
 * Normalize a value to 0-100 scale.
 * For "inverted" axes (like MW, TPSA), lower values are better → higher score.
 */
function normalize(
  value: number | null | undefined,
  min: number,
  max: number,
  invert: boolean
): number {
  if (value == null) return 0;
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min);
  return Math.round((invert ? 1 - ratio : ratio) * 100);
}

interface RadarCompareProps {
  selected: ScreeningResult[];
  onClose: () => void;
  onRemove: (name: string) => void;
}

export function RadarCompare({
  selected,
  onClose,
  onRemove,
}: RadarCompareProps) {
  /** Build radar data: one entry per axis, with a key per compound */
  const radarData = useMemo(() => {
    return RADAR_AXES.map(axis => {
      const entry: Record<string, string | number> = { axis: axis.label };
      selected.forEach(r => {
        let raw: number | null | undefined;
        switch (axis.key) {
          case "mw":
            raw = r.compound.mw;
            break;
          case "logP":
            raw = r.compound.logP;
            break;
          case "tpsa":
            raw = r.compound.tpsa;
            break;
          case "logPS":
            raw = r.bbb.logPS;
            break;
          case "kpuu":
            raw = r.bbb.kpuuBrain;
            break;
          case "cypScore":
            raw = r.cyp2e1.score;
            break;
        }
        entry[r.compound.name] = normalize(
          raw,
          axis.min,
          axis.max,
          axis.invert
        );
      });
      return entry;
    });
  }, [selected]);

  /** Build raw values for tooltip */
  const rawValues = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    selected.forEach(r => {
      const vals: Record<string, string> = {};
      vals["MW"] =
        r.compound.mw != null ? Number(r.compound.mw).toFixed(1) : "—";
      vals["LogP"] =
        r.compound.logP != null ? Number(r.compound.logP).toFixed(1) : "—";
      vals["TPSA"] =
        r.compound.tpsa != null ? Number(r.compound.tpsa).toFixed(1) : "—";
      vals["LogPS"] =
        r.bbb.logPS != null ? Number(r.bbb.logPS).toFixed(2) : "—";
      vals["Kp,uu"] =
        r.bbb.kpuuBrain != null
          ? Number(r.bbb.kpuuBrain) < 0.001
            ? Number(r.bbb.kpuuBrain).toExponential(2)
            : Number(r.bbb.kpuuBrain).toFixed(4)
          : "—";
      vals["CYP Score"] = String(r.cyp2e1.score);
      map[r.compound.name] = vals;
    });
    return map;
  }, [selected]);

  return (
    <div className="card-glow bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Radar Comparison
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Normalized scores (0–100). Higher is better for drug-likeness.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Chart */}
      <div className="px-4 pt-2 pb-2">
        <div
          className="w-full"
          style={{ height: Math.max(380, selected.length * 20 + 340) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="48%" outerRadius="70%">
              <PolarGrid stroke="oklch(0.28 0.015 260)" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{
                  fill: "oklch(0.72 0.015 260)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fill: "oklch(0.5 0.01 260)", fontSize: 10 }}
                tickCount={5}
                axisLine={false}
              />
              {selected.map((r, i) => (
                <Radar
                  key={r.compound.name}
                  name={r.compound.name}
                  dataKey={r.compound.name}
                  stroke={COMPOUND_COLORS[i % COMPOUND_COLORS.length]}
                  fill={COMPOUND_COLORS[i % COMPOUND_COLORS.length]}
                  fillOpacity={0.08}
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    fill: COMPOUND_COLORS[i % COMPOUND_COLORS.length],
                    fillOpacity: 0.9,
                  }}
                />
              ))}
              <Tooltip
                content={({ payload, label }) => {
                  if (!payload || payload.length === 0) return null;
                  return (
                    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
                      <div className="font-semibold text-foreground mb-1.5">
                        {label}
                      </div>
                      {payload.map((p: any, idx: number) => {
                        const compoundName = p.name;
                        const actualVal =
                          rawValues[compoundName]?.[label as string] ?? "—";
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2 py-0.5"
                          >
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: p.stroke }}
                            />
                            <span className="text-muted-foreground">
                              {compoundName}:
                            </span>
                            <span className="font-mono text-foreground font-medium ml-auto">
                              {actualVal}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value: string) => (
                  <span className="text-muted-foreground">{value}</span>
                )}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected compounds chips */}
      <div className="px-5 pb-4 flex flex-wrap gap-2">
        {selected.map((r, i) => (
          <span
            key={r.compound.name}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              borderColor: COMPOUND_COLORS[i % COMPOUND_COLORS.length] + "60",
              backgroundColor:
                COMPOUND_COLORS[i % COMPOUND_COLORS.length] + "15",
              color: COMPOUND_COLORS[i % COMPOUND_COLORS.length],
            }}
          >
            {r.compound.name}
            <button
              onClick={() => onRemove(r.compound.name)}
              className="ml-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
