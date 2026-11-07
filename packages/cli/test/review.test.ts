// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

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

  it("is recommended for a small spec whose review effort the model raised to max", async () => {
    const { command } = await reviewer();
    const root = await repo(command);
    const raised = SPEC.replace(
      "kind: standard",
      "kind: standard\neffort:\n  review: max\n  reason: El saludo cambia la API pública",
    );
    await writeFiles(root, { [SPEC_PATH]: raised });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.out).toContain(
      "revisiones de la spec y del alcance: máximo (el modelo lo sube: El saludo cambia la API pública)",
    );
    expect(proposed.out).toContain(
      "SIGUIENTE: antes de pedir la aprobación, ejecuta `specty review`",
    );
  });

  it("is not recommended nor run without a review command", async () => {
    const root = await repo();
    await writeFiles(root, { [SPEC_PATH]: SENSITIVE });
    expect((await cli(root, ["propose"])).out).not.toContain("specty review");
    const refused = await cli(root, ["review"]);
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("Este proyecto no tiene revisión independiente");
  });

  it("AC2: keeps only the last internal.exec.maxOutputKiB of a longer answer, 512 without the key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "specty-reviewer-"));
    const script = join(dir, "reviewer.mjs");
    // A first finding, some 80 KiB, past 64 KiB and short of 512, and a last one.
    await writeFile(
      script,
      [
        'import { readFileSync } from "node:fs";',
        "readFileSync(0);",
        'console.log("- Alta: lo primero que dice.");',
        'for (let line = 0; line < 1000; line++) console.log("relleno ".repeat(10));',
        'console.log("- Baja: lo último que dice.");',
        "",
      ].join("\n"),
    );
    const command = `node "${script}"`;
    const kept = async (internal: string) => {
      const root = await repo(command);
      await writeFiles(root, {
        ".specty/config.yaml": `${CONFIG()}review:\n  command: ${JSON.stringify(command)}\n${internal}`,
        [SPEC_PATH]: SENSITIVE,
      });
      await cli(root, ["propose"]);
      expect((await cli(root, ["review"])).code).toBe(0);
      return read(root, `${DIR}/reviews/spec-r1.md`);
    };
    const whole = await kept("");
    expect(whole).toContain("- Alta: lo primero que dice.");
    expect(whole).toContain("- Baja: lo último que dice.");
    const cut = await kept("internal:\n  exec:\n    maxOutputKiB: 64\n");
    expect(cut).not.toContain("lo primero");
    expect(cut).toContain("- Baja: lo último que dice.");
    expect(cut.length).toBeLessThanOrEqual(64 * 1024 + 1);
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

describe("specty review of the result", () => {
  it("is recommended in acceptance after a risky task, and reviews the change's diff", async () => {
    const { command, prompt } = await reviewer();
    const root = await repo(command);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    // A small, plain spec: no review before the approval.
    expect((await cli(root, ["propose"])).out).not.toContain("specty review");
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "export const greet = (input) => eval(input);\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => name;\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    expect((await cli(root, ["next"])).out).toContain(
      "SIGUIENTE: antes de pedir la aceptación, ejecuta `specty review`",
    );
    const reviewed = await cli(root, ["review"]);
    expect(reviewed.code).toBe(0);
    expect(reviewed.out).toContain(`Guardada en ${DIR}/reviews/diff-1.md.`);
    expect(reviewed.out).toContain("pídele que acepte con `specty accept`");
    const sent = await readFile(prompt, "utf8");
    expect(sent).toContain("Eres un revisor independiente de un cambio de código");
    expect(sent).toContain("<diff>\ndiff --git a/src/app.ts b/src/app.ts");
    expect(sent).not.toContain(".specty/changes");
    const audit = (await read(root, `${DIR}/audit.jsonl`)).trim().split("\n");
    expect(JSON.parse(audit.at(-1) ?? "{}")).toMatchObject({
      event: "review.completed",
      data: { target: "diff", file: `${DIR}/reviews/diff-1.md` },
    });
    // Reviewed after the last task: the card asks for the acceptance again.
    expect((await cli(root, ["next"])).out).toContain("lo acepte con `specty accept`");
  });
});

describe("the size that asks for a review", () => {
  /**
   * SPEC, small and plain, with a review command and `extra` in `config.yaml`: what `propose`
   * says, and `next` in acceptance once its tasks are done without warnings.
   */
  async function plain(extra: string): Promise<{ proposed: string; accepting: string }> {
    const { command } = await reviewer();
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      ".specty/config.yaml": `${CONFIG()}review:\n  command: ${JSON.stringify(command)}\n${extra}`,
    });
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    const proposed = (await cli(root, ["propose"])).out;
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name = 'mundo') => 'Hola, ' + name;\n",
    });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    return { proposed, accepting: (await cli(root, ["next"])).out };
  }

  it("AC4: without flow.reviewFrom, asks for no review of a small, plain spec nor of its result", async () => {
    const { proposed, accepting } = await plain("");
    expect(proposed).toContain("SPEC VÁLIDA · tamaño S");
    expect(proposed).not.toContain("specty review");
    expect(accepting).toContain(`SPECTY · ${CHANGE} · acceptance`);
    expect(accepting).not.toContain("specty review");
  });

  it("AC5: with flow.reviewFrom S, asks for a review of a small, plain spec and of its result", async () => {
    const { proposed, accepting } = await plain("flow:\n  reviewFrom: S\n");
    expect(proposed).toContain("SPEC VÁLIDA · tamaño S");
    expect(proposed).toContain("SIGUIENTE: antes de pedir la aprobación, ejecuta `specty review`");
    expect(accepting).toContain(`SPECTY · ${CHANGE} · acceptance`);
    expect(accepting).toContain("SIGUIENTE: antes de pedir la aceptación, ejecuta `specty review`");
  });
});
