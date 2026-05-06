import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Clock, FlaskConical, Loader2, Eye } from "lucide-react";
import type { ScreeningResult } from "../../../shared/types";

export default function History() {
  const [, navigate] = useLocation();
  const { data: sessions, isLoading } = trpc.screening.history.useQuery({
    limit: 20,
  });

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null
  );
  const { data: sessionResults, isLoading: isLoadingResults } =
    trpc.screening.sessionResults.useQuery(
      { sessionId: selectedSessionId! },
      { enabled: selectedSessionId !== null }
    );

  const handleViewSession = (sessionId: number) => {
    setSelectedSessionId(sessionId);
  };

  const handleLoadToResults = () => {
    if (!sessionResults || sessionResults.length === 0) return;
    // Reconstruct ScreeningResult[] from DB rows
    const results: ScreeningResult[] = sessionResults.map(row => {
      if (row.resultJson) {
        const stored = row.resultJson as unknown as ScreeningResult;
        if (stored.cyp450?.cyp3a5) {
          return stored;
        }
        return {
          ...stored,
          cyp450: {
            ...stored.cyp450,
            cyp3a5: {
              isoform: "CYP3A5",
              score: 0,
              potential: "Low",
              features: [],
              summary: "Historical session did not store CYP3A5 panel data.",
              source: "predicted",
              measuredValue: null,
              measuredUnit: null,
              measuredRelation: null,
              measuredNote: null,
            },
          },
        };
      }
      // Fallback reconstruction from flat fields
      return {
        compound: {
          name: row.compoundName,
          cid: row.cid ?? null,
          smiles: row.smiles ?? null,
          mw: row.mw ? parseFloat(row.mw) : null,
          logP: row.logP ? parseFloat(row.logP) : null,
          tpsa: row.tpsa ? parseFloat(row.tpsa) : null,
          hbd: row.hbd ?? null,
          hba: row.hba ?? null,
          status: "success" as const,
        },
        bbb: {
          boiledEgg: row.boiledEgg === "Yes",
          admetlab: true,
          admetlabRulesPassed: row.admetlabRulesPassed ?? 0,
          logPS: row.logPS ? parseFloat(row.logPS) : null,
          kpuuBrain: row.kpuuBrain ? parseFloat(row.kpuuBrain) : null,
          bbbPotential: (row.bbbPotential ?? "Low") as any,
        },
        cyp2e1: {
          isoform: "CYP2E1",
          score: row.cypScore ?? 0,
          potential: (row.cypPotential ?? "Low") as any,
          features: row.cypFeatures ? row.cypFeatures.split("; ") : [],
          summary: "Recovered from historical session.",
          source: "predicted",
          measuredValue: null,
          measuredUnit: null,
          measuredRelation: null,
          details: {
            molecularVolume: { score: 0, description: "" },
            hemeLigation: { score: 0, description: "" },
            hydrophobicInteraction: { score: 0, description: "" },
            hydrogenBonding: { score: 0, description: "" },
          },
        },
        cyp450: {
          cyp1a2: {
            isoform: "CYP1A2",
            score: 0,
            potential: "Low",
            features: [],
            summary: "Historical session did not store CYP1A2 panel data.",
            source: "predicted",
          },
          cyp2c9: {
            isoform: "CYP2C9",
            score: 0,
            potential: "Low",
            features: [],
            summary: "Historical session did not store CYP2C9 panel data.",
            source: "predicted",
          },
          cyp2c19: {
            isoform: "CYP2C19",
            score: 0,
            potential: "Low",
            features: [],
            summary: "Historical session did not store CYP2C19 panel data.",
            source: "predicted",
          },
          cyp2d6: {
            isoform: "CYP2D6",
            score: 0,
            potential: "Low",
            features: [],
            summary: "Historical session did not store CYP2D6 panel data.",
            source: "predicted",
          },
          cyp2e1: {
            isoform: "CYP2E1",
            score: row.cypScore ?? 0,
            potential: (row.cypPotential ?? "Low") as any,
            features: row.cypFeatures ? row.cypFeatures.split("; ") : [],
            summary: "Recovered from historical session.",
            source: "predicted",
            measuredValue: null,
            measuredUnit: null,
            measuredRelation: null,
            details: {
              molecularVolume: { score: 0, description: "" },
              hemeLigation: { score: 0, description: "" },
              hydrophobicInteraction: { score: 0, description: "" },
              hydrogenBonding: { score: 0, description: "" },
            },
          },
          cyp3a4: {
            isoform: "CYP3A4",
            score: 0,
            potential: "Low",
            features: [],
            summary: "Historical session did not store CYP3A4 panel data.",
            source: "predicted",
          },
          cyp3a5: {
            isoform: "CYP3A5",
            score: 0,
            potential: "Low",
            features: [],
            summary: "Historical session did not store CYP3A5 panel data.",
            source: "predicted",
            measuredValue: null,
            measuredUnit: null,
            measuredRelation: null,
            measuredNote: null,
          },
          majorFamilyScore: Number(((row.cypScore ?? 0) / 7).toFixed(2)),
          overallPotential: (row.cypPotential ?? "Low") as any,
          topIsoforms: ["CYP2E1"],
        },
      };
    });
    sessionStorage.setItem("screeningResults", JSON.stringify(results));
    navigate("/results");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container max-w-5xl py-10">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Screening History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View past screening sessions and reload results
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-3" />
            <span className="text-muted-foreground">Loading history...</span>
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Clock className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground text-center">
                No screening history yet.
                <br />
                Run your first screening to see results here.
              </p>
              <Button className="mt-6" onClick={() => navigate("/")}>
                <FlaskConical className="w-4 h-4 mr-2" />
                Start Screening
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <Card
                key={session.id}
                className={`bg-card border-border transition-colors ${
                  selectedSessionId === session.id
                    ? "border-primary/50"
                    : "hover:border-border/80"
                }`}
              >
                <CardContent className="flex items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FlaskConical className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {session.compoundCount} compound
                        {session.compoundCount > 1 ? "s" : ""} screened
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedSessionId === session.id && isLoadingResults ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : selectedSessionId === session.id && sessionResults ? (
                      <Button size="sm" onClick={handleLoadToResults}>
                        <Eye className="w-4 h-4 mr-1" />
                        View Results
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewSession(session.id)}
                      >
                        Load
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
