import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type StatusResp = { enabled: boolean; authed: boolean };

type Props = {
  children: React.ReactNode;
};

export function SitePasswordGate({ children }: Props) {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/site-auth/status", { credentials: "include" })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, authed: true }));
  }, []);

  const needsGate = useMemo(() => {
    if (!status) return true;
    return status.enabled && !status.authed;
  }, [status]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/site-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!resp.ok) {
        setError("密碼不正確");
        return;
      }
      const next = (await resp.json()) as { success: boolean };
      if (!next.success) {
        setError("登入失敗");
        return;
      }
      const st = (await fetch("/api/site-auth/status", {
        credentials: "include",
      }).then(r => r.json())) as StatusResp;
      setStatus(st);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!needsGate) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <div>
            <h1 className="text-lg font-semibold">需要密碼才能使用</h1>
            <p className="text-sm text-muted-foreground mt-1">
              請輸入網站存取密碼（Site Password）。
            </p>
          </div>

          <Input
            type="password"
            placeholder="Site password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") submit();
            }}
          />

          {error && <div className="text-sm text-destructive">{error}</div>}

          <Button
            className="w-full"
            onClick={submit}
            disabled={!password || submitting}
          >
            {submitting ? "驗證中…" : "進入"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
