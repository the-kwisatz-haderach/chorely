import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: root });

async function lintTsx(file: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: `${root}${file}` });
  return result?.messages.filter((m) => m.severity === 2) ?? [];
}

async function lintCss(file: string, code: string) {
  const { results } = await stylelint.lint({ code, codeFilename: `${root}${file}`, cwd: root });
  return results[0]?.warnings ?? [];
}

const MODULE = "apps/web/src/ui/fixture.module.css";
const TOKENS = "apps/web/src/ui/tokens.css";

const rawColours: Array<[string, string]> = [
  ["hex", `.a { color: #2f6f4f; }`],
  ["named colour", `.a { background: white; }`],
  ["rgb()", `.a { border-color: rgb(0 0 0 / 50%); }`],
  ["hsl()", `.a { color: hsl(120 40% 30%); }`],
  ["oklch()", `.a { color: oklch(50% 0.1 150); }`],
  ["raw palette token", `.a { color: var(--palette-green-700); }`],
];

describe("raw colours in CSS (ADR 0005)", () => {
  it.each(rawColours)("rejects a %s outside tokens.css", async (_name, code) => {
    expect((await lintCss(MODULE, code)).length).toBeGreaterThan(0);
  });

  it("accepts semantic tokens, inherit and currentColor", async () => {
    const code = `.a { color: var(--color-text); background: var(--color-surface); border: 1px solid currentColor; fill: inherit; }`;
    expect(await lintCss(MODULE, code)).toEqual([]);
  });

  it("allows raw colours and palette tokens inside tokens.css", async () => {
    const code = `:root { --palette-green-700: #2f6f4f; --palette-white: white; --color-primary: var(--palette-green-700); }`;
    expect(await lintCss(TOKENS, code)).toEqual([]);
  });
});

describe("JSX style prop (ADR 0005)", () => {
  it("is rejected in the web app", async () => {
    const errors = await lintTsx("apps/web/src/app/fixture.tsx", `export const A = () => <p style={{ color: "red" }}>x</p>;`);
    expect(errors.map((e) => e.message)).toEqual([expect.stringContaining("No inline styles")]);
  });

  it("allows className", async () => {
    expect(await lintTsx("apps/web/src/app/fixture.tsx", `export const A = () => <p className="x">x</p>;`)).toEqual([]);
  });
});
