// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  nextCard,
  renderText,
  type SliceView,
  type TaskView,
} from "../../src";
import { awayEpicCard } from "../../src/cards/epic";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const EPIC = "20261024-panel-del-estudiante";
const FOLDER = "/repos/app.worktrees/20261025-el-panel";

const slice = (
  id: string,
  status: SliceView["status"],
  extra: Partial<SliceView> = {},
): SliceView => ({ id, title: `Corte ${id}`, depends: [], status, ...extra });

const epic = (phase: ChangeView["phase"], slices: readonly SliceView[]): ChangeView => ({
  id: EPIC,
  kind: "epic",
  phase,
  title: "Panel del estudiante",
  specPath: `.specty/changes/${EPIC}/spec.md`,
  revision: 1,
  tasks: [],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  slices,
});

const card = (change: ChangeView, ctx = ES) =>
  renderText(nextCard({ change, dirty: [] }, ctx), ctx.lang);

const DONE = slice("C1", "done", { child: { id: "20261024-inicio", phase: "done" } });
const OPEN = slice("C2", "open", {
  depends: ["C1"],
  child: { id: "20261025-el-panel", phase: "implementing", folder: FOLDER },
});

describe("the epic card", () => {
  it("lists every slice with its state, and never asks for an accept (AC1)", () => {
    const text = card(
      epic("implementing", [
        DONE,
        OPEN,
        slice("C3", "ready"),
        slice("C4", "waiting", { depends: ["C2", "C3"] }),
      ]),
    );
    expect(text).toContain(
      [
        "CORTES (1 de 4 cerrados):",
        "  C1 Corte C1 — cerrado (20261024-inicio)",
        "  C2 Corte C2 — en curso: 20261025-el-panel, en implementing",
        "  C3 Corte C3 — listo para empezar",
        "  C4 Corte C4 — espera a C2, C3",
      ].join("\n"),
    );
    expect(text).toContain(
      `SIGUIENTE: sigue con el corte C2 en su carpeta, ${FOLDER}: ejecuta \`specty next\` allí.`,
    );
    expect(text).not.toContain("accept");
  });

  it("proposes the first ready slice when none is in progress (AC1)", () => {
    const text = card(epic("implementing", [DONE, slice("C2", "ready"), slice("C3", "ready")]));
    expect(text).toContain(
      `SIGUIENTE: empieza el corte C2: \`specty new "Corte C2" --epic ${EPIC} --slice C2\` y sigue su salida.`,
    );
    const english = card(epic("implementing", [slice("C1", "ready")]), EN);
    expect(english).toContain("SLICES (0 of 1 closed):\n  C1 Corte C1 — ready to start");
    expect(english).toContain(`\`specty new "Corte C1" --epic ${EPIC} --slice C1\``);
  });

  it("says when no slice can start (AC1)", () => {
    const stuck = card(epic("implementing", [slice("C1", "waiting", { depends: ["C2"] })]));
    expect(stuck).toContain("ningún corte puede empezar");
    expect(card(epic("implementing", [DONE]))).toContain(
      "SIGUIENTE: todos los cortes están cerrados: ejecuta `specty next`",
    );
  });

  it("AC3: recommends drafting specs of ready slices for parallel agent work", () => {
    const text = card(epic("implementing", [slice("C1", "ready"), slice("C2", "ready")]));
    expect(text).toContain("paralelo");
    const english = card(epic("implementing", [slice("C1", "ready"), slice("C2", "ready")]), EN);
    expect(english).toContain("parallel");
  });

  it("lists the closed slices in the acceptance card (AC2)", () => {
    const text = card(epic("acceptance", [DONE]));
    expect(text).toContain("CORTES:\n  C1 Corte C1 — cerrado (20261024-inicio)");
    expect(text).not.toContain("TAREAS HECHAS");
  });
});

/** Claude Code, whose subagents take an epic's slices (ARCHITECTURE §10). */
const CLAUDE: CardContext = { ...ES, tool: "claude-code" };
const CLAUDE_EN: CardContext = { ...EN, tool: "claude-code" };
const NOTES = "20261026-las-notas";
const NOTES_FOLDER = `/repos/app/.worktrees/${NOTES}`;
/** C3 in progress, and no conversation holds it: an orphan. */
const ORPHAN = slice("C3", "open", {
  child: { id: NOTES, phase: "implementing", folder: NOTES_FOLDER, orphan: true },
});

/** How a brief asks to wait for the person: as Claude Code runs `specty wait`, or Antigravity. */
const WAIT_STEP = {
  claude:
    "ejecuta `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.",
  antigravity:
    "ejecuta `specty wait` para esperar su decisión. Ejecútalo y deja que pase a segundo plano, que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.",
};

/** The brief of a ready slice, as the card shows it in Spanish. */
const readyBrief = (id: string, wait = WAIT_STEP.claude) =>
  [
    `ENCARGO ${id}:`,
    `  Haz el corte ${id} con sus tareas en orden y sin lanzar otros subagentes:`,
    `  1. \`specty new "Corte ${id}" --epic ${EPIC} --slice ${id} --subagent\``,
    "  2. `specty enter <id>`, con el id que te dé `new`.",
    "  3. Tu `cd` no dura entre comandos: empieza cada uno con `cd '<carpeta del cambio>' &&` y usa rutas absolutas de esa carpeta.",
    `  4. Sigue \`specty next\` hasta cerrarlo; cuando espere a la persona, ${wait}`,
    "  5. Responde en tres líneas: el cambio, su fase y lo que falta.",
  ].join("\n");

const LAUNCH =
  "SIGUIENTE: lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual; cuando terminen, vuelve a ejecutar `specty next` aquí, en la épica.";

describe("the card of an epic whose tool hands its slices to subagents", () => {
  it("AC1: brings a brief per ready slice, and asks to launch a subagent per brief in parallel", () => {
    const text = card(
      epic("implementing", [
        DONE,
        slice("C2", "ready"),
        slice("C3", "ready"),
        slice("C4", "waiting", { depends: ["C2"] }),
      ]),
      CLAUDE,
    );
    expect(text).toContain("  C2 Corte C2 — listo para empezar");
    expect(text).toContain("ENCARGO C2:");
    expect(text).toContain("ENCARGO C3:");
    expect(text).not.toContain("ENCARGO C1");
    expect(text).not.toContain("ENCARGO C4");
    expect(text.endsWith(LAUNCH)).toBe(true);
    // A single ready slice goes to a subagent too.
    const one = card(epic("implementing", [slice("C1", "ready")]), CLAUDE);
    expect(one).toContain("ENCARGO C1:");
    expect(one).toContain(LAUNCH);
    const english = card(epic("implementing", [slice("C1", "ready")]), CLAUDE_EN);
    expect(english).toContain("BRIEF C1:");
    expect(english).toContain(
      "NEXT: launch in parallel, in a single message, one subagent per brief with its text as is; once they finish, run `specty next` again here, in the epic.",
    );
  });

  it("AC2: the brief says how to create its change, enter it, work in its folder, wait and answer", () => {
    expect(card(epic("implementing", [slice("C2", "ready")]), CLAUDE)).toContain(readyBrief("C2"));
    const english = card(epic("implementing", [slice("C2", "ready")]), CLAUDE_EN);
    expect(english).toContain(
      [
        "BRIEF C2:",
        "  Do slice C2 with its tasks in order and without launching other subagents:",
        `  1. \`specty new "Corte C2" --epic ${EPIC} --slice C2 --subagent\``,
        "  2. `specty enter <id>`, with the id `new` gives you.",
        "  3. Your `cd` does not last between commands: start each one with `cd '<change folder>' &&` and use absolute paths in that folder.",
        "  4. Follow `specty next` until it is closed; when it waits for the person, run `specty wait` to wait for their decision. Run it in the background (`run_in_background: true`), which tells you when it ends, and run it again each time it times out or is cut off.",
        "  5. Answer in three lines: the change, its phase and what is left.",
      ].join("\n"),
    );
  });

  it("AC3: is today's card with no tool, with one that cannot hand slices out, or with subagents: false", () => {
    const change = epic("implementing", [DONE, OPEN, slice("C3", "ready")]);
    const today = card(change);
    expect(today).not.toContain("ENCARGO");
    expect(today).toContain(
      `SIGUIENTE: sigue con el corte C2 en su carpeta, ${FOLDER}: ejecuta \`specty next\` allí.`,
    );
    for (const tool of ["gemini-cli", "windsurf", "copilot"] as const) {
      expect(card(change, { ...ES, tool })).toBe(today);
    }
    expect(card(change, { ...CLAUDE, subagents: false })).toBe(today);
    const ready = epic("implementing", [slice("C1", "ready")]);
    expect(card(ready, { ...CLAUDE, subagents: false })).toBe(card(ready));
  });

  it("AC4: brings the brief of a slice a closed one left ready, and the one to resume an orphan", () => {
    const left = card(
      epic("implementing", [DONE, slice("C2", "ready", { depends: ["C1"] })]),
      CLAUDE,
    );
    expect(left).toContain(readyBrief("C2"));
    const text = card(epic("implementing", [DONE, OPEN, ORPHAN]), CLAUDE);
    expect(text).toContain(
      [
        "ENCARGO C3 (huérfano):",
        "  Retoma el corte C3 con sus tareas en orden y sin lanzar otros subagentes:",
        `  1. \`specty enter ${NOTES}\``,
        `  2. Tu \`cd\` no dura entre comandos: empieza cada uno con \`cd '${NOTES_FOLDER}' &&\` y usa rutas absolutas de esa carpeta.`,
        `  3. Sigue \`specty next\` hasta cerrarlo; cuando espere a la persona, ${WAIT_STEP.claude}`,
        "  4. Responde en tres líneas: el cambio, su fase y lo que falta.",
      ].join("\n"),
    );
    expect(text).not.toContain("ENCARGO C2");
    expect(text).toContain(LAUNCH);
    // Its folder is quoted as the guard quotes it, so the command it asks for is the one it takes.
    const quoted = slice("C3", "open", {
      child: { id: NOTES, phase: "implementing", folder: "/repos/l'app/notas", orphan: true },
    });
    expect(card(epic("implementing", [quoted]), CLAUDE)).toContain(
      "`cd '/repos/l'\\''app/notas' &&`",
    );
    expect(card(epic("implementing", [ORPHAN]), CLAUDE_EN)).toContain(
      "BRIEF C3 (orphaned):\n  Resume slice C3 with its tasks in order and without launching other subagents:",
    );
  });

  it("AC5: leaves a slice its subagent holds in progress, without a brief, and waits in the epic", () => {
    const text = card(
      epic("implementing", [DONE, OPEN, slice("C3", "waiting", { depends: ["C2"] })]),
      CLAUDE,
    );
    expect(text).toContain("  C2 Corte C2 — en curso: 20261025-el-panel, en implementing");
    expect(text).not.toContain("ENCARGO");
    expect(text).toContain(
      "SIGUIENTE: los cortes en curso siguen con sus subagentes: espera sus informes y, cuando terminen, vuelve a ejecutar `specty next` aquí, en la épica.",
    );
    expect(text).not.toContain(FOLDER);
    // With a ready one, only that one has a brief.
    const ready = card(epic("implementing", [DONE, OPEN, slice("C3", "ready")]), CLAUDE);
    expect(ready).not.toContain("ENCARGO C2");
    expect(ready).toContain("ENCARGO C3:");
    expect(card(epic("implementing", [DONE, OPEN]), CLAUDE_EN)).toContain(
      "NEXT: the slices in progress go on with their subagents: wait for their reports and, once they finish, run `specty next` again here, in the epic.",
    );
    // With nothing in progress nor ready, it says what it says today.
    const stuck = epic("implementing", [slice("C1", "waiting", { depends: ["C2"] })]);
    expect(card(stuck, CLAUDE)).toBe(card(stuck));
  });
});

/** The same epic, in a worktree of its own: Claude Code's session entered it with `EnterWorktree`. */
const apart = (change: ChangeView): ChangeView => ({ ...change, inWorktree: true });

const LEAVE =
  'SIGUIENTE: sal antes de la carpeta de la épica sin borrarla (en Claude Code, `ExitWorktree` con `action: "keep"`), porque desde ella tus subagentes no pueden escribir en las carpetas de sus cortes; después, lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual y, cuando terminen, ejecuta `specty next` en la carpeta principal.';

describe("the card of an epic in a worktree of its own, from Claude Code", () => {
  it("AC1: asks to leave the epic's folder without removing it before launching the briefs", () => {
    const text = card(apart(epic("implementing", [DONE, slice("C2", "ready")])), CLAUDE);
    expect(text).toContain("ENCARGO C2:");
    expect(text.endsWith(LEAVE)).toBe(true);
    // An orphan's brief is launched the same way.
    expect(card(apart(epic("implementing", [ORPHAN])), CLAUDE)).toContain(LEAVE);
    expect(card(apart(epic("implementing", [slice("C1", "ready")])), CLAUDE_EN)).toContain(
      "NEXT: leave the epic's folder first without removing it (in Claude Code, `ExitWorktree` with `action: \"keep\"`), since from it your subagents cannot write in their slices' folders; then launch in parallel, in a single message, one subagent per brief with its text as is and, once they finish, run `specty next` in the main folder.",
    );
  });

  it("AC2: is today's card in the main folder, with no brief to launch, or with no tool that moves its session", () => {
    const ready = epic("implementing", [slice("C1", "ready")]);
    expect(card(ready, CLAUDE)).toContain(LAUNCH);
    expect(card(ready, CLAUDE)).not.toContain("ExitWorktree");
    // The slices in progress go on with their subagents: nothing to launch, nothing to leave.
    const waiting = epic("implementing", [DONE, OPEN]);
    expect(card(apart(waiting), CLAUDE)).toBe(card(waiting, CLAUDE));
    for (const ctx of [ES, { ...ES, tool: "codex" as const }, { ...CLAUDE, subagents: false }]) {
      expect(card(apart(ready), ctx)).toBe(card(ready, ctx));
    }
  });
});

/** Antigravity, whose subagents of `invoke_subagent` take an epic's slices (ARCHITECTURE §10). */
const ANTIGRAVITY: CardContext = { ...ES, tool: "antigravity" };
const ANTIGRAVITY_EN: CardContext = { ...EN, tool: "antigravity" };

const AGY_LAUNCH =
  'SIGUIENTE: lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual (en Antigravity, `invoke_subagent` con `Workspace: "inherit"`, no `branch`, que le daría una carpeta que no es la de su corte); cuando terminen, vuelve a ejecutar `specty next` aquí, en la épica.';

describe("the card of an epic from Antigravity", () => {
  it("AC2: brings a brief per ready or orphaned slice, and asks to launch each with invoke_subagent and Workspace inherit", () => {
    const change = epic("implementing", [DONE, slice("C2", "ready"), ORPHAN]);
    const text = card(change, ANTIGRAVITY);
    expect(text).toContain(readyBrief("C2", WAIT_STEP.antigravity));
    expect(text).toContain("ENCARGO C3 (huérfano):");
    expect(text.endsWith(AGY_LAUNCH)).toBe(true);
    expect(card(epic("implementing", [slice("C1", "ready")]), ANTIGRAVITY_EN)).toContain(
      'NEXT: launch in parallel, in a single message, one subagent per brief with its text as is (in Antigravity, `invoke_subagent` with `Workspace: "inherit"`, not `branch`, which would give it a folder other than its slice\'s); once they finish, run `specty next` again here, in the epic.',
    );
  });

  it("AC2: asks the same from outside the epic's folder, and leaves the other tools' card as it was", () => {
    const away = awayEpicCard(epic("implementing", [slice("C1", "ready")]), "/repos", ANTIGRAVITY);
    expect(away?.next).toContain(
      '(en Antigravity, `invoke_subagent` con `Workspace: "inherit"`, no `branch`, que le daría una carpeta que no es la de su corte); cuando terminen, vuelve a ejecutar `specty next` aquí.',
    );
    const ready = epic("implementing", [slice("C1", "ready")]);
    for (const ctx of [CLAUDE, CLAUDE_EN, { ...ES, tool: "codex" as const }]) {
      expect(card(ready, ctx)).not.toContain("invoke_subagent");
    }
    expect(card(ready, CLAUDE)).toContain(LAUNCH);
    // With nothing to launch, it waits as with any other tool.
    const waiting = epic("implementing", [DONE, OPEN]);
    expect(card(waiting, ANTIGRAVITY)).toBe(card(waiting, CLAUDE));
    expect(card(waiting, { ...ANTIGRAVITY, subagents: false })).toBe(card(waiting));
  });
});

describe("the brief of a slice", () => {
  it("AC1, AC4: waits for the person with the sentence every other output uses, in its tool's way", () => {
    const ready = epic("implementing", [slice("C2", "ready")]);
    expect(card(ready, CLAUDE)).toContain(`cuando espere a la persona, ${WAIT_STEP.claude}`);
    expect(card(ready, ANTIGRAVITY)).toContain(
      `cuando espere a la persona, ${WAIT_STEP.antigravity}`,
    );
    expect(card(ready, { ...EN, tool: "codex" })).toContain(
      "when it waits for the person, run `specty wait` to wait for their decision. If it is still running, poll its output until it ends, and run it again each time it times out or is cut off.",
    );
  });
});

const task = (id: string, status: TaskView["status"]): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status,
  files: ["src/progreso.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
});

/** A feature on its own; a slice of an epic is a change like it, with its own tasks. */
const feature = (phase: ChangeView["phase"]): ChangeView => ({
  id: "20261026-el-progreso",
  kind: "standard",
  phase,
  title: "El progreso",
  specPath: ".specty/changes/20261026-el-progreso/spec.md",
  revision: 1,
  tasks: [task("T1", "active"), task("T2", "pending")],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
});

describe("the cards of a change that is not an epic", () => {
  it("AC6: never ask to launch subagents, and take its tasks in order", () => {
    for (const ctx of [CLAUDE, CLAUDE_EN]) {
      for (const phase of ["draft", "implementing"] as const) {
        const text = card(feature(phase), ctx);
        expect(text).not.toMatch(/subagent/i);
        expect(text).not.toMatch(/ENCARGO|BRIEF/);
      }
    }
    expect(card(feature("implementing"), CLAUDE)).toContain(
      "SIGUIENTE: implementa T1 y ejecuta `specty task done T1",
    );
  });
});
