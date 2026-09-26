import { describe, expect, it } from "vitest";
import { wordDiff } from "@/lib/diff";

describe("wordDiff", () => {
  it("marks inserted and removed words", () => {
    const d = wordDiff("ETA to Memphis around 4:30 PM.", "ETA to Memphis 4:30 PM CST.");
    expect(d.filter((p) => p.type === "del").map((p) => p.text.trim())).toEqual(["around", "PM."]);
    expect(d.filter((p) => p.type === "add").map((p) => p.text.trim()).join(" ")).toContain("CST.");
    const rebuilt = d.filter((p) => p.type !== "del").map((p) => p.text).join("");
    expect(rebuilt).toBe("ETA to Memphis 4:30 PM CST.");
  });
  it("identical text is one same part", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ type: "same", text: "a b" }]);
  });
});
