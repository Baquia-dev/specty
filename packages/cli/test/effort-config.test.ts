// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** Created files weigh 4, an M change gets its own effort, and a task is high from 2 files. */
const SIZE_AND_EFFORT = [
  "sizing:",
  "  weights:",
  "    create: 4",
  "effort:",
  "  M:",
  "    plan: max",
  "    implement: high",
  "  task:",
  "    lowMaxFiles: 0",
  "    highMinFiles: 2",
  "",
].join("\n");

const EFFORT =
  "ESFUERZO RECOMENDADO: implementación alto · revisiones de la spec y del alcance: máximo";

describe("the size and the effort of config.yaml", () => {
  it("AC2, AC4: propose and approve size and recommend with them, and so does the task's card", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": `${CONFIG()}${SIZE_AND_EFFORT}`,
    });
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.code).toBe(0);
    // 1 modified file and 4 for the created one: M, where today it is S.
    expect(proposed.out).toContain("SPEC VÁLIDA · tamaño M (2 archivos)");
    expect(proposed.out).toContain(EFFORT);
    const terminal = person({ choose: ["confirm"] });
    const approved = await cli(root, ["approve"], { terminal });
    expect(approved.code).toBe(0);
    expect(terminal.notes.join("\n")).toContain(EFFORT);
    // T1 touches 2 files: high from 2, where today it is medium.
    expect((await cli(root, ["next"])).out).toContain("ESFUERZO SUGERIDO: alto");
  });
});
