// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE, claudeWith, initialized, step } from "./fake-model";
import { cli, git, person, read, SPEC, SPEC_PATH, writeFiles } from "./support";

const { write, bash } = step;

describe.skipIf(CLAUDE === undefined)(
  "Claude Code with a scripted model (needs Claude Code: SPECTY_E2E_CLAUDE, the PATH or an editor extension)",
  () => {
    it("blocks code, commits and person commands without a change, naming the way on", async () => {
      const root = await initialized();
      await writeFiles(root, { "src/app.ts": "export const greet = () => 'adiós';\n" });
      const commits = git(root, "rev-list", "--count", "HEAD");
      const model = await claudeWith(root, [
        write(join(root, "src/nuevo.ts"), "export const nuevo = 1;\n"),
        bash("git commit -am 'Sin spec'"),
        bash("specty approve"),
      ]);
      const results = model.results();
      expect(results.map((result) => result.isError)).toEqual([true, true, true]);
      for (const result of results) {
        expect(result.text).toContain("guard --tool claude-code");
        expect(result.text).toMatch(/^SIGUIENTE: /m);
      }
      expect(results[0]?.text).toContain("SIGUIENTE: ejecuta `specty next`.");
      // There is no task: `task done` would be refused too.
      expect(results[1]?.text).toContain(
        "SIGUIENTE: ejecuta `specty next`: te dice cómo seguir con ese código.",
      );
      expect(results[2]?.text).toContain("SIGUIENTE: pídele al usuario que lo ejecute");
      expect(existsSync(join(root, "src/nuevo.ts"))).toBe(false);
      expect(git(root, "rev-list", "--count", "HEAD")).toBe(commits);
    });

    it("lets the active task's files through and stops the others", async () => {
      const root = await initialized();
      expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
      await writeFiles(root, { [SPEC_PATH]: SPEC });
      expect((await cli(root, ["propose"])).code).toBe(0);
      const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      expect(approved.code).toBe(0);
      expect((await cli(root, ["next"])).out).toContain("TAREA T1");
      const model = await claudeWith(root, [
        write(join(root, "src/app.test.ts"), "expect(greet('Ana')).toBe('Hola, Ana');\n"),
        write(join(root, "src/otro.ts"), "export const otro = 1;\n"),
      ]);
      const [inside, outside] = model.results();
      expect(inside?.isError).toBe(false);
      expect(await read(root, "src/app.test.ts")).toContain("Hola, Ana");
      expect(outside?.isError).toBe(true);
      expect(outside?.text).toContain("specty scope add src/otro.ts --task T1");
      expect(existsSync(join(root, "src/otro.ts"))).toBe(false);
    });
  },
);
