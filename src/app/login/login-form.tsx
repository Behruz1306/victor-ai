"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Headset, UsersRound, Gauge, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { useT } from "@/components/providers";
import { Avatar } from "@/components/common";
import { cn } from "@/lib/utils";

const ROLES = [
  { role: "owner", name: "Rustam", icon: Gauge, key: "login.asOwner", hint: "login.ownerHint" },
  { role: "lead", name: "Dilnoza", icon: UsersRound, key: "login.asLead", hint: "login.leadHint" },
  {
    role: "dispatcher",
    name: "Timur",
    icon: Headset,
    key: "login.asDispatcher",
    hint: "login.dispatcherHint",
  },
] as const;

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function submit(url: string, body: unknown, key: string) {
    setBusy(key);
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
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {demoMode ? (
        <section className="flex flex-col gap-2" aria-label={t("login.demo")}>
          <p className="text-sm font-medium text-fg-2">{t("login.demo")}</p>
          <div className="flex flex-col overflow-hidden rounded-lg border bg-surface">
            {ROLES.map((r) => (
              <button
                key={r.role}
                disabled={Boolean(busy)}
                data-testid={`demo-login-${r.role}`}
                onClick={() => submit("/api/auth/demo-login", { role: r.role }, r.role)}
                className={cn(
                  "group flex items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2 disabled:opacity-60",
                )}
              >
                <Avatar name={r.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-base font-medium text-fg">
                    <r.icon className="size-4 text-fg-3" aria-hidden /> {t(r.key)}
                    <span className="font-normal text-fg-3">· {r.name}</span>
                  </span>
                  <span className="block text-sm text-fg-3">{t(r.hint)}</span>
                </span>
                {busy === r.role ? (
                  <Loader2 className="size-4 animate-spin text-fg-3" aria-hidden />
                ) : (
                  <ArrowRight
                    className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text"
                    aria-hidden
                  />
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {demoMode ? (
        <div className="flex items-center gap-3 text-xs text-fg-3">
          <span className="h-px flex-1 bg-border" />
          {t("login.orEmail")}
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit("/api/auth/login", { email, password }, "form");
        }}
      >
        <div className="flex flex-col gap-1.5">
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
        <div className="flex flex-col gap-1.5">
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
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={Boolean(busy)}
          variant={demoMode ? "outline" : "default"}
          className="mt-1"
        >
          {busy === "form" ? <Loader2 className="animate-spin" /> : null} {t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
