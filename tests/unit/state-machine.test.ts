import { describe, expect, it } from "vitest";
import { planTransition } from "@/lib/pipeline/state-machine";

const iso = "2026-09-25T15:00:00-05:00";

describe("task state machine", () => {
  it("creates a task at received", () => {
    const p = planTransition({
      current: null,
      proposed: "received",
      evidenceExists: true,
      deadline: null,
    });
    expect(p).toMatchObject({ ok: true, steps: ["received"], closed: false });
  });

  it("moves forward one step", () => {
    const p = planTransition({
      current: "received",
      proposed: "acknowledged",
      evidenceExists: true,
      deadline: null,
    });
    expect(p).toMatchObject({ ok: true, steps: ["acknowledged"] });
  });

  it("rejects backward and same-status moves", () => {
    expect(
      planTransition({
        current: "in_progress",
        proposed: "acknowledged",
        evidenceExists: true,
        deadline: null,
      }),
    ).toEqual({ ok: false, reason: "not_forward" });
    expect(
      planTransition({
        current: "acknowledged",
        proposed: "acknowledged",
        evidenceExists: true,
        deadline: null,
      }),
    ).toEqual({ ok: false, reason: "not_forward" });
  });

  it("requires evidence", () => {
    expect(
      planTransition({
        current: "received",
        proposed: "delivered",
        evidenceExists: false,
        deadline: null,
      }),
    ).toEqual({ ok: false, reason: "evidence_missing" });
  });

  it("never sets deadline_set without a parseable deadline", () => {
    const p = planTransition({
      current: "acknowledged",
      proposed: "deadline_set",
      evidenceExists: true,
      deadline: "by 3pm",
    });
    expect(p).toMatchObject({ ok: true, steps: ["in_progress"], deadlineAt: null });
    expect(
      planTransition({
        current: "in_progress",
        proposed: "deadline_set",
        evidenceExists: true,
        deadline: null,
      }),
    ).toEqual({ ok: false, reason: "deadline_missing" });
  });

  it("jump with deadline logs implied steps and the deadline", () => {
    const p = planTransition({
      current: "received",
      proposed: "deadline_set",
      evidenceExists: true,
      deadline: iso,
    });
    expect(p.ok && p.steps).toEqual(["acknowledged", "in_progress", "deadline_set"]);
    expect(p.ok && p.deadlineAt?.toISOString()).toBe("2026-09-25T20:00:00.000Z");
  });

  it("delivery skips an unproven deadline step and closes the task", () => {
    const p = planTransition({
      current: "acknowledged",
      proposed: "delivered",
      evidenceExists: true,
      deadline: null,
    });
    expect(p).toMatchObject({ ok: true, steps: ["in_progress", "delivered"], closed: true });
  });

  it("terminal tasks do not move; cancel works from any open state", () => {
    expect(
      planTransition({
        current: "delivered",
        proposed: "cancelled",
        evidenceExists: true,
        deadline: null,
      }),
    ).toEqual({ ok: false, reason: "terminal" });
    expect(
      planTransition({
        current: "in_progress",
        proposed: "cancelled",
        evidenceExists: true,
        deadline: null,
      }),
    ).toMatchObject({ ok: true, steps: ["cancelled"], closed: true });
  });
});
