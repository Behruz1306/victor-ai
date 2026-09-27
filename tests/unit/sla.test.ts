import { describe, expect, it } from "vitest";
import { businessMinutes, evaluateSla, openCustomerQuestions, type SlaChannel, type SlaMessage, type SlaTask } from "@/lib/pipeline/sla";
import { DEFAULT_SLA } from "@/lib/types";
import { routeAudience } from "@/lib/pipeline/audience";
import { rankForOwner } from "@/lib/pipeline/digest";

const tz = "America/Chicago";
const T0 = new Date("2026-09-25T14:00:00Z"); // Fri 09:00 CDT
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function task(over: Partial<SlaTask>): SlaTask {
  return {
    id: "t1",
    customerId: "c1",
    customerName: "Apex",
    channelId: "ch1",
    kind: "quote",
    status: "received",
    title: { en: "Reefer", ru: "Реф" },
    requestedAt: T0,
    requestQuote: "Need a reefer",
    requestMessageId: "m1",
    ackAt: null,
    ackQuote: null,
    lastEventAt: T0,
    deadlineAt: null,
    responsibleUserId: "u1",
    hasEtaNotForwarded: false,
    ...over,
  };
}

const run = (now: Date, tasks: SlaTask[], channels: SlaChannel[] = []) =>
  evaluateSla({ now, timezone: tz, sla: DEFAULT_SLA, tasks, channels, customers: [] });

describe("SLA engine (fake clock)", () => {
  it("no_ack only after the ack SLA, escalating after 4 h", () => {
    expect(run(min(14), [task({})]).signals).toHaveLength(0);
    const s = run(min(16), [task({})]).signals;
    expect(s.map((x) => x.kind)).toEqual(["no_ack"]);
    expect(s[0]!.severity).toBe(3);
    expect(run(min(300), [task({})]).signals[0]!.severity).toBe(4);
  });

  it("overdue when the promised deadline passes; delivered tasks are ignored", () => {
    const t = task({ status: "deadline_set", deadlineAt: min(60) });
    expect(run(min(59), [t]).signals).toHaveLength(0);
    expect(run(min(61), [t]).signals.map((x) => x.kind)).toEqual(["overdue"]);
    expect(run(min(61), [{ ...t, status: "delivered" }]).signals).toHaveLength(0);
  });

  it("ETA requests have an implicit deadline, but the precise AI signal wins", () => {
    const t = task({ kind: "eta_update", status: "acknowledged", ackAt: min(2) });
    expect(run(min(61), [t]).signals.map((x) => x.kind)).toEqual(["overdue"]);
    expect(run(min(61), [{ ...t, hasEtaNotForwarded: true }]).signals).toHaveLength(0);
  });

  it("acknowledged without progress → missing_deadline with a stuck reason", () => {
    const t = task({ status: "acknowledged", ackAt: min(13), ackQuote: "ok" });
    expect(run(min(120), [t]).signals).toHaveLength(0);
    const r = run(min(13 + 800), [t]);
    expect(r.signals[0]!.kind).toBe("missing_deadline");
    expect(r.signals[0]!.severity).toBe(4);
    expect(r.patches[0]!.stuckReason?.en).toMatch(/“ok”/);
  });

  it("reply_needed skips closing pleasantries and requests already covered by no_ack", () => {
    const msg = (text: string, closing = false, taskIds: string[] = []): SlaMessage => ({
      id: "m9",
      side: "customer",
      sentAt: T0,
      text,
      senderName: "Mike",
      closing,
      taskIds,
    });
    const ch = (recent: SlaMessage[]): SlaChannel => ({
      id: "ch1",
      customerId: "c1",
      customerName: "Apex",
      chatType: "customer",
      title: "Apex",
      responsibleUserId: "u1",
      recent,
    });
    expect(run(min(30), [], [ch([msg("any news on 48230?")])]).signals.map((s) => s.kind)).toEqual([
      "reply_needed",
    ]);
    expect(run(min(30), [], [ch([msg("Perfect, thank you!", true)])]).signals).toHaveLength(0);
    // The request created a task nobody acknowledged: no_ack says it, not reply_needed.
    const t = task({ id: "t9", status: "received" });
    expect(run(min(30), [t], [ch([msg("Need a reefer", false, ["t9"])])]).signals.map((s) => s.kind)).toEqual([
      "no_ack",
    ]);
  });

  describe("reply_needed is tracked per task, not per chat", () => {
    const at = (m: number) => new Date(T0.getTime() + m * 60_000);
    const m = (id: string, side: string, minute: number, text: string, taskIds: string[] = []): SlaMessage => ({
      id,
      side,
      sentAt: at(minute),
      text,
      senderName: side === "customer" ? "Mike" : "Timur",
      closing: false,
      taskIds,
    });
    const chat = (recent: SlaMessage[]): SlaChannel => ({
      id: "ch1",
      customerId: "c1",
      customerName: "Apex",
      chatType: "customer",
      title: "Apex ↔ Blue Ridge",
      responsibleUserId: "u1",
      recent,
    });
    const tA = task({ id: "tA", status: "acknowledged", ackAt: at(0), title: { en: "Reefer 48230", ru: "Реф 48230" } });
    const tB = task({ id: "tB", status: "in_progress", title: { en: "POD 48190", ru: "POD 48190" } });

    it("a reply about another task does not clear the earlier question", () => {
      const recent = [
        m("q1", "customer", 0, "Any news on the reefer 48230?", ["tA"]),
        m("q2", "customer", 5, "Also need the POD for 48190", ["tB"]),
        m("r1", "employee", 10, "POD for 48190 coming in 20 min", ["tB"]),
      ];
      const r = evaluateSla({ now: at(45), timezone: tz, sla: DEFAULT_SLA, tasks: [tA, tB], channels: [chat(recent)], customers: [] });
      const reply = r.signals.filter((s) => s.kind === "reply_needed");
      expect(reply).toHaveLength(1);
      expect(reply[0]).toMatchObject({ taskId: "tA", evidenceMessageId: "q1", dedupeKey: "reply_needed:ch1:tA" });
      expect(reply[0]!.reason.en).toMatch(/not about this/);
    });

    it("a reply about that task clears it; so does closing the task", () => {
      const answered = [
        m("q1", "customer", 0, "Any news on the reefer 48230?", ["tA"]),
        m("r1", "employee", 10, "Mike, truck 214 confirmed for 48230", ["tA"]),
      ];
      expect(
        evaluateSla({ now: at(45), timezone: tz, sla: DEFAULT_SLA, tasks: [tA], channels: [chat(answered)], customers: [] })
          .signals.filter((s) => s.kind === "reply_needed"),
      ).toHaveLength(0);
      const closed = [m("q1", "customer", 0, "Any news on 48230?", ["tA"])];
      expect(
        evaluateSla({ now: at(45), timezone: tz, sla: DEFAULT_SLA, tasks: [], channels: [chat(closed)], customers: [] })
          .signals,
      ).toHaveLength(0);
    });

    it("heuristic fallback: an unlinked reply answers the only open question, not one of several", () => {
      const single = [m("q1", "customer", 0, "Any news on 48230?", ["tA"]), m("r1", "employee", 5, "Checking now")];
      expect(openCustomerQuestions(single, new Set(["tA"]))).toHaveLength(0);
      const two = [
        m("q1", "customer", 0, "Any news on 48230?", ["tA"]),
        m("q2", "customer", 1, "And the POD for 48190?", ["tB"]),
        m("r1", "employee", 5, "Checking now"),
      ];
      expect(openCustomerQuestions(two, new Set(["tA", "tB"])).map((q) => q.id)).toEqual(["q1", "q2"]);
      const unlinked = [m("q1", "customer", 0, "Hello? Anyone?"), m("r1", "employee", 5, "Here, sorry")];
      expect(openCustomerQuestions(unlinked, new Set())).toHaveLength(0);
    });
  });

  it("business hours: only minutes inside the window count", () => {
    const sla = {
      ...DEFAULT_SLA,
      businessHours: { start: "08:00", end: "17:00", days: [1, 2, 3, 4, 5] },
    };
    // Fri 16:30 → Mon 08:30 CDT: 30 min Friday + 30 min Monday
    const from = new Date("2026-09-25T21:30:00Z");
    const to = new Date("2026-09-28T13:30:00Z");
    expect(businessMinutes(from, to, sla, tz)).toBe(60);
  });
});

describe("audience routing and owner ranking", () => {
  const criteria = {
    items: [{ id: "a", text: "rudeness", kinds: ["rude_tone"], customerIds: [], minSeverity: 1 }],
  };
  it("routes by severity and owner criteria", () => {
    expect(routeAudience(2, "reply_needed", null, { items: [] })).toBe("dispatcher");
    expect(routeAudience(3, "reply_needed", null, { items: [] })).toBe("lead");
    expect(routeAudience(4, "overdue", null, { items: [] })).toBe("owner");
    expect(routeAudience(2, "rude_tone", null, criteria)).toBe("owner");
  });
  it("ranks at most 5 by severity, recency and criteria", () => {
    const now = new Date("2026-09-26T15:00:00Z");
    const list = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      kind: (i === 7 ? "rude_tone" : "overdue") as "overdue",
      severity: i === 0 ? 5 : 4,
      customerId: null,
      createdAt: new Date(now.getTime() - i * 3_600_000),
    }));
    const r = rankForOwner(list, criteria, now);
    expect(r).toHaveLength(5);
    // The critical one and the owner-criteria match (despite being oldest) lead the list.
    expect(new Set(r.slice(0, 2).map((x) => x.id))).toEqual(new Set(["s0", "s7"]));
  });
});
