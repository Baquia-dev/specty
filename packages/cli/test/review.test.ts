// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, cli, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

const DIR = `.specty/changes/${CHANGE}`;
/** SPEC touching a sensitive path, so propose recommends the review. */
const SENSITIVE = SPEC.replace(
  "- crear src/app.test.ts — prueba\n",
  "- crear src/app.test.ts — prueba\n- modificar src/auth/session.ts — sesión\n",
);

/** A reviewer that keeps what it reads and answers one finding. */
async function reviewer(): Promise<{ readonly command: string; readonly prompt: string }> {
  const dir = await mkdtemp(join(tmpdir(), "specty-reviewer-"));
  const prompt = join(dir, "prompt.txt");
  const script = join(dir, "reviewer.mjs");
  await writeFile(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(prompt)}, readFileSync(0, "utf8"));\nconsole.log("- Alta: AC1 no se puede comprobar.");\n`,
  );
  return { command: `node "${script}"`, prompt };
}

async function repo(command?: string): Promise<string> {
  const review = command === undefined ? "" : `review:\n  command: ${JSON.stringify(command)}\n`;
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": `${CONFIG()}${review}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  return root;
}

describe("specty review", () => {
  it("is recommended once for a sensitive spec, and keeps the reviewer's answer", async () => {
    const { command, prompt } = await reviewer();
    const root = await repo(command);
    await writeFiles(root, { [SPEC_PATH]: SENSITIVE });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.out).toContain(
      "SIGUIENTE: antes de pedir la aprobación, ejecuta `specty review`",
    );
    const reviewed = await cli(root, ["review"]);
    expect(reviewed.code).toBe(0);
    expect(reviewed.out).toContain(
      `REVISIÓN INDEPENDIENTE (${command}):\n  Guardada en ${DIR}/reviews/spec-r1.md.\n  - Alta: AC1 no se puede comprobar.`,
    );
    const sent = await readFile(prompt, "utf8");
    expect(sent).toContain("Eres un revisor independiente");
    expect(sent).toContain("# Saludo personalizado");
    expect(await read(root, `${DIR}/reviews/spec-r1.md`)).toBe(
      "- Alta: AC1 no se puede comprobar.\n",
    );
    const audit = (await read(root, `${DIR}/audit.jsonl`)).trim().split("\n");
    const entry = JSON.parse(audit.at(-1) ?? "{}");
    expect(entry).toMatchObject({
      actor: "specty",
      event: "review.completed",
      data: { target: "spec", revision: 1, cmd: command, exit: 0 },
    });
    // Once is enough: the next proposal asks for the approval again.
    expect((await cli(root, ["propose"])).out).toContain("`specty approve`");
  });

  it("is not recommended nor run without a review command", async () => {
    const root = await repo();
    await writeFiles(root, { [SPEC_PATH]: SENSITIVE });
    expect((await cli(root, ["propose"])).out).not.toContain("specty review");
    const refused = await cli(root, ["review"]);
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("Este proyecto no tiene revisión independiente");
  });

  it("explains a review outside the review phase, or one that fails, and moves nothing", async () => {
    const root = await repo('node -e "process.exit(3)"');
    const early = await cli(root, ["review"]);
    expect(early.code).toBe(2);
    expect(early.out).toContain("La revisión independiente se pide con la spec en revisión");
    await writeFiles(root, { [SPEC_PATH]: SENSITIVE });
    await cli(root, ["propose"]);
    const failed = await cli(root, ["review"]);
    expect(failed.code).toBe(2);
    expect(failed.out).toContain('La revisión falló (`node -e "process.exit(3)"`, código 3).');
    expect(existsSync(join(root, DIR, "reviews"))).toBe(false);
    expect((await cli(root, ["next"])).out).toContain(`SPECTY · ${CHANGE} · review`);
  });
});
