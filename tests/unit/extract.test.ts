import { describe, expect, it } from "vitest";
import {
  claimsNoInfo,
  complaintSeverity,
  deliversResult,
  detectRequest,
  extractLane,
  extractRefs,
  extractTimes,
  extractTrucks,
  isEtaInfo,
  isRude,
  isTruckOffer,
  mentionsCity,
  parseDeadline,
  firstName,
} from "@/lib/heuristics/extract";
import { localParts } from "@/lib/time";

const tz = "America/Chicago";
const base = new Date("2026-09-25T14:00:00Z"); // Fri 09:00 CDT

describe("mock extractors", () => {
  it("refs and trucks", () => {
    expect(extractRefs("Load 48230, rate $2,900. Can you cover?")).toEqual(["48230"]);
    expect(extractRefs("invoice #BR-2291 shows $1,480 but the rate con for S-5498")).toEqual([
      "BR-2291",
      "S-5498",
    ]);
    expect(extractRefs("POs 7781 / 7782")).toEqual(["7781", "7782"]);
    expect(extractRefs("38k lbs frozen, temp -10F at 16:30")).toEqual([]);
    expect(extractTrucks("По 48207: трак 214, водитель Санжар")).toEqual(["214"]);
    expect(extractTrucks("118-й освобождается сегодня вечером")).toEqual(["118"]);
    expect(extractTrucks("траки 402 и 415 свободны")).toEqual(["402", "415"]);
    expect(extractTrucks("truck #118 covers 48221")).toEqual(["118"]);
  });

  it("lanes in EN, with states, and 'from … to'", () => {
    expect(extractLane("Need a reefer Chicago IL → Dallas TX, PU tomorrow 6am")).toEqual({
      from: "Chicago IL",
      to: "Dallas TX",
    });
    expect(extractLane("Need a reefer PU tomorrow 7am Dallas → Atlanta, can you cover?")).toEqual({
      from: "Dallas",
      to: "Atlanta",
    });
    expect(extractLane("dry van load Peoria IL → St. Louis MO, PU")).toEqual({
      from: "Peoria IL",
      to: "St. Louis MO",
    });
    expect(extractLane("from our Milwaukee plant to Minneapolis, PU 6am")).toEqual({
      from: "Milwaukee",
      to: "Minneapolis",
    });
    expect(extractLane("Need the POD to close it out.")).toBeNull();
  });

  it("matches city names across scripts", () => {
    expect(mentionsCity("В Мемфисе будет примерно в 16:30", "Memphis")).toBe(true);
    expect(mentionsCity("Под Даллас на завтра могу дать 214-й", "Dallas TX")).toBe(true);
    expect(mentionsCity("в Нэшвилле будет к 14:15", "Nashville")).toBe(true);
    expect(mentionsCity("в Атланту", "Dallas")).toBe(false);
  });

  it("times with tomorrow and 24h clock", () => {
    const t = extractTimes("PU tomorrow 6am", base, tz);
    expect(localParts(t[0]!.at, tz)).toMatchObject({ d: 26, h: 6, min: 0 });
    const r = extractTimes("В Мемфисе будет примерно в 16:30 по нашему времени", base, tz);
    expect(localParts(r[0]!.at, tz)).toMatchObject({ d: 25, h: 16, min: 30 });
    const k = extractTimes("завтра к 8 будет в Peoria", base, tz);
    expect(localParts(k[0]!.at, tz)).toMatchObject({ d: 26, h: 8 });
  });

  it("deadlines promised by employees", () => {
    const pod = parseDeadline(
      "Yes, 48190 delivered at 7:40. Will send POD by 3pm today.",
      base,
      tz,
    )!;
    expect(localParts(pod, tz)).toMatchObject({ d: 25, h: 15, min: 0 });
    expect(
      parseDeadline("we'll confirm the truck on 48221 within 30 min", base, tz)!.getTime() -
        base.getTime(),
    ).toBe(30 * 60_000);
    expect(
      parseDeadline("Sure Jake, sending it within the hour.", base, tz)!.getTime() - base.getTime(),
    ).toBe(60 * 60_000);
    const det = parseDeadline("will send the detention paperwork tomorrow by 10am.", base, tz)!;
    expect(localParts(det, tz)).toMatchObject({ d: 26, h: 10 });
    expect(parseDeadline("Checking, will update shortly", base, tz)).toBeNull();
    expect(parseDeadline("ok", base, tz)).toBeNull();
  });

  it("requests", () => {
    expect(
      detectRequest(
        "Need a reefer Chicago IL → Dallas TX, PU tomorrow 6am. Load 48230, rate $2,900. Can you cover?",
      )?.kind,
    ).toBe("quote");
    expect(
      detectRequest("Hi team, need an ETA on load 48207 (Joliet → Memphis). Receiver is asking.")
        ?.kind,
    ).toBe("eta_update");
    expect(
      detectRequest(
        "Also - load 48190 delivered this morning in Indianapolis? Need the POD to close it out.",
      )?.kind,
    ).toBe("pod_bol");
    expect(
      detectRequest(
        "Hi, invoice #BR-2291 shows $1,480 but the rate con for S-5498 says $1,380. Please fix and resend the invoice.",
      )?.kind,
    ).toBe("invoice");
    expect(
      detectRequest(
        "Driver on S-5520 waited 3 hrs at the receiver. Please send the detention request with in/out times.",
      )?.kind,
    ).toBe("detention");
    expect(
      detectRequest("Can you move the S-5530 pickup from 10am to 1pm tomorrow? Shipper is delayed.")
        ?.kind,
    ).toBe("reschedule");
    expect(
      detectRequest(
        "Good morning, we need 2 reefers Thursday from our Milwaukee plant to Minneapolis, PU 6am and 9am. POs 7781 / 7782. Can you do both?",
      )?.kind,
    ).toBe("quote");
    expect(detectRequest("Rate con sent, thanks Timur 👍")).toBeNull();
    expect(detectRequest("Perfect, thank you!")).toBeNull();
    expect(detectRequest("Driver on PO 7781 just checked in at the plant, thanks!")).toBeNull();
  });

  it("tone, complaints, delivery", () => {
    expect(
      complaintSeverity("Timur, this is the third time we are chasing you for updates on 48207."),
    ).toBe(4);
    expect(complaintSeverity("If you can't cover, we'll give it to another carrier")).toBe(5);
    expect(complaintSeverity("Timur, any news on the reefer 48230 for tomorrow 6am?")).toBeNull();
    expect(isRude("Sarah I have 30 loads today, not just yours. Stop spamming the chat")).toBe(
      true,
    );
    expect(isRude("Morning Mike, got it. Checking which truck is closest.")).toBe(false);
    expect(claimsNoInfo("you will get the ETA when I have it.")).toBe(true);
    expect(
      isEtaInfo(
        "По 48207: трак 214 … В Мемфисе будет примерно в 16:30 по нашему времени, задержек нет.",
        base,
        tz,
      ),
    ).toBe(true);
    expect(
      isTruckOffer("118-й освобождается сегодня вечером в Bloomington, завтра к 8 будет в Peoria"),
    ).toBe(true);
    expect(
      deliversResult(
        "quote",
        "Confirmed: truck #118 covers 48221, PU tomorrow 8:00 at Peoria. Please send the rate con.",
        base,
        tz,
      ),
    ).toBe(true);
    expect(deliversResult("quote", "ok", base, tz)).toBe(false);
    expect(
      deliversResult("pod_bol", "Here is the BOL for S-5512 (attached: BOL_S-5512.pdf).", base, tz),
    ).toBe(true);
    expect(deliversResult("eta_update", "Checking, will update shortly", base, tz)).toBe(false);
    expect(firstName("Sarah Kim | Apex Tracking")).toBe("Sarah");
    expect(firstName("Mike Reynolds (Apex)")).toBe("Mike");
  });
});
