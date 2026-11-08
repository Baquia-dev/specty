// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  stateIn,
  tempRepo,
  writeFiles,
} from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };
const REQUEST = "que salude por nombre en toda la app";
const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;

/** SPEC's change written as an epic: its goal and criteria, in two slices. */
const EPIC_SPEC = `---
kind: epic
---

# Saludo personalizado

## Objetivo

La app saluda por nombre.

## Fuera de alcance

- Traducciones.

## Supuestos

- A1: El nombre llega como argumento.

## Criterios de aceptación

- AC1: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».
- AC2: CUANDO no se pasa ningún nombre ENTONCES imprime «Hola, mundo».

## Cortes

- C1: Saludo por nombre
  - ac: AC1
- C2: Saludo por defecto
  - ac: AC2
  - depends: C1
`;

/** The change's audit lines. */
async function auditOf(root: string): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const text = await read(root, AUDIT);
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * A standard draft that takes pending item P1 with the user's literal request, rewritten as an
 * epic and proposed: what the main session does when the draft came out too large.
 */
async function draftAsEpic() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["memory", "add", "Saludar por nombre"], CLAUDE)).code).toBe(0);
  const created = await cli(root, [
    "new",
    "Saludo personalizado",
    "--resolves",
    "P1",
    "--request",
    REQUEST,
  ]);
  expect(created.code).toBe(0);
  const before = await stateIn(root);
  await writeFiles(root, { [SPEC_PATH]: EPIC_SPEC });
  const proposed = await cli(root, ["propose"]);
  return { root, before, proposed };
}

describe("a draft that changes its kind before its first approval", () => {
  it("AC1: a standard draft proposed as an epic becomes one in place", async () => {
    const { root, before, proposed } = await draftAsEpic();
    expect(before.kind).toBe("standard");
    expect(proposed.code).toBe(0);
    const state = await stateIn(root);
    expect(state).toMatchObject({ id: CHANGE, kind: "epic", phase: "review" });
    expect(state.branch).toBe(before.branch);
    expect(state.baseCommit).toBe(before.baseCommit);
    const listed = JSON.parse((await cli(root, ["--json", "status"])).out).changes;
    expect(listed).toHaveLength(1);
  });

  it("AC2: is approved as an epic, waiting for its slices instead of going to acceptance", async () => {
    const { root } = await draftAsEpic();
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    expect(await stateIn(root)).toMatchObject({ kind: "epic", phase: "implementing" });
    const card = (await cli(root, ["next"])).out;
    expect(card).toContain(
      "CORTES (0 de 2 cerrados):\n  C1 Saludo por nombre — listo para empezar\n  C2 Saludo por defecto — espera a C1",
    );
    expect(await stateIn(root)).toMatchObject({ kind: "epic", phase: "implementing" });
  });

  it("AC3: keeps the user's literal request and the memory entries it takes", async () => {
    const { root } = await draftAsEpic();
    const [created] = await auditOf(root);
    expect(created).toMatchObject({
      event: "change.created",
      data: { kind: "standard", resolves: ["P1"], request: REQUEST },
    });
    const memory = (await cli(root, ["memory"])).out;
    expect(memory).toContain(`P1 · pendiente · tomada por ${CHANGE} · Saludar por nombre`);
    const report = (await cli(root, ["audit", CHANGE])).out;
    expect(report).toContain(`- Petición: «${REQUEST}»`);
  });

  it("AC4: records the change of kind in its proposal, and the audit shows it", async () => {
    const { root } = await draftAsEpic();
    const proposed = (await auditOf(root)).filter((line) => line.event === "spec.proposed");
    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.data).toMatchObject({
      revision: 1,
      kind: "epic",
      previousKind: "standard",
    });
    const report = (await cli(root, ["audit", CHANGE])).out;
    expect(report).toContain(`- Cambio: \`${CHANGE}\` · epic · fase review`);
    expect(report).toMatch(/\| Propuso la revisión 1 \(de standard a epic\) \|/);
  });

  it("AC4: records no kind in a proposal that keeps it", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const proposed = (await auditOf(root)).find((line) => line.event === "spec.proposed");
    expect(proposed?.data).not.toHaveProperty("kind");
    expect(proposed?.data).not.toHaveProperty("previousKind");
  });

  it("AC9: a quick draft that does not fit its lane, proposed as standard, becomes standard", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--kind", "quick", "Saludo personalizado"])).code).toBe(0);
    expect((await stateIn(root)).kind).toBe("quick");
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect(await stateIn(root)).toMatchObject({ kind: "standard", phase: "review" });
  });
});

describe("a change whose kind is fixed", () => {
  it("AC5: refuses another kind once approved, and its state does not change", async () => {
    const { root } = await draftAsEpic();
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["adjust", "Un tercer corte para las traducciones"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: EPIC_SPEC.replace("kind: epic", "kind: standard") });
    const refused = await cli(root, ["propose"]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      "El cambio se aprobó como epic y ya no puede pasar a standard; vuelve a poner `kind: epic` en el frontmatter.",
    );
    expect(await stateIn(root)).toMatchObject({ kind: "epic", phase: "adjusting" });
  });
});
