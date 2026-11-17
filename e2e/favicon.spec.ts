import { expect, test } from "@playwright/test";

// Favicons only need checking once, not at every screen size.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-1440", "checked once at desktop size");
});

const FILES: [string, RegExp][] = [
  ["/favicon.ico", /image\/(x-icon|vnd\.microsoft\.icon)/],
  ["/icon.svg", /image\/svg\+xml/],
  ["/apple-touch-icon.png", /image\/png/],
  ["/icon-192.png", /image\/png/],
  ["/icon-512.png", /image\/png/],
  ["/manifest.webmanifest", /application\/manifest\+json|application\/json/],
];

for (const [path, type] of FILES) {
  test(`${path} is served`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(type);
  });
}

test("index.html links the icons and the manifest", async ({ page }) => {
  await page.goto("/sign-in");
  const hrefs = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
    .evaluateAll((links) => links.map((l) => l.getAttribute("href")));
  expect(hrefs).toEqual([
    "/favicon.ico",
    "/icon.svg",
    "/apple-touch-icon.png",
    "/manifest.webmanifest",
  ]);
});

test("manifest icons exist and match their declared size", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("browser");
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    const buf = await res.body();
    const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)]; // PNG IHDR width/height
    expect(`${w}x${h}`).toBe(icon.sizes);
  }
});
