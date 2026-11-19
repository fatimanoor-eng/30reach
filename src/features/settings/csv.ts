// CSV for the Settings exports (13 › Data). Built in the browser; opens cleanly in Excel, Numbers
// and Google Sheets. Pure, tested in csv.test.ts.

export type CsvColumn<T> = { label: string; value: (row: T) => string | number | boolean | null };

/** UTF-8 byte-order mark: Excel then reads accents and emoji correctly. */
const BOM = "﻿";

/**
 * One cell. Text that a spreadsheet would run as a formula (= + - @, tab, carriage return at the
 * start) gets a leading ' so it stays text (captions are written by other people). Cells with a
 * comma, quote, line break or edge space are quoted, quotes doubled. Numbers are left as numbers.
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header row + one row per item, CRLF line ends (what Excel expects), with the BOM. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => csvCell(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")),
  ];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

/** "30reach-obu-health-posts-2026-11-20.csv" */
export function csvFileName(clientName: string, what: string, today: string): string {
  const slug = clientName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
  return `30reach-${slug || "client"}-${what}-${today}.csv`;
}

/** Saves the text as a file (browser only). */
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
