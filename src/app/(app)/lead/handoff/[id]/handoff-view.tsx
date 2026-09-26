"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, Check, ArrowLeft, UserRoundCheck } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { ChatTypeChip, useClock } from "@/components/common";
import { pick, type HandoffBrief } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

type Data = {
  id: string;
  status: "draft" | "confirmed";
  createdAt: string;
  confirmedAt: string | null;
  briefs: HandoffBrief[];
  from: string;
  to: string;
  timezone: string;
  companyName: string;
};

export function HandoffView({ data }: { data: Data }) {
  const { t, lang } = useT();
  const router = useRouter();
  const clock = useClock(data.timezone);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(data.status === "confirmed");
  const [error, setError] = React.useState<string | null>(null);
  const byCustomer = new Map<string, HandoffBrief[]>();
  for (const b of data.briefs)
    byCustomer.set(b.customerName, [...(byCustomer.get(b.customerName) ?? []), b]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/lead">
            <ArrowLeft /> {t("common.back")}
          </Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t("common.print")}
          </Button>
          {done ? (
            <Badge tone="ok" className="px-2 py-1 text-xs">
              <UserRoundCheck /> {t("handoff.confirmed", { name: data.to })}
            </Badge>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              data-testid="handoff-confirm"
              onClick={async () => {
                setBusy(true);
                try {
                  await apiPost(`/api/handoff/${data.id}/confirm`);
                  setDone(true);
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check /> {t("handoff.confirm")}
            </Button>
          )}
        </div>
      </div>
      {error ? <p className="text-sm text-sev-5">{error}</p> : null}
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t("handoff.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {data.companyName} · {t("handoff.subtitle", { from: data.from })} →{" "}
          <strong>{data.to}</strong> · {clock(data.createdAt, true)}
        </p>
      </header>
      {data.briefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("handoff.empty")}</p>
      ) : null}
      {[...byCustomer.entries()].map(([customer, briefs]) => (
        <section key={customer} className="flex flex-col gap-3 break-inside-avoid">
          <h2 className="text-base font-semibold">{customer}</h2>
          {briefs.map((b) => (
            <Card key={b.channelId} className="break-inside-avoid p-4" data-testid="handoff-brief">
              <div className="mb-2 flex items-center gap-2">
                <ChatTypeChip type={b.chatType} />
                <h3 className="text-sm font-semibold">{b.channelTitle}</h3>
              </div>
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <Field label={t("handoff.whatHappened")} value={pick(b.whatHappened, lang)} />
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground uppercase">
                    {t("handoff.openTasks")}
                  </dt>
                  <dd className="mt-1">
                    {b.openTasks.length ? (
                      <ul className="flex flex-col gap-1">
                        {b.openTasks.map((task) => (
                          <li key={task.taskId}>
                            <Link href={`/tasks/${task.taskId}`} className="hover:underline">
                              {pick(task.title, lang)}
                            </Link>{" "}
                            <span className="text-xs text-muted-foreground">
                              — {t(`status.${task.status}` as TKey)}
                              {task.deadlineAt
                                ? `, ${t("task.deadline")}: ${clock(task.deadlineAt, true)}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <Field label={t("handoff.promises")} value={pick(b.promisesMade, lang)} />
                <Field label={t("handoff.risks")} value={pick(b.risks, lang)} />
                <div className="md:col-span-2">
                  <Field label={t("handoff.nextSteps")} value={pick(b.nextSteps, lang)} strong />
                </div>
              </dl>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground uppercase">{label}</dt>
      <dd className={strong ? "mt-1 font-medium" : "mt-1"}>{value || "—"}</dd>
    </div>
  );
}
