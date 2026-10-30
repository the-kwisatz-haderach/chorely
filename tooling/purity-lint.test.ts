import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: root });

async function lint(file: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: `${root}${file}` });
  return result?.messages.filter((m) => m.severity === 2) ?? [];
}

const impure: Array<[string, string]> = [
  ["node: import", `import { readFileSync } from "node:fs"; export const f = readFileSync;`],
  ["bare Node builtin import", `import path from "path"; export const p = path;`],
  ["process global", `export const env = process.env;`],
  ["Buffer global", `export const b = Buffer.from("x");`],
  ["document global", `export const t = document.title;`],
  ["window global", `export const w = window.location;`],
  ["localStorage global", `export const s = localStorage.getItem("x");`],
  ["require", `export const f = require("fs");`],
];

describe.each(["packages/domain/src/fixture.ts", "packages/api-client/src/fixture.ts"])("purity rule in %s", (file) => {
  it.each(impure)("fails on %s", async (_name, code) => {
    expect((await lint(file, code)).length).toBeGreaterThan(0);
  });

  it("accepts pure code, including JSON and Math", async () => {
    expect(await lint(file, `export const f = (s: string) => Math.max(JSON.parse(s));`)).toEqual([]);
  });
});

describe("outside the shared packages", () => {
  it("allows Node APIs in the web app", async () => {
    expect(await lint("apps/web/src/server/fixture.ts", `import fs from "node:fs"; export const e = [fs, process.env];`)).toEqual([]);
  });
});
