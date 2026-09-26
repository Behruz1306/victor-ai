"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Sparkles, Megaphone, Check, Upload } from "lucide-react";
import { apiGet, apiPost, POLL_MS } from "@/lib/client/api";
import type { listSources, channelMessages } from "@/lib/queries/sources";
import { useT } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Select,
} from "@/components/ui/primitives";
import {
  ChatTypeChip,
  LoadingRows,
  SourceIcon,
  TimeAgo,
  UntrustedBadge,
  useClock,
  DemoDataTag,
} from "@/components/common";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";

type Sources = Awaited<ReturnType<typeof listSources>>;
type Channel = Sources["channels"][number];
type Msgs = { messages: Awaited<ReturnType<typeof channelMessages>> };

const CHAT_TYPES = ["customer", "internal", "fleet", "billing", "support"] as const;

export function SourcesView({ timezone, canManage }: { timezone: string; canManage: boolean }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiGet<Sources>("/api/sources"),
    refetchInterval: POLL_MS,
  });
  const [selected, setSelected] = React.useState<string | null>(null);
  const channels = q.data?.channels ?? [];
  const unmapped = channels.filter((c) => !c.chatType);
  const mapped = channels.filter((c) => c.chatType);
  const current = channels.find((c) => c.id === selected) ?? null;

  React.useEffect(() => {
    if (!selected && mapped.length) setSelected(mapped[0]!.id);
  }, [selected, mapped]);

  if (q.isError)
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => q.refetch()}
        retryLabel={t("common.retry")}
      />
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4">
        {unmapped.length > 0 && (
          <Card className="border-sev-3/40">
            <div className="border-b px-3 py-2">
              <h2 className="text-sm font-semibold">{t("src.unmapped")}</h2>
              <p className="text-xs text-muted-foreground">{t("src.unmappedHint")}</p>
            </div>
            <div className="divide-y">
              {unmapped.map((c) => (
                <UnmappedRow
                  key={c.id}
                  channel={c}
                  data={q.data!}
                  canManage={canManage}
                  onSelect={() => setSelected(c.id)}
                />
              ))}
            </div>
          </Card>
        )}
        <Card>
          <div className="border-b px-3 py-2">
            <h2 className="text-sm font-semibold">{t("src.channels")}</h2>
          </div>
          {q.isLoading ? (
            <LoadingRows />
          ) : mapped.length === 0 ? (
            <EmptyState icon={<Inbox />} title={t("src.none")} />
          ) : (
            <ul className="divide-y">
              {mapped.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60",
                      selected === c.id && "bg-primary-soft/60",
                    )}
                  >
                    <SourceIcon source={c.source} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{c.title}</span>
                        <ChatTypeChip type={c.chatType} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.customerName ?? t("src.shared")} · {t("src.messages", { n: c.messageCount })}
                      </div>
                    </div>
                    {c.lastMessageAt ? (
                      <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                        <TimeAgo date={c.lastMessageAt} />
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canManage ? <TranscriptUpload channels={mapped} /> : null}
      </div>
      <Card className="min-h-[60vh]">
        {current ? (
          <ChannelMessages
            channel={current}
            timezone={timezone}
            canManage={canManage}
            botConfigured={q.data?.botConfigured ?? false}
          />
        ) : (
          <EmptyState icon={<Inbox />} title={t("src.selectChannel")} />
        )}
      </Card>
    </div>
  );
}

function UnmappedRow({
  channel,
  data,
  canManage,
  onSelect,
}: {
  channel: Channel;
  data: Sources;
  canManage: boolean;
  onSelect: () => void;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <button className="flex items-center gap-2 text-left" onClick={onSelect}>
        <SourceIcon source={channel.source} />
        <span className="text-sm font-medium">{channel.title}</span>
        <span className="text-xs text-muted-foreground">
          {t("src.messages", { n: channel.messageCount })}
        </span>
      </button>
      {p ? (
        <p className="flex items-start gap-1 rounded bg-primary-soft/60 px-2 py-1 text-xs text-primary">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          <span>
            {t("src.aiProposal")}: {p.customerName ?? "—"} · {t(`chat.${p.chatType}` as TKey)} —{" "}
            {p.reason}
          </span>
        </p>
      ) : null}
      {canManage ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{t("src.chatType")}</Label>
            <Select value={chatType} onChange={(e) => setChatType(e.target.value)}>
              {CHAT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {t(`chat.${ct}` as TKey)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("src.customer")}</Label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">
                {chatType === "fleet" || chatType === "internal"
                  ? "— shared —"
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
              <div>
                <Label>{t("src.newCustomer")}</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div>
                <Label>{t("nav.dispatcher")}</Label>
                <Select value={dispatcher} onChange={(e) => setDispatcher(e.target.value)}>
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
            <p className="col-span-2 text-xs text-sev-5">{(m.error as Error).message}</p>
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
  const endRef = React.useRef<HTMLDivElement>(null);
  const count = q.data?.messages.length ?? 0;
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, channel.id]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <SourceIcon source={channel.source} />
        <h2 className="text-sm font-semibold">{channel.title}</h2>
        <ChatTypeChip type={channel.chatType} />
        {channel.customerName ? <Badge tone="outline">{channel.customerName}</Badge> : null}
        {channel.source === "demo" ? <DemoDataTag /> : null}
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
      <div className="max-h-[70vh] flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
        {q.isLoading ? (
          <LoadingRows rows={8} />
        ) : q.isError ? (
          <ErrorState message={t("common.error")} onRetry={() => q.refetch()} />
        ) : count === 0 ? (
          <EmptyState title={t("src.noMessages")} />
        ) : (
          q.data!.messages.map((m) => (
            <div
              key={m.id}
              className="flex gap-2 border-b border-dashed border-border/60 py-1.5 last:border-0"
            >
              <span className="w-32 shrink-0 whitespace-nowrap text-muted-foreground">{clock(m.sentAt, true)}</span>
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "font-semibold",
                    m.side === "customer" ? "text-chip-customer" : "text-foreground",
                  )}
                >
                  {m.sender}
                </span>
                <span className="ml-1 text-[10px] text-muted-foreground uppercase">
                  {t(`side.${m.side}` as TKey)}
                </span>
                {m.untrusted ? (
                  <span className="ml-1">
                    <UntrustedBadge />
                  </span>
                ) : null}
                {m.viaPulse ? (
                  <span className="ml-1 text-[10px] text-primary">via Pulse</span>
                ) : null}
                <div className="font-sans text-[13px] whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function TranscriptUpload({ channels }: { channels: Channel[] }) {
  const { t } = useT();
  const qc = useQueryClient();
  const customerChannels = channels.filter((c) => c.customerId);
  const [channelId, setChannelId] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  if (!customerChannels.length) return null;
  return (
    <Card>
      <div className="flex flex-col gap-2 px-3 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Upload className="size-4" /> {t("src.upload")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("src.uploadHint")}</p>
        <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">{t("src.customer")}…</option>
          {customerChannels
            .filter((c) => c.chatType === "customer")
            .map((c) => (
              <option key={c.id} value={c.customerId!}>
                {c.customerName}
              </option>
            ))}
        </Select>
        <input ref={fileRef} type="file" accept=".txt,text/plain" className="text-xs" />
        <Button
          size="sm"
          variant="outline"
          disabled={!channelId}
          onClick={async () => {
            setError(null);
            const file = fileRef.current?.files?.[0];
            if (!file) return;
            if (file.size > 200_000) return setError("File too large (max 200 KB)");
            try {
              const res = await apiPost<{ lines: number }>("/api/transcripts", {
                customerId: channelId,
                name: file.name,
                content: await file.text(),
              });
              setResult(t("src.uploadDone", { n: res.lines }));
              qc.invalidateQueries({ queryKey: ["sources"] });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {t("src.upload")}
        </Button>
        {result ? <p className="text-xs text-ok">{result}</p> : null}
        {error ? <p className="text-xs text-sev-5">{error}</p> : null}
      </div>
    </Card>
  );
}
