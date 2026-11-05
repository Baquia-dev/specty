// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import {
  ActionError,
  type ChangeRecord,
  type CommentRecord,
  type SectionIndexView,
  SpectyData,
} from "./records";
import { deriveReview, sectionOf } from "./review";

const SPEC = `---
kind: standard
---

# Entrar con Google

## Objetivo

Docentes y **familias** entran con su cuenta.

## Fuera de alcance

- Otros proveedores.

## Supuestos

- A1: El proyecto de Google ya existe.
  - impacto: alto
- A2: Basta con el correo verificado.
  - impacto: alto
- A3: Los tokens duran una hora.

## Criterios de aceptación

- AC1: CUANDO alguien pulsa "Entrar con Google" ENTONCES entra con su cuenta.
- AC2: La pantalla responde rápido.

## Diseño

Se usa \`google_sign_in\`.

## Archivos

- crear lib/auth/google_provider.dart — proveedor
- modificar lib/login/login_screen.dart — botón
- crear test/auth/google_provider_test.dart — pruebas

## Tareas

- [ ] T1: Proveedor de Google
  - files: lib/auth/google_provider.dart, test/auth/google_provider_test.dart
  - ac: AC1
- [ ] T2: Botón en la pantalla de entrada
  - files: lib/login/login_screen.dart
  - ac: AC1, AC2

## Riesgos

- R1: Google cambia su API. Mitigación: versión fijada.
`;

const HASH = `sha256:${"b".repeat(64)}`;

const STATE: ChangeState = {
  schema: 1,
  id: "20261021-login-google",
  kind: "standard",
  phase: "review",
  revision: 1,
  items: {
    A1: { hash: HASH, decision: "confirmed" },
    A3: { hash: HASH, decision: "rejected", comment: "Duran ocho horas." },
  },
  tasks: { T1: { status: "done", attempts: 1, scopeExtra: [] } },
  pending: { scopeRequests: [], adjustment: null },
  maxIds: {},
};

const COMMENTS: readonly CommentRecord[] = [
  {
    id: "c2",
    revision: 1,
    anchor: { section: "design", quote: "google_sign_in" },
    author: "Ana Gómez",
    body: "¿Qué versión?",
    createdAt: "2026-10-21T10:05:00.000Z",
  },
  {
    id: "c1",
    revision: 1,
    anchor: { item: "A2" },
    author: "Ana Gómez",
    body: "¿Y las cuentas sin verificar?",
    createdAt: "2026-10-21T10:00:00.000Z",
    resolvedInRevision: 2,
  },
];

const review = () => deriveReview(parseSpec(SPEC).spec, STATE, COMMENTS);

/** An epic: no files nor tasks, and its Cortes section between the criteria and the risks. */
const EPIC = `---
kind: epic
---

# Panel académico

## Objetivo

El docente sigue la asistencia y las faltas de sus cursos en un panel.

## Fuera de alcance

- Las notas.

## Supuestos

- A1: Los datos de asistencia ya existen.

## Criterios de aceptación

- AC1: CUANDO el docente abre el panel ENTONCES ve la asistencia de cada curso.
- AC2: CUANDO la familia justifica una falta ENTONCES el docente la ve justificada.

## Cortes

- C1: Asistencia por curso
  - ac: AC1
- C2: Justificar faltas
  - ac: AC2
  - depends: C1
- C3: Avisos a las familias
  - ac: AC1, AC2
  - depends: C1, C2

## Riesgos

- R1: Los datos llegan tarde. Mitigación: avisar en el panel.
`;

/** The index of a review by the key of each section. */
const byKey = (index: readonly SectionIndexView[]) =>
  Object.fromEntries(index.map((entry) => [entry.key, entry]));

const EPIC_STATE: ChangeState = {
  ...STATE,
  id: "20261101-panel-academico",
  kind: "epic",
  items: {},
  tasks: {},
};

describe("deriveReview", () => {
  it("lists assumptions with impact, decision and the reason of a rejection (AC2)", () => {
    expect(review().assumptions).toEqual([
      { id: "A1", text: "El proyecto de Google ya existe.", impact: "high", decision: "confirmed" },
      { id: "A2", text: "Basta con el correo verificado.", impact: "high", decision: "pending" },
      {
        id: "A3",
        text: "Los tokens duran una hora.",
        decision: "rejected",
        comment: "Duran ocho horas.",
      },
    ]);
  });

  it("AC1: marks the criteria the person checks by hand", () => {
    const manual = SPEC.replace(/(- AC1: [^\n]*\n)/, "$1  - test: manual\n");
    const [first, second] = deriveReview(parseSpec(manual).spec, STATE, COMMENTS).criteria;
    expect([first?.manual, second?.manual]).toEqual([true, undefined]);
  });

  it("puts warnings next to vague criteria, in both languages (AC3)", () => {
    const [clear, vague] = review().criteria;
    expect(clear?.warnings).toEqual([]);
    expect(vague?.warnings.length).toBeGreaterThan(0);
    expect(vague?.warnings[0]?.es).not.toBe(vague?.warnings[0]?.en);
    expect(vague?.warnings.map((warning) => warning.es).join(" ")).toContain("AC2");
  });

  it("groups files by module and marks sensitive paths; tasks carry status and chips (AC4)", () => {
    const { files, tasks } = review();
    // Tests go with the module they test (core's moduleOf skips `test/`).
    expect(files.map((group) => group.module)).toEqual(["auth", "login"]);
    expect(files[0]?.files.map((file) => file.path)).toContain(
      "test/auth/google_provider_test.dart",
    );
    expect(files[0]?.files[0]).toMatchObject({
      path: "lib/auth/google_provider.dart",
      action: "create",
      reason: "proveedor",
      sensitive: true,
    });
    expect(files[1]?.files[0]?.sensitive).toBe(false);
    expect(tasks).toEqual([
      {
        id: "T1",
        title: "Proveedor de Google",
        status: "done",
        ac: ["AC1"],
        files: ["lib/auth/google_provider.dart", "test/auth/google_provider_test.dart"],
        warnings: [],
      },
      {
        id: "T2",
        title: "Botón en la pantalla de entrada",
        status: "pending",
        ac: ["AC1", "AC2"],
        files: ["lib/login/login_screen.dart"],
        warnings: [expect.objectContaining({ es: expect.stringContaining("T2") })],
      },
    ]);
  });

  it("indexes every section with its pending decisions, comments and warnings (AC1)", () => {
    const { index, goal, design, risks } = review();
    expect(index.map((entry) => entry.key)).toEqual([
      "goal",
      "outOfScope",
      "assumptions",
      "criteria",
      "files",
      "tasks",
      "slices",
      "risks",
      "design",
    ]);
    const at = (key: string) => index.find((entry) => entry.key === key);
    expect(at("assumptions")).toMatchObject({ present: true, pending: 1, comments: 0 });
    expect(at("design")).toMatchObject({ present: true, comments: 1 });
    expect(at("criteria")?.warnings).toBeGreaterThan(0);
    expect(goal).toContain("**familias**");
    expect(design).toContain("google_sign_in");
    expect(risks[0]?.id).toBe("R1");
  });

  it("AC1: gives an epic's slices, with their criteria and dependencies, between tasks and risks", () => {
    const epic = deriveReview(parseSpec(EPIC).spec, EPIC_STATE, []);
    expect(epic).toMatchObject({
      slices: [
        { id: "C1", title: "Asistencia por curso", ac: ["AC1"], depends: [] },
        { id: "C2", title: "Justificar faltas", ac: ["AC2"], depends: ["C1"] },
        { id: "C3", title: "Avisos a las familias", ac: ["AC1", "AC2"], depends: ["C1", "C2"] },
      ],
    });
    expect(epic.index.filter((entry) => entry.present).map((entry) => entry.key)).toEqual([
      "goal",
      "outOfScope",
      "assumptions",
      "criteria",
      "slices",
      "risks",
    ]);
    // A spec without a Cortes section has no slices, and the section is not there.
    expect(review()).toMatchObject({ slices: [] });
    expect(byKey(review().index)).toMatchObject({ slices: { present: false } });
  });

  it("AC2: puts a comment on a slice in the Cortes section and counts the open ones there", () => {
    const comments: readonly CommentRecord[] = [
      {
        id: "c1",
        revision: 1,
        anchor: { item: "C2" },
        author: "Ana Gómez",
        body: "¿Antes que la asistencia?",
        createdAt: "2026-10-21T10:00:00.000Z",
      },
      {
        id: "c2",
        revision: 1,
        anchor: { item: "C3" },
        author: "Ana Gómez",
        body: "Ya está.",
        createdAt: "2026-10-21T10:05:00.000Z",
        resolvedInRevision: 2,
      },
    ];
    const epic = deriveReview(parseSpec(EPIC).spec, EPIC_STATE, comments);
    expect(sectionOf({ item: "C2" })).toBe("slices");
    expect(epic.comments.map((comment) => [comment.id, comment.section])).toEqual([
      ["c1", "slices"],
      ["c2", "slices"],
    ]);
    expect(byKey(epic.index)).toMatchObject({ slices: { present: true, comments: 1 } });
  });

  it("puts unresolved comments first and finds each one's section", () => {
    const { comments } = review();
    expect(comments.map((comment) => [comment.id, comment.resolved, comment.section])).toEqual([
      ["c2", false, "design"],
      ["c1", true, "assumptions"],
    ]);
    expect(sectionOf({ item: "T2" })).toBe("tasks");
    expect(sectionOf({ item: "R1" })).toBe("risks");
    expect(sectionOf({ item: "AC1" })).toBe("criteria");
    expect(sectionOf({ item: "??" })).toBe("assumptions");
  });

  it("reports validation errors that block approval, in both languages", () => {
    const broken = parseSpec("# Sin secciones\n").spec;
    const { errors, index } = deriveReview(broken, STATE, []);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.es).not.toBe(errors[0]?.en);
    expect(index.every((entry) => !entry.present)).toBe(true);
  });
});

describe("SpectyData actions", () => {
  class ReadOnly extends SpectyData {
    changes(): Promise<readonly ChangeRecord[]> {
      return Promise.resolve([]);
    }
    subscribe(): () => void {
      return () => undefined;
    }
  }

  it("fail as read-only unless the source implements them (AC9)", async () => {
    const source = new ReadOnly();
    for (const action of [
      source.decideAssumption("x", "A1", "confirmed"),
      source.addComment("x", { item: "A1" }, "hola"),
      source.requestChanges("x"),
      source.approve("x", 1),
    ]) {
      await expect(action).rejects.toBeInstanceOf(ActionError);
    }
    await source.approve("x", 1).catch((error: ActionError) => {
      expect(error.text.es).toContain("solo lectura");
      expect(error.message).toContain("read-only");
    });
  });
});
