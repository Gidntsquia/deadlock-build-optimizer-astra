import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { generateBuilds } from "../src/generator";
import { statLines, descriptions } from "../src/assetText";
import type { AggregateData } from "../src/types";
const read = (name: string) =>
  JSON.parse(fs.readFileSync(`public/data/${name}.json`, "utf8"));
const data: AggregateData = {
  heroes: read("heroes"),
  items: read("items"),
  abilities: read("abilities"),
  weapons: read("weapons"),
  analytics: read("analytics"),
};
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = createServer((req, res) => {
  const pathname = new URL(req.url!, "http://localhost").pathname;
  const file = path.resolve(
    "dist",
    `.${pathname === "/" ? "/index.html" : pathname}`,
  );
  if (!file.startsWith(path.resolve("dist") + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = (server.address() as import("node:net").AddressInfo).port;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
fs.mkdirSync("verification", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const external: string[] = [],
    errors: string[] = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).hostname !== "127.0.0.1") {
      external.push(url);
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  async function layout() {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= 390),
    ).toBeTruthy();
    const bad = await page
      .locator("button,select,a,summary")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width && r.height && (r.width < 40 || r.height < 40);
          })
          .map((e) => ({
            text: e.textContent,
            rect: e.getBoundingClientRect().toJSON(),
          })),
      );
    expect(bad).toEqual([]);
  }
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(
    page.getByRole("heading", { name: "Infernus", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".item-row")).toHaveCount(15);
  await layout();
  await page.screenshot({ path: "verification/mobile-first-screen.png" });
  await page.screenshot({
    path: "verification/mobile-items.png",
    fullPage: true,
  });
  const infernus = generateBuilds(data, 1);
  let dialogs = 0;
  for (let index = 0; index < 2; index++) {
    await page.locator(".build-option").nth(index).click();
    for (const buy of infernus[index].items) {
      const item = data.items.find((i) => i.id === buy.itemId)!;
      const row = page.locator(`[data-item-id="${item.id}"]`);
      await row.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          row
            .locator("img")
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0);
      await row.tap();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: item.name, exact: true }),
      ).toBeVisible();
      await expect(dialog.locator(".detail-hero")).toContainText(
        `${item.item_slot_type} · TIER ${item.item_tier}`,
      );
      await expect(dialog.locator(".detail-hero")).toContainText(
        item.cost.toLocaleString("en-US"),
      );
      const img = dialog.locator(".detail-hero img");
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
        .toBeGreaterThan(0);
      expect(await img.getAttribute("src")).toBe(
        "./" + read("images")[`item-${item.id}`],
      );
      for (const s of statLines(item)) {
        await expect(dialog.locator(".stat-grid")).toContainText(s.value);
        await expect(dialog.locator(".stat-grid")).toContainText(s.label);
      }
      for (const d of descriptions(item)) {
        await expect(dialog.locator(".item-descriptions")).toContainText(
          d.text,
        );
      }
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBeTruthy();
      await layout();
      if (dialogs === 0)
        await page.screenshot({ path: "verification/mobile-item-detail.png" });
      await page.getByRole("button", { name: "Close item details" }).click();
      await expect(dialog).toHaveCount(0);
      dialogs++;
    }
  }
  await page.getByRole("button", { name: "Abilities", exact: true }).click();
  await expect(page.locator(".ability-sequence li")).toHaveCount(16);
  await layout();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "verification/mobile-abilities.png",
    fullPage: true,
  });
  for (const a of infernus[0].abilityOrder)
    await expect(page.locator(".ability-key")).toContainText(a.name);
  await page.getByRole("button", { name: "Validation", exact: true }).click();
  await expect(page.locator(".validation-score")).toBeVisible();
  await page.locator("summary").click();
  await layout();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "verification/mobile-validation.png",
    fullPage: true,
  });
  // All active heroes, both approaches, all three views. This exceeds the three-hero criterion.
  for (const hero of data.heroes) {
    await page.getByLabel("Select hero").selectOption(String(hero.id));
    await expect(
      page.getByRole("heading", { name: hero.name, exact: true }),
    ).toBeVisible();
    for (let index = 0; index < 2; index++) {
      await page.locator(".build-option").nth(index).click();
      await page.getByRole("button", { name: "Items", exact: true }).click();
      await expect(page.locator(".item-row")).toHaveCount(15);
      await layout();
      await page
        .getByRole("button", { name: "Abilities", exact: true })
        .click();
      await expect(page.locator(".ability-sequence li")).toHaveCount(16);
      await expect(page.locator(".ability-board")).toBeVisible();
      await expect(page.locator(".timeline-phone .point-marker")).toHaveCount(
        16,
      );
      await expect(page.locator(".timeline-phone .point-unlock")).toHaveCount(
        4,
      );
      await layout();
      await page
        .getByRole("button", { name: "Validation", exact: true })
        .click();
      await layout();
    }
  }
  await page.getByLabel("Select hero").selectOption("1");
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page.locator(".item-row").first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".item-row").first()).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "verification/desktop.png", fullPage: true });
  expect(
    await page
      .locator(".app-shell")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(680);
  // New context, empty cache, every external request disabled: no CDN or remote API dependency.
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  const result = {
    testedAt: new Date().toISOString(),
    viewport: "390×844",
    productionBuild: true,
    externalNetwork: "blocked",
    externalRequests: external,
    consoleErrors: errors,
    heroesTested: data.heroes.length,
    buildsPerHero: 2,
    viewsPerBuild: 3,
    detailCardsVerified: dialogs,
    keyboardEscapeAndFocus: true,
    horizontalOverflow: false,
    tapTargetsAtLeast40px: true,
  };
  fs.writeFileSync(
    "verification/browser-report.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
