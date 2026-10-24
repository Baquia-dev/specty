// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, inWorktree, person, read, SPEC, SPEC_PATH, writeFiles } from "./support";

/** A configuration with no `verify` at all, as `init` leaves it in an empty repository. */
const BARE = "version: 1\nlanguage: es\n";

/** SPEC with a `verify` of its own in each task, as `propose` asks without a default. */
const VERIFIED = SPEC.replace(
  "  - files: src/app.ts, src/app.test.ts\n",
  '  - files: src/app.ts, src/app.test.ts\n  - verify: "true"\n',
).replace("  - files: src/app.ts\n", '  - files: src/app.ts\n  - verify: "true"\n');

/** Takes the change in `folder` through its tasks and acceptance, and returns what accept showed. */
async function accepted(folder: string): Promise<string> {
  await writeFiles(folder, { [SPEC_PATH]: VERIFIED });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(folder, ["next"]);
  await writeFiles(folder, { "src/app.ts": "1\n" });
  expect((await cli(folder, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
  await writeFiles(folder, { "src/app.ts": "2\n" });
  expect((await cli(folder, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
  const terminal = person();
  expect((await cli(folder, ["accept"], { terminal })).code).toBe(0);
  return terminal.notes.join("\n");
}

const NOTHING =
  "Nada verifica el cambio entero: .specty/config.yaml no tiene `verify.full` ni `verify.default`";

describe("a change nothing verifies as a whole", () => {
  it("is said at acceptance and at the incorporation of the main branch", async () => {
    const { root, folder } = await inWorktree({ "src/app.ts": "0\n", ".specty/config.yaml": BARE });
    expect(await accepted(folder)).toContain(NOTHING);
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    // main moves, so closing merges it into the change first.
    await writeFiles(root, { "src/other.ts": "1\n" });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "otro trabajo en main");
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toMatch(
      /Antes, main se incorporó a la rama del cambio \(merge [0-9a-f]{7}\) sin verificar: \.specty\/config\.yaml no tiene `verify\.full` ni `verify\.default`\./,
    );
  });

  it("is not said when verify.default checks it", async () => {
    const { folder } = await inWorktree({ "src/app.ts": "0\n", ".specty/config.yaml": CONFIG() });
    expect(await accepted(folder)).not.toContain(NOTHING);
  });
});
