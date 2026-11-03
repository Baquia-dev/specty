// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  cli,
  inWorktree,
  NOW,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

/** The local day `days` after the tests' now, as YYYY-MM-DD. */
const day = (days: number): string => {
  const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
};

describe("reminders with a trigger", () => {
  it("AC1: a reminder with a day waits for it in the start card and in «TE TOCA»", async () => {
    const root = await tempRepo(APP);
    expect(
      (await add(root, "Publicar la versión", "--kind", "reminder", "--due", day(1))).code,
    ).toBe(0);
    expect(
      (await add(root, "Revisar la licencia", "--kind", "reminder", "--due", day(0))).code,
    ).toBe(0);
    expect(
      (await add(root, "Renovar el dominio", "--kind", "reminder", "--due", day(-1))).code,
    ).toBe(0);
    const due = "  P2 · Revisar la licencia\n  P3 · Renovar el dominio\n";
    const next = (await cli(root, ["next"])).out;
    expect(next).toContain(`RECORDATORIOS:\n${due}`);
    expect(next).not.toContain("Publicar la versión");
    const status = (await cli(root, ["status"])).out;
    expect(status).toContain(`TE TOCA:\n${due}`);
    expect(status).not.toContain("Publicar la versión");
    expect((await cli(root, ["memory"])).out).toContain(
      `P1 · recordatorio · desde ${day(1)} · Publicar la versión — `,
    );
    expect((await cli(root, ["memory", "done", "P2"], CLAUDE)).code).toBe(0);
    expect((await cli(root, ["status"])).out).toContain("TE TOCA:\n  P3 · Renovar el dominio\n");
  });

  it("AC2: a reminder with paths shows only in the card of the task that touches them", async () => {
    const { root, folder } = await inWorktree();
    const api = await add(
      root,
      "Avisar a soporte del saludo",
      "--kind",
      "reminder",
      "--path",
      "src/**",
    );
    expect(api.code).toBe(0);
    const docs = await add(root, "Revisar la guía", "--kind", "reminder", "--path", "docs/**");
    expect(docs.code).toBe(0);
    expect((await cli(root, ["status"])).out).not.toContain("TE TOCA");
    expect((await cli(root, ["next"])).out).not.toContain("RECORDATORIOS");
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    const task = (await cli(folder, ["next"])).out;
    expect(task).toContain(
      [
        "RECORDATORIOS DE ESTOS ARCHIVOS:",
        "  P1 · Avisar a soporte del saludo · en src/**",
        "  Cuando se cumpla uno, márcalo hecho con `specty memory done <id>`.",
      ].join("\n"),
    );
    expect(task).not.toContain("Revisar la guía");
    expect((await cli(folder, ["memory", "done", "P1"], CLAUDE)).code).toBe(0);
    expect((await cli(folder, ["next"])).out).not.toContain("RECORDATORIOS DE ESTOS ARCHIVOS");
  });

  it("AC3: memory add refuses a wrong day, a day on another kind and two triggers", async () => {
    const root = await tempRepo(APP);
    const bad = await add(root, "Publicar", "--kind", "reminder", "--due", "2026-02-30");
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("`--due` espera un día como AAAA-MM-DD, y «2026-02-30» no lo es.");
    const pending = await add(root, "Publicar", "--due", day(1));
    expect(pending.code).toBe(1);
    expect(pending.out).toContain("y esta entrada sería un pendiente.");
    const both = await add(
      root,
      "Publicar",
      "--kind",
      "reminder",
      "--due",
      day(1),
      "--path",
      "src/**",
    );
    expect(both.code).toBe(1);
    expect(both.out).toContain("Un recordatorio lleva un solo disparador");
    expect((await cli(root, ["memory", "--all"])).out).toContain("No hay entradas.");
  });
});
