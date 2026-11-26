import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * 26 Nov 2026 outage: scan-site imported the logo code at start-up; the npm build of ImageScript looks for a
 * native Node binary, which the edge runtime doesn't have, so every request (even OPTIONS) failed with 500.
 * Guard: only logo-safe.ts may load logo-image.ts, and only lazily; nothing may use the npm build.
 */
const root = join(__dirname, "..");
const files = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("logo code can't take a function down", () => {
  it("no function imports logo-image.ts statically", () => {
    for (const f of files) {
      if (f.endsWith("logo-safe.ts")) continue;
      const src = readFileSync(join(root, f), "utf8");
      expect(src, f).not.toMatch(/^\s*import[^(]*["'][^"']*logo-image\.ts["']/m);
      expect(src, f).not.toMatch(/import\(\s*["'][^"']*logo-image\.ts["']\s*\)/);
    }
  });
  it("logo-safe loads it lazily, inside a catch", () => {
    const src = readFileSync(join(root, "_shared/logo-safe.ts"), "utf8");
    expect(src).toMatch(/import\("\.\/logo-image\.ts"\)\.catch\(/);
    expect(src).not.toMatch(/^import [^t].*logo-image/m); // only `import type`
  });
  it("only ImageScript's Deno build, never the npm one", () => {
    for (const f of files) {
      const src = readFileSync(join(root, f), "utf8");
      expect(src, f).not.toMatch(/npm:imagescript/);
    }
  });
});
