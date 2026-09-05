import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { generateBuilds } from "../src/generator";
import { loadValidation, computeCore, validateBuild } from "../src/validation";
import type { AggregateData } from "../src/types";
const read = async (name: string) =>
  JSON.parse(await fs.readFile(`public/data/${name}.json`, "utf8"));
const data: AggregateData = {
  heroes: await read("heroes"),
  items: await read("items"),
  abilities: await read("abilities"),
  weapons: await read("weapons"),
  analytics: await read("analytics"),
};
const generated = generateBuilds(data, 1);
await fs.mkdir("verification", { recursive: true });
// Persist the generated plans before the held-out file can be opened.
await fs.writeFile(
  "verification/generated-infernus.json",
  JSON.stringify(generated, null, 2),
);
const generatorSha256 = createHash("sha256")
  .update(await fs.readFile("src/generator.ts"))
  .digest("hex");
const matches = await loadValidation("public/", async (url) => ({
  ok: true,
  json: async () => JSON.parse(await fs.readFile(url, "utf8")),
}));
const core = computeCore(matches);
const reports = generated.map((b) => ({
  name: b.name,
  ...validateBuild(b, core),
}));
await fs.writeFile(
  "verification/validation-report.json",
  JSON.stringify(
    {
      evaluatedAt: new Date().toISOString(),
      generatorSha256,
      sampleSize: matches.length,
      rule: "Unweighted frequency >=30%; wins weighted 1.5x in overlap and timing; experiments excluded",
      reports,
      core,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(reports, null, 2));
