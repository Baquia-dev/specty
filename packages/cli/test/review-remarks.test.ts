// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE,
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

/** What the reviewer answers to the spec, to the first review of the result and to the last. */
const ANSWERS = [
  "- Alta: una observación de la spec.\n",
  "- Alta: una observación de la primera revisión.\n",
  [
    "- **Alta** · src/app.ts: el saludo no escapa el nombre.",
    "- Baja: falta un comentario.",
    "- Media — src/app.ts: sin nombre no saluda a «mundo».",
    "- Sin nombre no hay prueba.",
    "",
  ].join("\n"),
];

/** A reviewer that answers ANSWERS in order, one per review. */
async function reviewer(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "specty-remarks-"));
  const count = JSON.stringify(join(dir, "count"));
  const script = join(dir, "reviewer.mjs");
  await writeFile(
    script,
    [
      `import { existsSync, readFileSync, writeFileSync } from "node:fs";`,
      `readFileSync(0, "utf8");`,
      `const done = existsSync(${count}) ? Number(readFileSync(${count}, "utf8")) : 0;`,
      `writeFileSync(${count}, String(done + 1));`,
      `process.stdout.write(${JSON.stringify(ANSWERS)}[done] ?? "");`,
      "",
    ].join("\n"),
  );
  return `node "${script}"`;
}

/** SPEC's change, its spec reviewed and its result reviewed twice: in its acceptance. */
async function reviewedInAcceptance(): Promise<string> {
  const review = `review:\n  command: ${JSON.stringify(await reviewer())}\n`;
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": `${CONFIG()}${review}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["review"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "1\n" });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
  await writeFiles(root, { "src/app.ts": "2\n" });
  expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
  expect((await cli(root, ["review"])).code).toBe(0);
  expect((await cli(root, ["review"])).code).toBe(0);
  return root;
}

/** SPEC's change, its spec reviewed, its result reviewed twice and accepted: in its closing. */
async function reviewedChange(): Promise<string> {
  const root = await reviewedInAcceptance();
  expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
  return root;
}

/** A closing whose decisions cite `refs`. */
const closing = (refs: readonly string[]) =>
  `\n## Cierre\n\n### Resumen\n\nSaludo listo.\n\n### Decisiones\n\n${refs.map((ref) => `- ${ref} no es un problema real: el nombre no llega a HTML.\n`).join("")}`;

describe("the remarks of the last review of the result", () => {
  it("AC3: show in the closing card until the closing cites them", async () => {
    const root = await reviewedChange();
    const spec = await read(root, SPEC_PATH);
    expect((await cli(root, ["next"])).out).toContain(
      [
        "OBSERVACIONES DE LA REVISIÓN:",
        "  diff-2.md#1 · **Alta** · src/app.ts: el saludo no escapa el nombre.",
        "  diff-2.md#3 · Media — src/app.ts: sin nombre no saluda a «mundo».",
        "  Cita en el cierre",
      ].join("\n"),
    );
    await writeFiles(root, { [SPEC_PATH]: `${spec}${closing(["diff-2.md#1"])}` });
    const cited = (await cli(root, ["next"])).out;
    expect(cited).toContain("OBSERVACIONES DE LA REVISIÓN:\n  diff-2.md#3 · Media");
    expect(cited).not.toContain("diff-2.md#1 ·");
    await writeFiles(root, { [SPEC_PATH]: `${spec}${closing(["diff-2.md#1", "diff-2.md#3"])}` });
    expect((await cli(root, ["next"])).out).not.toContain("OBSERVACIONES DE LA REVISIÓN");
  });

  it("AC1: those the closing does not cite become pending items of the memory when it closes", async () => {
    const root = await reviewedChange();
    const spec = await read(root, SPEC_PATH);
    await writeFiles(root, { [SPEC_PATH]: `${spec}${closing(["diff-2.md#1"])}` });
    expect((await cli(root, ["propose"])).out).toContain("Cierre válido.");
    expect((await cli(root, ["close"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["memory"])).out).toContain(
      `P1 · pendiente · Observación de la revisión independiente que el cierre no citó (\`${ARCHIVE}/${CHANGE}/reviews/diff-2.md#3\`): Media — src/app.ts: sin nombre no saluda a «mundo». — ${CHANGE}, la persona, `,
    );
  });

  it("AC2: the cited, low and unrated remarks, and those of the spec or an earlier review, stay out", async () => {
    const root = await reviewedChange();
    const spec = await read(root, SPEC_PATH);
    await writeFiles(root, { [SPEC_PATH]: `${spec}${closing(["diff-2.md#1"])}` });
    expect((await cli(root, ["propose"])).out).toContain("Cierre válido.");
    expect((await cli(root, ["close"], { terminal: person() })).code).toBe(0);
    const listed = (await cli(root, ["memory", "--all"])).out;
    expect(listed).toContain("P1 · pendiente");
    expect(listed).not.toContain("P2 ·");
    for (const text of [
      "el saludo no escapa el nombre",
      "falta un comentario",
      "Sin nombre no hay prueba",
      "una observación de la spec",
      "una observación de la primera revisión",
    ])
      expect(listed).not.toContain(text);
  });
});

describe("the remarks while the closing is written in acceptance, in delegated mode", () => {
  it("show in the acceptance card until the closing cites them, and the accept that closes leaves the rest in the memory", async () => {
    const root = await reviewedInAcceptance();
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
    const spec = await read(root, SPEC_PATH);
    expect((await cli(root, ["next"])).out).toContain(
      [
        "OBSERVACIONES DE LA REVISIÓN:",
        "  diff-2.md#1 · **Alta** · src/app.ts: el saludo no escapa el nombre.",
        "  diff-2.md#3 · Media — src/app.ts: sin nombre no saluda a «mundo».",
        "  Cita en el cierre",
      ].join("\n"),
    );
    await writeFiles(root, { [SPEC_PATH]: `${spec}${closing(["diff-2.md#1"])}` });
    const cited = (await cli(root, ["next"])).out;
    expect(cited).toContain("OBSERVACIONES DE LA REVISIÓN:\n  diff-2.md#3 · Media");
    expect(cited).not.toContain("diff-2.md#1 ·");
    expect((await cli(root, ["propose"])).out).toContain("Cierre válido.");
    expect((await cli(root, ["accept"])).code).toBe(0);
    const listed = (await cli(root, ["memory"])).out;
    expect(listed).toContain(
      `P1 · pendiente · Observación de la revisión independiente que el cierre no citó (\`${ARCHIVE}/${CHANGE}/reviews/diff-2.md#3\`): Media — src/app.ts: sin nombre no saluda a «mundo».`,
    );
    expect(listed).not.toContain("el saludo no escapa el nombre");
  });

  it("stay out of the acceptance card without delegated mode", async () => {
    const root = await reviewedInAcceptance();
    expect((await cli(root, ["next"])).out).not.toContain("OBSERVACIONES DE LA REVISIÓN");
  });
});
