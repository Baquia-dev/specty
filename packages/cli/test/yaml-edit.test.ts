// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { editYaml } from "../src/io/yaml-edit";

/** A configuration written as this repository's: comments, quotes, flow lists over several lines. */
const TEXT = `# Configuración de Specty. Referencia: docs/formats.md §6
version: 1
language: es
# Rutas donde rige el flujo.
governed: ["**"]
sensitive:
  ["**/migrations/**", "**/auth/**"]
verify:
  default: "pnpm test"
  full: "pnpm check"  # la completa
  timeoutSec: 2000
  units:
    - name: estático
      command: "pnpm lint"
      paths:
        [
          "packages/**",
          "package.json",
        ]
    - name: core
      command: "pnpm --filter core test"
      paths: ["packages/core/**"]

scope:
  implicitTests: true
  autoApprove: tests-and-generated
split:
  maxModules: 3
review: { command: "revisa", timeoutSec: 60 }
lines:
  exclude: ["a.ts", "b.ts"]
`;

/** The text `editYaml` gives, failing the test when it gives an issue instead. */
function edited(text: string, edits: Parameters<typeof editYaml>[1]): string {
  const result = editYaml(text, edits);
  if (!result.ok) throw new Error(`${result.issue.path}: ${result.issue.message}`);
  return result.text;
}

describe("editing keys of a YAML text", () => {
  it("AC2: replaces only the value of a key, keeping its quotes, its comment and every other byte", () => {
    expect(edited(TEXT, [{ path: ["verify", "timeoutSec"], value: 900 }])).toBe(
      TEXT.replace("  timeoutSec: 2000\n", "  timeoutSec: 900\n"),
    );
    expect(edited(TEXT, [{ path: ["verify", "full"], value: "pnpm verify" }])).toBe(
      TEXT.replace('full: "pnpm check"  # la completa', 'full: "pnpm verify"  # la completa'),
    );
    expect(edited(TEXT, [{ path: ["language"], value: "en" }])).toBe(
      TEXT.replace("language: es\n", "language: en\n"),
    );
    expect(edited(TEXT, [{ path: ["review", "timeoutSec"], value: 90 }])).toBe(
      TEXT.replace("timeoutSec: 60 }", "timeoutSec: 90 }"),
    );
  });

  it("AC2: writes a new list on one line, in flow, where the old one was", () => {
    expect(edited(TEXT, [{ path: ["sensitive"], value: ["**/infra/**", ".env"] }])).toBe(
      TEXT.replace('  ["**/migrations/**", "**/auth/**"]', '  ["**/infra/**", ".env"]'),
    );
    expect(edited(TEXT, [{ path: ["lines", "exclude"], value: [] }])).toBe(
      TEXT.replace('exclude: ["a.ts", "b.ts"]', "exclude: []"),
    );
  });

  it("AC2: adds a missing key at the end of its map, with the maps it lacks", () => {
    expect(edited(TEXT, [{ path: ["split", "maxTasks"], value: 9 }])).toBe(
      TEXT.replace("  maxModules: 3\n", "  maxModules: 3\n  maxTasks: 9\n"),
    );
    expect(edited(TEXT, [{ path: ["git", "target"], value: "develop" }])).toBe(
      `${TEXT}git:\n  target: develop\n`,
    );
    expect(edited(TEXT, [{ path: ["checks", "functions", "maxLines"], value: 60 }])).toBe(
      `${TEXT}checks:\n  functions:\n    maxLines: 60\n`,
    );
    expect(
      edited(TEXT, [{ path: ["glossary"], value: "Cambio: lo que se pide.\nCorte: parte." }]),
    ).toBe(`${TEXT}glossary: |-\n  Cambio: lo que se pide.\n  Corte: parte.\n`);
    const flow = edited(TEXT, [
      { path: ["review", "command"] },
      { path: ["review", "model"], value: "x" },
    ]);
    expect(flow).toBe(
      TEXT.replace(
        'review: { command: "revisa", timeoutSec: 60 }',
        'review: { timeoutSec: 60, model: "x" }',
      ),
    );
  });

  it("AC2: applies several edits in order and leaves a text YAML reads as the edited values", () => {
    const text = edited(TEXT, [
      { path: ["verify", "timeoutSec"], value: 900 },
      { path: ["split", "maxTasks"], value: 9 },
      { path: ["git", "target"], value: "develop" },
    ]);
    expect(text).toBe(
      `${TEXT.replace("  timeoutSec: 2000\n", "  timeoutSec: 900\n").replace(
        "  maxModules: 3\n",
        "  maxModules: 3\n  maxTasks: 9\n",
      )}git:\n  target: develop\n`,
    );
    const read = parse(text);
    expect(read.verify.units).toEqual(parse(TEXT).verify.units);
    expect(read.split).toEqual({ maxModules: 3, maxTasks: 9 });
    expect(read.git).toEqual({ target: "develop" });
  });

  it("AC6: removes the lines of a key it resets, and its map when it is left empty", () => {
    expect(edited(TEXT, [{ path: ["scope", "autoApprove"] }])).toBe(
      TEXT.replace("  autoApprove: tests-and-generated\n", ""),
    );
    expect(edited(TEXT, [{ path: ["split", "maxModules"] }])).toBe(
      TEXT.replace("split:\n  maxModules: 3\n", ""),
    );
    expect(edited(TEXT, [{ path: ["verify", "full"] }])).toBe(
      TEXT.replace('  full: "pnpm check"  # la completa\n', ""),
    );
    expect(edited(TEXT, [{ path: ["sensitive"] }])).toBe(
      TEXT.replace('sensitive:\n  ["**/migrations/**", "**/auth/**"]\n', ""),
    );
  });

  it("AC6: keeps the comments above a key it resets, and changes nothing for a key not there", () => {
    expect(edited(TEXT, [{ path: ["governed"] }])).toBe(TEXT.replace('governed: ["**"]\n', ""));
    expect(edited(TEXT, [{ path: ["size"] }])).toBe(TEXT);
    expect(edited(TEXT, [{ path: ["git", "target"] }])).toBe(TEXT);
  });

  it("AC2: gives an issue at the edit's key when a key on its way is not a map", () => {
    const result = editYaml(TEXT, [{ path: ["language", "x"], value: 1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.path).toBe("language.x");
  });
});
