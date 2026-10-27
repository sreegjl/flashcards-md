// Renders docs/banner/banner.html to docs/banner.png (2x, transparent rounded corners).
//   npm run banner
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "banner.png");

// Fall back to Edge when Playwright's own Chromium hasn't been downloaded.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" }));
const page = await browser.newPage({ viewport: { width: 1280, height: 440 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(here, "banner.html")).href, { waitUntil: "networkidle" });
await page.evaluate(async () => {
	await Promise.all([400, 600].map((w) => document.fonts.load(`${w} 20px "Lexend"`)));
	await Promise.all([...document.images].map((img) => img.decode()));
});
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(`wrote ${path.relative(process.cwd(), out)}`);
