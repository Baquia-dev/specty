// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, read, tempRepo } from "./support";

const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;

/** The `data` of the audit's `change.created` entry in `folder`. */
async function created(folder: string): Promise<Record<string, unknown>> {
  const entries = (await read(folder, AUDIT))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return entries.find((entry) => entry.event === "change.created")?.data ?? {};
}

describe("new --request", () => {
  it("keeps the user's literal request in the audit and shows it while drafting", async () => {
    const root = await tempRepo(APP);
    const literal = "Que salude por nombre.\n¡Y que no grite!  ";
    const made = await cli(root, ["new", "Saludo personalizado", "--request", literal]);
    expect(made.code).toBe(0);
    expect((await created(root)).request).toBe("Que salude por nombre.\n¡Y que no grite!");
    expect((await cli(root, ["next"])).out).toContain(
      "PETICIÓN DEL USUARIO:\n  Que salude por nombre.\n  ¡Y que no grite!\nCÓMO REDACTARLA:",
    );
  });

  it("keeps it in a new worktree too", async () => {
    const root = await tempRepo(APP);
    const args = ["new", "--worktree", "Saludo personalizado", "--request", "Hola"];
    expect((await cli(root, args)).code).toBe(0);
    expect((await created(folderOf(root))).request).toBe("Hola");
  });

  it("changes nothing without it", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    expect(await created(root)).not.toHaveProperty("request");
    expect((await cli(root, ["next"])).out).not.toContain("PETICIÓN DEL USUARIO");
  });

  it("refuses an empty request and creates nothing", async () => {
    const root = await tempRepo(APP);
    const refused = await cli(root, ["new", "Saludo personalizado", "--request", "  "]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("La petición (--request) está vacía.");
    expect(git(root, "branch", "--list", "specty/*")).toBe("");
  });
});
