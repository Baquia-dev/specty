// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, tempRepo } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };
const INIT = ["init", "--language", "es", "--tools", "claude-code"];

/** The `SIGUIENTE:` line of an output. */
const nextOf = (out: string) => out.split("\n").find((line) => line.startsWith("SIGUIENTE:"));

describe("what init asks for after installing", () => {
  it("names the sections of a new AGENTS.md, still empty (AC1)", async () => {
    const root = await tempRepo(CODE);
    const done = await cli(root, INIT);
    expect(done.code).toBe(0);
    expect(nextOf(done.out)).toMatch(
      /^SIGUIENTE: completa las secciones «Mapa» y «Convenciones» de AGENTS\.md con lo que no se deduce del código, revisa \.specty\/config\.yaml y ejecuta `.+ doctor`\.$/,
    );
  });

  it("names only the empty one of an AGENTS.md that had them (AC1)", async () => {
    const agents = "# App\n\n## Mapa\n\n- `src/`: la app.\n\n## Convenciones\n\n<!-- Pista. -->\n";
    const root = await tempRepo({ ...CODE, "AGENTS.md": agents });
    const done = await cli(root, INIT);
    expect(nextOf(done.out)).toMatch(
      /^SIGUIENTE: completa la sección «Convenciones» de AGENTS\.md/,
    );
  });

  it("names none when an AGENTS.md that already existed does not have them (AC2)", async () => {
    const root = await tempRepo({ ...CODE, "AGENTS.md": "# App\n\nInstrucciones propias.\n" });
    const done = await cli(root, INIT);
    expect(done.code).toBe(0);
    expect(nextOf(done.out)).toMatch(
      /^SIGUIENTE: revisa \.specty\/config\.yaml y ejecuta `.+ doctor`\.$/,
    );
  });
});
