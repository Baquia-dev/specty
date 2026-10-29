// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, SPEC_PATH, tempRepo, writeFiles } from "./support";

const TITLE = "LO USAN FUERA DE LA SPEC";

/** A quick spec that changes `files` (each `[action, path]`) in one task. */
function quickSpec(files: readonly (readonly [string, string])[]): string {
  const listed = files.map(([action, path]) => `- ${action} ${path} — cambio`).join("\n");
  const paths = files.map(([, path]) => path).join(", ");
  return `---\nkind: quick\n---\n\n# Cambiar el valor\n\n## Objetivo\n\nEl valor cambia.\n\n## Archivos\n\n${listed}\n\n## Tareas\n\n- [ ] T1: Cambiar el valor\n  - files: ${paths}\n  - type: fix\n`;
}

/** What `specty propose` says of `spec` in a repository with `files`. */
async function proposed(
  files: Readonly<Record<string, string>>,
  spec: readonly (readonly [string, string])[],
): Promise<string> {
  const root = await tempRepo({ ...APP, ...files });
  expect((await cli(root, ["new", "--kind", "quick", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: quickSpec(spec) });
  const result = await cli(root, ["propose"]);
  expect(result.code).toBe(0);
  return result.out;
}

describe("the files that use what the spec changes", () => {
  it("AC1: are named when the spec does not list them, five of them and how many more", async () => {
    const users = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [`src/users/u${n}.ts`, 'import { a } from "../a";\n']),
    );
    const out = await proposed(
      {
        "src/a.ts": "export const a = 1;\n",
        "src/b.ts": 'import { a } from "./a";\n',
        "src/c.ts": 'import { a } from "./a.js";\n',
        ...users,
      },
      [
        ["modificar", "src/a.ts"],
        ["modificar", "src/b.ts"],
        ["crear", "src/new.ts"],
      ],
    );
    expect(out).toContain(TITLE);
    expect(out).toContain(
      "src/a.ts — importado por src/c.ts, src/users/u1.ts, src/users/u2.ts, src/users/u3.ts, src/users/u4.ts y 2 más",
    );
  });

  it("AC3: count in the languages the scanners of layers read, Python among them", async () => {
    const out = await proposed(
      {
        "app/models.py": "class User:\n    pass\n",
        "app/views.py": "from app.models import User\n",
        "app/admin.py": "from .models import User\n",
      },
      [
        ["modificar", "app/models.py"],
        ["modificar", "app/views.py"],
      ],
    );
    expect(out).toContain("app/models.py — importado por app/admin.py");
  });

  it("AC4: are not named when the spec lists them all, and a new file has none", async () => {
    const out = await proposed(
      { "src/a.ts": "export const a = 1;\n", "src/b.ts": 'import { a } from "./a";\n' },
      [
        ["modificar", "src/a.ts"],
        ["modificar", "src/b.ts"],
        ["crear", "src/new.ts"],
      ],
    );
    expect(out).not.toContain(TITLE);
  });
});
