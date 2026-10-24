// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, NOW, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/**
 * A repository with three tracked files in `src/utils/` and a change created with `args`; then one
 * more file there that git does not track and one that it ignores.
 */
async function withLibrary(args: readonly string[]): Promise<string> {
  const root = await tempRepo({
    ".specty/config.yaml": CONFIG(),
    ".gitignore": "src/utils/e.ts\n",
    "src/app.ts": "export const greet = () => 'hola';\n",
    "src/utils/a.ts": "a\n",
    "src/utils/b.ts": "b\n",
    "src/utils/c.ts": "c\n",
  });
  expect((await cli(root, ["new", ...args])).code).toBe(0);
  await writeFiles(root, { "src/utils/d.ts": "d\n", "src/utils/e.ts": "e\n" });
  return root;
}

describe("the size of a spec with globs", () => {
  it("counts each glob as its current matches plus one", async () => {
    const root = await withLibrary(["Saludo personalizado"]);
    const files =
      "- modificar src/utils/** — utilidades\n- crear src/utils/nuevo/** — más utilidades\n";
    const spec = SPEC.replace("- crear src/app.test.ts — prueba\n", `$&${files}`);
    await writeFiles(root, { [SPEC_PATH]: spec });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.code).toBe(0);
    // app.ts and its test, 4 matches (the ignored file is not one) and the glob, and a glob
    // without matches.
    expect(proposed.out).toContain("tamaño M (8 archivos, 2 módulos)");
  });

  it("counts only code files, matches included, against the quick limit", async () => {
    const root = await withLibrary(["--kind", "quick", "Arreglar utilidades"]);
    const id = `${NOW.toISOString().slice(0, 10).replaceAll("-", "")}-arreglar-utilidades`;
    const quick = (files: string) =>
      `---\nkind: quick\n---\n\n# Arreglar utilidades\n\n## Objetivo\n\nLas utilidades fallan.\n\n## Archivos\n\n${files}\n## Tareas\n\n- [ ] T1: Arreglarlas\n  - files: src/app.ts\n  - type: fix\n`;
    const path = `.specty/changes/${id}/spec.md`;
    const fits =
      "- modificar src/app.ts — saludo\n- crear src/app.test.ts — prueba\n- modificar docs/uso.md — uso\n";
    await writeFiles(root, { [path]: quick(fits) });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await writeFiles(root, { [path]: quick(`${fits}- modificar src/utils/** — utilidades\n`) });
    const over = await cli(root, ["propose"]);
    expect(over.code).not.toBe(0);
    expect(over.out).toContain("6 archivos de código, máximo 3");
  });
});
