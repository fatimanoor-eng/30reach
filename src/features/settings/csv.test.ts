import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, toCsv } from "./csv";

describe("CSV for the Settings exports", () => {
  it("leaves plain text and numbers alone; empty for null", () => {
    expect(csvCell("Hims")).toBe("Hims");
    expect(csvCell(9800)).toBe("9800");
    expect(csvCell(-3)).toBe("-3"); // a real number, not a formula
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(true)).toBe("yes");
  });

  it("quotes commas, quotes, line breaks and edge spaces; doubles quotes", () => {
    expect(csvCell("eat, then go")).toBe('"eat, then go"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvCell(" padded")).toBe('" padded"');
  });

  it("never lets a spreadsheet run a caption as a formula", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1 tip")).toBe("'+1 tip");
    expect(csvCell("-30% off")).toBe("'-30% off");
    expect(csvCell("@hims")).toBe("'@hims");
  });

  it("header + rows, CRLF, with the UTF-8 mark for Excel; emoji survive", () => {
    const csv = toCsv(
      [
        { a: "x", b: 1 },
        { a: "🎯 y", b: null },
      ],
      [
        { label: "A", value: (r) => r.a },
        { label: "B", value: (r) => r.b },
      ],
    );
    expect(csv).toBe("﻿A,B\r\nx,1\r\n🎯 y,\r\n");
  });

  it("file names: client slug, what, date", () => {
    expect(csvFileName("OBU Health", "posts", "2026-11-20")).toBe(
      "30reach-obu-health-posts-2026-11-20.csv",
    );
    expect(csvFileName("Café & Co.", "ideas", "2026-11-20")).toBe(
      "30reach-cafe-co-ideas-2026-11-20.csv",
    );
  });
});
