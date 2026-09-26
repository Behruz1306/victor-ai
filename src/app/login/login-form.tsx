"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Headset, UsersRound, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label } from "@/components/ui/primitives";
import { useT } from "@/components/providers";

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { home?: string };
      if (res.status === 429) return setError(t("login.rate"));
      if (!res.ok || !data.home) return setError(t("login.invalid"));
      router.push(data.home);
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("/api/auth/login", { email, password });
            }}
          >
            <h1 className="text-base font-semibold">{t("login.title")}</h1>
            <div className="flex flex-col gap-1">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-sev-5">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {t("login.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
      {demoMode ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t("login.demo")}</p>
          <div className="grid gap-2">
            <Button
              variant="outline"
              disabled={busy}
              data-testid="demo-login-dispatcher"
              onClick={() => submit("/api/auth/demo-login", { role: "dispatcher" })}
            >
              <Headset /> {t("login.asDispatcher")} · Timur
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              data-testid="demo-login-lead"
              onClick={() => submit("/api/auth/demo-login", { role: "lead" })}
            >
              <UsersRound /> {t("login.asLead")} · Dilnoza
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              data-testid="demo-login-owner"
              onClick={() => submit("/api/auth/demo-login", { role: "owner" })}
            >
              <Crown /> {t("login.asOwner")} · Rustam
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
