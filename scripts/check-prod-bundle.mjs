#!/usr/bin/env node
/**
 * Runs after `vite build`. Fails the build if dev-only code reached the production bundle
 * (the /dev/components gallery must only exist in development builds).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FORBIDDEN = ["dev/components", "ComponentsGallery", "Open responsive dialog"];

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)],
  );
}

const hits = files(DIST)
  .filter((f) => /\.(js|html|css)$/.test(f))
  .flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return FORBIDDEN.filter((s) => text.includes(s)).map((s) => `${f}: "${s}"`);
  });

if (hits.length) {
  console.error("✗ Dev-only code found in the production build:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log("✓ Production bundle has no dev-only routes.");
