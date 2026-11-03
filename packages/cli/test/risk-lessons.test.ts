// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const EVAL =
  "Riesgo aceptado en `src/app.ts`: ejecuta código construido al vuelo (eval) (CWE-95). Revísalo antes de ampliarlo.";
const TLS =
  "Riesgo aceptado en `src/tls.ts`: desactiva la verificación TLS (CWE-295). Revísalo antes de ampliarlo.";

/** SPEC with a new file for T1, its tasks done with two risky lines, waiting for acceptance. */
async function withRisks(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  const spec = SPEC.replace(
    "- crear src/app.test.ts — prueba\n",
    "- crear src/app.test.ts — prueba\n- crear src/tls.ts — cliente\n",
  ).replace(
    "  - files: src/app.ts, src/app.test.ts\n",
    "  - files: src/app.ts, src/app.test.ts, src/tls.ts\n",
  );
  await writeFiles(root, { [SPEC_PATH]: spec });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  await cli(root, ["next"]);
  await writeFiles(root, {
    "src/app.ts":
      "export const greet = (input) => eval(input);\nexport const again = (x) => eval(x);\n",
    "src/tls.ts": "export const agent = { rejectUnauthorized: false };\n",
  });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
  await writeFiles(root, { "src/app.ts": "export const greet = (input) => eval(input);\n" });
  expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
  return root;
}

describe("accepting a change keeps its risks in the memory", () => {
  it("AC1: each file and pattern becomes a lesson of that file, from the change, and accept says which", async () => {
    const root = await withRisks();
    const accepted = await cli(root, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain(
      "Riesgos aceptados, anotados en la memoria como lecciones de sus archivos: P1, P2.",
    );
    const memory = (await cli(root, ["memory"])).out;
    expect(memory).toContain(`P1 · lección · ${EVAL} — ${CHANGE}`);
    expect(memory).toContain(`P2 · lección · ${TLS} — ${CHANGE}`);
    expect(memory).toMatch(/P1 · lección · .+ · en src\/app\.ts\n/);
    expect(memory).toMatch(/P2 · lección · .+ · en src\/tls\.ts\n/);
    expect(memory).not.toContain("P3 ·");
  });

  it("AC2: does not add again a lesson already open with the same risk of the same file", async () => {
    const root = await withRisks();
    const added = await cli(
      root,
      ["memory", "add", TLS, "--kind", "lesson", "--path", "src/tls.ts"],
      CLAUDE,
    );
    expect(added.code).toBe(0);
    const accepted = await cli(root, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain(
      "Riesgos aceptados, anotados en la memoria como lecciones de sus archivos: P2.",
    );
    const memory = (await cli(root, ["memory"])).out;
    expect(memory.split(TLS)).toHaveLength(2);
    expect(memory).toContain(`P2 · lección · ${EVAL} — ${CHANGE}`);
    expect(memory).not.toContain("P3 ·");
  });
});
