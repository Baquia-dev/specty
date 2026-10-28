// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  stateIn,
  tempRepo,
  tryGit,
  writeFiles,
} from "./support";

/** A repository set up with `specty init`, so the real hooks run on every commit. */
async function initialized(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "x\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": CONFIG() });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  return root;
}

/** SPEC's change, proposed and waiting for the person in review. */
async function inReview(): Promise<string> {
  const root = await initialized();
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  return root;
}

/** SPEC's change, approved, with T1 active. */
async function implementing(): Promise<string> {
  const root = await inReview();
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  expect((await cli(root, ["next"])).code).toBe(0);
  return root;
}

const pending = async (root: string) =>
  ((await stateIn(root)) as { pending: { scopeRequests: Record<string, unknown>[] } }).pending
    .scopeRequests;
const extras = async (root: string) =>
  ((await stateIn(root)) as { tasks: Record<string, { scopeExtra: string[] }> }).tasks.T1
    ?.scopeExtra;
const audit = (root: string) => read(root, `.specty/changes/${CHANGE}/audit.jsonl`);
const trailer = (root: string, key: string) =>
  git(root, "log", "-1", `--format=%(trailers:key=${key},valueonly)`);

describe("retro --into", () => {
  it("AC1, AC2, AC5: documents staged code outside the scope as a request of the active task", async () => {
    const root = await implementing();
    await writeFiles(root, { "lib/elsewhere.ts": "x\n", "lib/other.test.ts": "t\n" });
    git(root, "add", "lib");
    const blocked = tryGit(root, "commit", "-q", "-m", "fix: urgente");
    expect(blocked.status).toBe(1);
    expect(blocked.output).toContain(
      `«Documenta los cambios preparados con specty retro --into ${CHANGE}»`,
    );

    const asked = await cli(root, [
      "retro",
      "--into",
      CHANGE,
      "--reason",
      "Arreglo urgente en producción",
    ]);
    expect(asked.code).toBe(0);
    expect(asked.out).toContain(
      "SOLICITUD S1 (documenta lo preparado):\n  lib/elsewhere.ts\n  lib/other.test.ts",
    );
    // A test outside the scope would pass by policy with `scope add`; a retro never does (AC1).
    const [request] = await pending(root);
    expect(request).toMatchObject({
      id: "S1",
      task: "T1",
      paths: ["lib/elsewhere.ts", "lib/other.test.ts"],
      reason: "Arreglo urgente en producción",
    });
    expect(typeof request?.retro).toBe("string");
    expect(await extras(root)).toEqual([]);
    expect(tryGit(root, "commit", "-q", "-m", "fix: urgente").status).toBe(1);

    const approved = await cli(root, ["approve", "--scope", "S1"], { terminal: person() });
    expect(approved.code).toBe(0);
    expect(approved.out).toContain(`Lo preparado queda documentado en ${CHANGE}`);
    expect(approved.out).toContain("SIGUIENTE: vuelve a ejecutar `git commit`.");
    expect(await extras(root)).toEqual(["lib/elsewhere.ts", "lib/other.test.ts"]);
    expect(await audit(root)).toMatch(/"event":"retro\.confirmed".*"request":"S1"/);

    expect(tryGit(root, "commit", "-q", "-m", "fix: urgente").status).toBe(0);
    expect(trailer(root, "Specty-Change")).toBe(CHANGE);
    expect(trailer(root, "Specty-Retro")).toBe("true");
    const files = git(root, "show", "--name-only", "--format=", "HEAD");
    expect(files).toContain("lib/elsewhere.ts");
    expect(files).toContain(`.specty/changes/${CHANGE}/state.json`);
  });

  it("AC3: Specty rejects the request when the staged code changed before its approval", async () => {
    const root = await implementing();
    await writeFiles(root, { "lib/elsewhere.ts": "x\n" });
    git(root, "add", "lib");
    expect((await cli(root, ["retro", "--into", CHANGE, "--reason", "Arreglo urgente"])).code).toBe(
      0,
    );
    await writeFiles(root, { "lib/elsewhere.ts": "y\n" });
    git(root, "add", "lib");

    const stale = await cli(root, ["approve", "--scope", "S1"], { terminal: person() });
    expect(stale.out).toContain("Lo preparado cambió desde que se pidió S1");
    expect(stale.out).toContain(`specty retro --into ${CHANGE}`);
    expect(await pending(root)).toEqual([]);
    expect(await extras(root)).toEqual([]);
    expect(await audit(root)).toMatch(
      /"actor":"specty","event":"scope\.decided","data":\{"id":"S1","decision":"rejected","reason":"Lo preparado cambió desde la solicitud\."\}/,
    );
    expect(tryGit(root, "commit", "-q", "-m", "fix: urgente").status).toBe(1);
  });

  it("AC4, AC5: creates nothing without a reason, the active change, an active task or code outside the scope", async () => {
    const root = await inReview();
    await writeFiles(root, { "lib/elsewhere.ts": "x\n" });
    git(root, "add", "lib");
    const inOtherPhase = tryGit(root, "commit", "-q", "-m", "fix");
    expect(inOtherPhase.status).toBe(1);
    expect(inOtherPhase.output).toContain("«Documenta los cambios preparados con specty retro».");
    const noTask = await cli(root, ["retro", "--into", CHANGE, "--reason", "Urgente"]);
    expect(noTask.code).not.toBe(0);
    expect(noTask.out).toContain("`--into` necesita una tarea activa en implementing");

    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["next"])).code).toBe(0);
    const refusals = [
      [["retro", "--into", CHANGE], "Falta el motivo de los cambios preparados."],
      [
        ["retro", "--into", "20991231-otro", "--reason", "Urgente"],
        "20991231-otro no es el cambio activo de esta carpeta.",
      ],
      [
        ["retro", "--into", CHANGE, "--minimal", "--reason", "Urgente"],
        "`--into` y `--minimal` no van juntos.",
      ],
    ] as const;
    for (const [argv, line] of refusals) {
      const refused = await cli(root, argv);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain(line);
    }

    git(root, "reset", "-q");
    await writeFiles(root, { "src/app.ts": "inside\n" });
    git(root, "add", "src/app.ts");
    const inside = await cli(root, ["retro", "--into", CHANGE, "--reason", "Urgente"]);
    expect(inside.code).not.toBe(0);
    expect(inside.out).toContain(
      `No hay código gobernado preparado fuera del alcance de ${CHANGE}.`,
    );
    expect(await pending(root)).toEqual([]);
    expect((await stateIn(root)) as { maxIds: Record<string, number> }).toMatchObject({
      maxIds: expect.not.objectContaining({ S: expect.anything() }),
    });
  });
});
