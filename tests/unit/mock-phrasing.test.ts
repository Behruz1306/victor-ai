import { describe, expect, it } from "vitest";
import {
  complaintSeverity,
  detectRequest,
  equipmentOf,
  extractLane,
  isRude,
} from "@/lib/heuristics/extract";
import { mockCustomerAnalysis } from "@/lib/llm/mock/analysis";
import type { AnalysisInput, CtxMessage } from "@/lib/pipeline/types";
import { DEFAULT_SLA } from "@/lib/types";

// Offline fallback must survive improvised demo messages: 40+ extra EN/RU trucking phrasings.

const REQUESTS: [string, string][] = [
  // load requests / quotes
  ["Got a load out of Houston TX going to Phoenix AZ, flatbed, can you haul it?", "quote"],
  ["Can you run 2 vans Dallas → Houston on Monday?", "quote"],
  ["Need a 53' dry van PU Friday Columbus OH → Detroit MI", "quote"],
  ["Looking for capacity Chicago to Denver, 44k lbs, rate $3,100", "quote"],
  ["Hot load! Memphis → Nashville, PU in 2 hours, interested?", "quote"],
  ["Rate request: Savannah GA → Charlotte NC, dry van", "quote"],
  ["Posting a load 48301 Kansas City to Omaha, interested?", "quote"],
  ["Нужен реф на завтра Чикаго → Даллас, сможете взять?", "quote"],
  ["Есть груз 48310 из Атланты в Майами, возьмёте?", "quote"],
  ["Нужна фура на понедельник Хьюстон → Даллас", "quote"],
  // truck availability
  ["Do you have a reefer available in Atlanta tomorrow?", "truck_availability"],
  ["Any trucks available near Memphis for Monday?", "truck_availability"],
  ["Есть свободный трак в районе Мемфиса на завтра?", "truck_availability"],
  // ETA / status
  ["What's the ETA on 48207?", "eta_update"],
  ["Where's my truck on load 48240?", "eta_update"],
  ["When will 48260 deliver?", "eta_update"],
  ["How far out is the driver on 48270?", "eta_update"],
  ["Is 48280 still on time for the 2pm appt?", "eta_update"],
  ["Где сейчас трак по грузу 48290?", "eta_update"],
  ["Когда будет на выгрузке 48291?", "eta_update"],
  // POD / BOL
  ["Pls send POD for 48190", "pod_bol"],
  ["Can we get the signed BOL on S-5530?", "pod_bol"],
  ["Need paperwork for 48300 — POD and lumper receipt", "pod_bol"],
  ["Скиньте POD по 48190", "pod_bol"],
  ["Пришлите документы по 48300, пожалуйста", "pod_bol"],
  // detention
  ["Driver sat 4 hours at the shipper, we need detention paid", "detention"],
  ["Truck was held at the receiver for 5 hrs on S-5540", "detention"],
  ["Водитель простоял 4 часа на выгрузке, нужен детеншн", "detention"],
  // invoice
  ["Инвойс BR-2300 неверный, исправьте сумму", "invoice"],
];

const COMPLAINTS: [string, number][] = [
  ["This is getting old, we asked 2 hours ago", 4],
  ["Very poor communication today", 4],
  ["Why is nobody answering?", 4],
  ["Been waiting for hours on this", 4],
  ["Still no ETA on 48207…", 4],
  ["Уже третий час ждём ответа", 4],
  ["Это уже ни в какие ворота", 4],
  ["We will have to take our freight elsewhere if this continues", 5],
  ["Если так дальше, заберём грузы", 5],
];

const RUDE = [
  "Not my job to chase your receiver",
  "I'll get to it when I get to it",
  "You people are impossible",
  "Stop texting me every 5 minutes",
  "Don't rush me",
  "Не пишите мне каждые 5 минут",
  "Мне некогда с вами",
  "Сами виноваты",
];

const NOT_RUDE = [
  "Thanks Mike, checking now",
  "Sorry for the delay, sending the POD now",
  "Сейчас уточню и напишу",
];

describe("mock phrasing coverage (EN/RU)", () => {
  it.each(REQUESTS)("request: %s → %s", (text, kind) => {
    expect(detectRequest(text)?.kind).toBe(kind);
  });

  it.each(COMPLAINTS)("complaint: %s → severity %i", (text, sev) => {
    expect(complaintSeverity(text)).toBe(sev);
  });

  it.each(RUDE)("rude: %s", (text) => {
    expect(isRude(text)).toBe(true);
  });

  it.each(NOT_RUDE)("professional stays clean: %s", (text) => {
    expect(isRude(text)).toBe(false);
    expect(complaintSeverity(text)).toBeNull();
  });

  it("lanes: 'out of … going to …' and Russian 'из … в …'", () => {
    expect(extractLane("Got a load out of Houston TX going to Phoenix AZ")).toEqual({
      from: "Houston TX",
      to: "Phoenix AZ",
    });
    expect(extractLane("Есть груз из Атланты в Майами")).toEqual({ from: "Атланты", to: "Майами" });
  });

  it("Russian equipment slang", () => {
    expect(equipmentOf("Нужна фура на понедельник")).toBe("dry van");
    expect(equipmentOf("Нужна площадка под трубы")).toBe("flatbed");
  });
});

describe("mock analysis end to end on improvised messages", () => {
  const now = new Date("2026-09-26T15:00:00Z");
  const msg = (
    id: string,
    text: string,
    side: CtxMessage["side"],
    min: number,
    sender = "Mike",
  ): CtxMessage => ({
    id,
    dbId: `db-${id}`,
    channelId: "c1",
    chatType: "customer",
    channelTitle: "Apex live",
    side,
    senderName: sender,
    userName: side === "employee" ? "Timur" : null,
    text,
    sentAt: new Date(now.getTime() - min * 60_000),
    untrusted: false,
    replyToId: null,
  });
  const input = (messages: CtxMessage[]): AnalysisInput => ({
    now,
    company: {
      name: "Blue Ridge Freight LLC",
      timezone: "America/Chicago",
      sla: DEFAULT_SLA,
      watchCriteria: { items: [] },
    },
    customer: { name: "Apex Logistics", kind: "broker", brief: "", assigneeName: "Timur" },
    channels: [
      {
        id: "c1",
        dbId: "db-c1",
        title: "Apex live",
        chatType: "customer",
        shared: false,
        lang: "en",
      },
    ],
    messages,
    tasks: [],
    rules: [],
    recentEdits: [],
  });

  it("a Russian load request in a customer chat becomes a task with a reply suggestion", () => {
    const out = mockCustomerAnalysis(
      input([
        msg("m1", "Нужен реф на завтра Чикаго → Даллас, сможете взять?", "customer", 3, "Олег"),
      ]),
    );
    expect(out.task_updates[0]?.new_task?.kind).toBe("quote");
    expect(out.task_updates[0]?.new_task?.title.en).toMatch(/→/);
    expect(out.suggestions.length).toBe(1);
  });

  it("an improvised complaint and a rude reply are flagged", () => {
    const out = mockCustomerAnalysis(
      input([
        msg("m1", "What's the ETA on 48207?", "customer", 90),
        msg("m2", "Been waiting for hours on this, nobody is answering", "customer", 30),
        msg(
          "m3",
          "You people are impossible, I'll get to it when I get to it",
          "employee",
          20,
          "Timur",
        ),
      ]),
    );
    const kinds = out.quality_flags.map((f) => f.kind);
    expect(kinds).toContain("complaint");
    expect(kinds).toContain("rude_tone");
  });
});
