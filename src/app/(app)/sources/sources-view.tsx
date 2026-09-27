"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Megaphone,
  Check,
  Upload,
  ListTodo,
  CircleCheck,
  Link2,
  Eye,
} from "lucide-react";
import { apiGet, apiPost, POLL_MS, type Jsonify } from "@/lib/client/api";
import type { listSources, channelMessages, sourcesWall } from "@/lib/queries/sources";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, Input, Label, PageHeader, Select } from "@/components/ui/primitives";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/overlay";
import {
  ChatTypeChip,
  DemoDataTag,
  LoadingRows,
  SignalBadge,
  SourceIcon,
  UntrustedBadge,
  useClock,
} from "@/components/common";
import { EmptyState } from "@/components/empty-state";
import { pick } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

type Sources = Jsonify<Awaited<ReturnType<typeof listSources>>>;
type Channel = Sources["channels"][number];
type Wall = Jsonify<Awaited<ReturnType<typeof sourcesWall>>>;
type Msgs = { messages: Jsonify<Awaited<ReturnType<typeof channelMessages>>> };

const CHAT_TYPES = ["customer", "internal", "fleet", "billing", "support"] as const;

function Switch({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md border px-3 text-base font-medium transition-colors",
        checked
          ? "border-accent/40 bg-accent-soft text-accent-text"
          : "bg-surface text-fg-2 hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow transition-transform duration-[160ms]",
            checked && "translate-x-3",
          )}
        />
      </span>
      <Eye className="size-4" aria-hidden /> {label}
    </button>
  );
}

export function SourcesView({ timezone, canManage }: { timezone: string; canManage: boolean }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiGet<Sources>("/api/sources"),
    refetchInterval: POLL_MS,
  });
  const wall = useQuery({
    queryKey: ["sources-wall"],
    queryFn: () => apiGet<Wall>("/api/sources/wall"),
    refetchInterval: POLL_MS,
  });
  const [overlay, setOverlay] = React.useState(false);
  const [opened, setOpened] = React.useState<string | null>(null);
  const [upload, setUpload] = React.useState(false);
  const channels = q.data?.channels ?? [];
  const unmapped = channels.filter((c) => !c.chatType);
  const current = channels.find((c) => c.id === opened) ?? null;

  if (q.isError || wall.isError)
    return (
      <div className="p-6">
        <ErrorState
          message={t("common.error")}
          onRetry={() => void (q.refetch(), wall.refetch())}
          retryLabel={t("common.retry")}
        />
      </div>
    );

  return (
    <div className="flex min-w-0 flex-col px-4 py-6 sm:px-8">
      <PageHeader
        title={t("nav.sources")}
        context={
          wall.data
            ? t("src.context", {
                chats: wall.data.totals.chats,
                messages: wall.data.totals.messages,
              })
            : t("src.subtitle")
        }
        actions={
          <>
            {canManage && channels.some((c) => c.customerId) ? (
              <Button variant="outline" onClick={() => setUpload(true)}>
                <Upload /> {t("src.upload")}
              </Button>
            ) : null}
            <Switch
              checked={overlay}
              onChange={setOverlay}
              label={t("src.overlay")}
              testId="overlay-toggle"
            />
          </>
        }
      />

      {unmapped.length > 0 ? (
        <section className="mb-6 flex flex-col gap-3 rounded-lg border border-medium-border bg-medium-soft/40 p-4">
          <div>
            <h2 className="text-base font-semibold text-fg">{t("src.unmapped")}</h2>
            <p className="text-sm text-fg-3">{t("src.unmappedHint")}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {unmapped.map((c) => (
              <UnmappedRow
                key={c.id}
                channel={c}
                data={q.data!}
                canManage={canManage}
                onOpen={() => setOpened(c.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {overlay ? (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2"
          data-testid="overlay-legend"
        >
          <span className="font-medium text-fg">{t("src.legend")}</span>
          <span className="flex items-center gap-1.5">
            <ListTodo className="size-3.5 text-accent-text" aria-hidden /> {t("src.markTask")}
          </span>
          <span className="flex items-center gap-1.5">
            <CircleCheck className="size-3.5 text-accent-text" aria-hidden /> {t("src.markStatus")}
          </span>
          <span className="flex items-center gap-1.5">
            <SignalBadge kind="complaint" severity={4} className="h-[18px]" /> {t("src.markSignal")}
          </span>
          <span className="flex items-center gap-1.5">
            <Link2 className="size-3.5 text-accent-text" aria-hidden /> {t("src.markContext")}
          </span>
        </div>
      ) : null}

      {wall.isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[60vh] w-[300px] shrink-0 rounded-lg" />
          ))}
        </div>
      ) : !wall.data?.channels.length ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState illustration="sources" title={t("src.none")} hint={t("src.noneHint")} />
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8" data-testid="chaos-wall">
          <div className="flex gap-3">
            {[...wall.data.channels]
              .sort((a, b) => b.messages.length - a.messages.length)
              .map((ch) => (
              <WallColumn
                key={ch.id}
                ch={ch}
                marks={wall.data!.marks}
                overlay={overlay}
                timezone={timezone}
                onOpen={() => setOpened(ch.id)}
              />
            ))}
          </div>
        </div>
      )}

      <DialogPrimitive.Root open={Boolean(current)} onOpenChange={(o) => !o && setOpened(null)}>
        {current ? (
          <SheetContent
            title={current.title}
            description={current.customerName ?? t("src.shared")}
            className="w-[min(560px,100vw)]"
          >
            <ChannelMessages
              channel={current}
              timezone={timezone}
              canManage={canManage}
              botConfigured={q.data?.botConfigured ?? false}
            />
          </SheetContent>
        ) : null}
      </DialogPrimitive.Root>

      <Dialog open={upload} onOpenChange={setUpload}>
        <DialogContent title={t("src.upload")} description={t("src.uploadHint")}>
          <TranscriptUpload channels={channels} onDone={() => setUpload(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WallColumn({
  ch,
  marks,
  overlay,
  timezone,
  onOpen,
}: {
  ch: Wall["channels"][number];
  marks: Wall["marks"];
  overlay: boolean;
  timezone: string;
  onOpen: () => void;
}) {
  const { t, lang } = useT();
  const clock = useClock(timezone);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const count = ch.messages.length;
  React.useLayoutEffect(() => {
    // Scroll only this column (scrollIntoView would also scroll the wall sideways).
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <section
      className="flex h-[calc(100vh-230px)] min-h-[420px] w-[300px] shrink-0 flex-col overflow-hidden rounded-lg border bg-surface"
      aria-label={ch.title}
    >
      <button
        onClick={onOpen}
        className="flex flex-col gap-1 border-b px-3 py-2.5 text-left hover:bg-surface-2"
        aria-label={`${ch.title} — ${t("src.openChat")}`}
      >
        <span className="flex items-center gap-1.5">
          <SourceIcon source={ch.source} className="size-3" />
          <span className="truncate text-sm font-semibold text-fg">{ch.title}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          <ChatTypeChip type={ch.chatType} className="h-[18px] px-1 text-xs" />
          <span className="truncate">{ch.customerName ?? t("src.shared")}</span>
          <span className="num ml-auto">{count}</span>
        </span>
      </button>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2 focus-visible:outline-offset-[-2px]"
        tabIndex={0}
        role="region"
        aria-label={t("src.messagesIn", { chat: ch.title })}
      >
        {ch.messages.map((m) => {
          const mk = marks[m.id] ?? [];
          const lit = overlay && mk.length > 0;
          return (
            <div
              key={m.id}
              className={cn(
                "rounded-md px-1.5 py-1 transition-[opacity,background-color] duration-200",
                overlay && !lit && "opacity-35",
                lit && "bg-accent-soft/70",
              )}
            >
              <div className="flex items-baseline gap-1.5 text-xs">
                <time className="num shrink-0 font-mono text-fg-3">{clock(m.sentAt)}</time>
                <span
                  className={cn(
                    "truncate font-medium",
                    m.side === "customer" ? "text-fg" : "text-fg-2",
                  )}
                >
                  {m.sender.replace(/[(|].*$/, "").trim()}
                </span>
                {m.untrusted ? <UntrustedBadge /> : null}
              </div>
              <p className="text-sm leading-snug text-fg">{m.text}</p>
              {lit ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {mk.map((x, i) =>
                    x.type === "task" ? (
                      <Badge key={i} tone="accent">
                        <ListTodo /> {pick(x.title, lang)}
                      </Badge>
                    ) : x.type === "status" ? (
                      <Badge key={i} tone="accent">
                        <CircleCheck /> {t(`status.${x.status}` as TKey)}
                      </Badge>
                    ) : x.type === "signal" ? (
                      <SignalBadge key={i} kind={x.kind} severity={x.severity} />
                    ) : (
                      <Badge key={i} tone="accent">
                        <Link2 /> {t("src.markContext")}
                      </Badge>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UnmappedRow({
  channel,
  data,
  canManage,
  onOpen,
}: {
  channel: Channel;
  data: Sources;
  canManage: boolean;
  onOpen: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const p = channel.proposal;
  const [chatType, setChatType] = React.useState<string>(p?.chatType ?? "customer");
  const [customerId, setCustomerId] = React.useState<string>(p?.customerId ?? "");
  const [newName, setNewName] = React.useState<string>(
    !p?.customerId && p?.customerName ? p.customerName : "",
  );
  const [dispatcher, setDispatcher] = React.useState<string>(data.dispatchers[0]?.id ?? "");
  React.useEffect(() => {
    if (p) {
      setChatType(p.chatType);
      setCustomerId(p.customerId ?? "");
      if (!p.customerId && p.customerName) setNewName(p.customerName);
    }
  }, [p]);
  const m = useMutation({
    mutationFn: () =>
      apiPost(`/api/channels/${channel.id}/map`, {
        chatType,
        customerId: customerId || null,
        newCustomerName: !customerId && newName ? newName : undefined,
        assignedUserId: !customerId && newName ? dispatcher || null : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["sources-wall"] });
    },
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-surface p-3">
      <button className="flex items-center gap-2 text-left" onClick={onOpen}>
        <SourceIcon source={channel.source} />
        <span className="text-base font-medium text-fg">{channel.title}</span>
        <span className="num text-sm text-fg-3">
          {t("src.messages", { n: channel.messageCount })}
        </span>
      </button>
      {p ? (
        <p className="flex items-start gap-1.5 rounded-md bg-accent-soft px-2.5 py-1.5 text-sm text-accent-text">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t("src.aiProposal")}: {p.customerName ?? "—"} · {t(`chat.${p.chatType}` as TKey)} —{" "}
            {p.reason}
          </span>
        </p>
      ) : null}
      {canManage ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`ct-${channel.id}`}>{t("src.chatType")}</Label>
            <Select
              id={`ct-${channel.id}`}
              value={chatType}
              onChange={(e) => setChatType(e.target.value)}
            >
              {CHAT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {t(`chat.${ct}` as TKey)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`cu-${channel.id}`}>{t("src.customer")}</Label>
            <Select
              id={`cu-${channel.id}`}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">
                {chatType === "fleet" || chatType === "internal"
                  ? `— ${t("src.shared")} —`
                  : `— ${t("src.orNew")} —`}
              </option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {!customerId && chatType !== "fleet" && chatType !== "internal" ? (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`nc-${channel.id}`}>{t("src.newCustomer")}</Label>
                <Input
                  id={`nc-${channel.id}`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`dp-${channel.id}`}>{t("nav.dispatcher")}</Label>
                <Select
                  id={`dp-${channel.id}`}
                  value={dispatcher}
                  onChange={(e) => setDispatcher(e.target.value)}
                >
                  {data.dispatchers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : null}
          <Button
            size="sm"
            className="col-span-2"
            disabled={
              m.isPending || (!customerId && !newName && !["fleet", "internal"].includes(chatType))
            }
            onClick={() => m.mutate()}
            data-testid="map-channel"
          >
            <Check /> {t("src.map")}
          </Button>
          {m.isError ? (
            <p className="col-span-2 text-sm text-critical">{(m.error as Error).message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChannelMessages({
  channel,
  timezone,
  canManage,
  botConfigured,
}: {
  channel: Channel;
  timezone: string;
  canManage: boolean;
  botConfigured: boolean;
}) {
  const { t } = useT();
  const clock = useClock(timezone);
  const q = useQuery({
    queryKey: ["channel-messages", channel.id],
    queryFn: () => apiGet<Msgs>(`/api/channels/${channel.id}/messages`),
    refetchInterval: POLL_MS,
  });
  const consent = useMutation({ mutationFn: () => apiPost(`/api/channels/${channel.id}/consent`) });
  const count = q.data?.messages.length ?? 0;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <ChatTypeChip type={channel.chatType} />
        {channel.source === "demo" ? <DemoDataTag /> : null}
        <span className="num text-sm text-fg-3">
          {t("src.messages", { n: channel.messageCount })}
        </span>
        <div className="ml-auto">
          {canManage && channel.source === "telegram" && botConfigured ? (
            channel.consentPostedAt || consent.isSuccess ? (
              <Badge tone="ok">
                <Check /> {t("src.consentPosted")}
              </Badge>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() => consent.mutate()}
                disabled={consent.isPending}
              >
                <Megaphone /> {t("src.consentPost")}
              </Button>
            )
          ) : null}
        </div>
      </div>
      <div className="flex flex-col px-5 py-3">
        {q.isLoading ? (
          <LoadingRows rows={8} />
        ) : q.isError ? (
          <ErrorState message={t("common.error")} onRetry={() => q.refetch()} />
        ) : count === 0 ? (
          <EmptyState illustration="chats" title={t("src.noMessages")} />
        ) : (
          q.data!.messages.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-0.5 border-b border-dashed py-2 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-3">
                <time className="num font-mono">{clock(m.sentAt, true)}</time>
                <span
                  className={cn("font-medium", m.side === "customer" ? "text-fg" : "text-fg-2")}
                >
                  {m.sender}
                </span>
                <span className="uppercase">{t(`side.${m.side}` as TKey)}</span>
                {m.untrusted ? <UntrustedBadge /> : null}
                {m.viaVictor ? <span className="text-accent-text">{t("disp.sentVia")}</span> : null}
              </div>
              <p className="text-sm whitespace-pre-wrap text-fg">{m.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TranscriptUpload({ channels, onDone }: { channels: Channel[]; onDone: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const customerChannels = channels.filter((c) => c.customerId && c.chatType === "customer");
  const [customerId, setCustomerId] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="upload-customer">{t("src.customer")}</Label>
        <Select
          id="upload-customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">{t("src.customer")}…</option>
          {customerChannels.map((c) => (
            <option key={c.id} value={c.customerId!}>
              {c.customerName}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="upload-file">{t("src.file")}</Label>
        <input
          id="upload-file"
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="text-sm text-fg-2 file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-2.5 file:py-1 file:text-sm file:text-fg"
        />
      </div>
      {result ? <p className="text-sm text-ok">{result}</p> : null}
      {error ? <p className="text-sm text-critical">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          {t("common.close")}
        </Button>
        <Button
          disabled={!customerId}
          onClick={async () => {
            setError(null);
            const file = fileRef.current?.files?.[0];
            if (!file) return;
            if (file.size > 200_000) return setError("File too large (max 200 KB)");
            try {
              const res = await apiPost<{ lines: number }>("/api/transcripts", {
                customerId,
                name: file.name,
                content: await file.text(),
              });
              setResult(t("src.uploadDone", { n: res.lines }));
              void qc.invalidateQueries({ queryKey: ["sources"] });
              void qc.invalidateQueries({ queryKey: ["sources-wall"] });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Upload /> {t("src.upload")}
        </Button>
      </div>
    </div>
  );
}
