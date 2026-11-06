// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type AgentTool,
  type CardContext,
  type ChangeView,
  type NextView,
  nextCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const CLAUDE: CardContext = { ...ES, tool: "claude-code" };

const card = (view: NextView, ctx: CardContext) => renderText(nextCard(view, ctx), ctx.lang);
const idle = (ctx: CardContext) => card({ dirty: [] }, ctx);

/** How Claude Code waits for the person, as the brief of an epic's slice already says it. */
const WAIT =
  "ejecuta `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.";

/** The brief of a change, as the card shows it in Spanish, with the `new` it starts with. */
const brief = (
  start = '`specty new "<título>" --request "<petición literal del usuario>" --subagent`',
) =>
  [
    "ENCARGO:",
    "  Haz el cambio que pidió el usuario, de su spec a su cierre, sin lanzar otros subagentes:",
    `  1. ${start}`,
    "  2. `specty enter <id>`, con el id que te dé `new`.",
    "  3. Tu `cd` no dura entre comandos: empieza cada uno con `cd '<carpeta del cambio>' &&` y usa rutas absolutas de esa carpeta.",
    `  4. Sigue \`specty next\` hasta cerrarlo; cuando espere a la persona, ${WAIT}`,
    "  5. Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
    "  6. Responde en tres líneas: el cambio, su fase y lo que falta.",
  ].join("\n");

const QUICK = "(añade `--kind quick` si son hasta 3 archivos de código sin rutas sensibles)";

/** The card's next step, with what goes in place of the brief's markers. */
const launch = (markers: string, how = "") =>
  `SIGUIENTE: lanza un subagente por cada cambio que pidió el usuario, con el encargo tal cual${how}, y pon en él su título y su petición literal en lugar de ${markers} ${QUICK}; si son varios, lánzalos en paralelo, en un solo mensaje. No entres en sus carpetas, y una épica créala tú aquí, sin subagente. Si uno vuelve con una pregunta, házsela al usuario y pásale la respuesta (en Claude Code, con \`SendMessage\`); cuando terminen, vuelve a ejecutar \`specty next\` aquí.`;

const MARKERS = "`<título>` y `<petición literal del usuario>`";

describe("the card with no change active, when the tool hands changes to subagents", () => {
  it("AC1: brings a change's brief and asks for one subagent per change the user asked for", () => {
    const text = idle(CLAUDE);
    expect(text).toContain("No hay un cambio activo.");
    expect(text).toContain("Si el usuario pidió crear o modificar código, primero va la spec.");
    expect(text).toContain(brief());
    expect(text.split("\n").at(-1)).toBe(launch(MARKERS));
    expect(text).not.toContain('SIGUIENTE: ejecuta `specty new "<título>"');
  });

  it("AC1: with every tool that hands work to subagents", () => {
    const tools: readonly AgentTool[] = [
      "claude-code",
      "codex",
      "opencode",
      "cursor",
      "antigravity",
    ];
    for (const tool of tools) {
      const text = idle({ ...ES, tool });
      expect(text, tool).toContain("ENCARGO:");
      expect(text, tool).toContain(
        '  1. `specty new "<título>" --request "<petición literal del usuario>" --subagent`',
      );
      expect(text, tool).toContain(
        "SIGUIENTE: lanza un subagente por cada cambio que pidió el usuario",
      );
    }
  });

  it("AC2: is today's card with subagents: false, or with a tool that cannot take them", () => {
    const today = idle(ES);
    expect(today).not.toContain("ENCARGO");
    expect(today).toContain('SIGUIENTE: ejecuta `specty new "<título>"');
    expect(idle({ ...CLAUDE, subagents: false })).toBe(today);
    const without: readonly AgentTool[] = ["gemini-cli", "copilot", "windsurf"];
    for (const tool of without) expect(idle({ ...ES, tool }), tool).toBe(today);
  });

  it("AC3: names the commit type in the brief's new when git.flow names branches by type", () => {
    const text = idle({ ...CLAUDE, branchTypes: true });
    expect(text).toContain(
      brief(
        '`specty new "<título>" --type <tipo> --request "<petición literal del usuario>" --subagent`',
      ),
    );
    expect(text.split("\n").at(-1)).toBe(
      launch(
        `${MARKERS}, y en \`<tipo>\` el tipo de commit que es el cambio, que nombra su rama: feat, fix, refactor, perf, test, docs, chore, build, ci, style, hotfix, release o support`,
      ),
    );
  });

  it("AC4: asks Antigravity to launch each brief in the conversation's own workspace", () => {
    const text = idle({ ...ES, tool: "antigravity" });
    expect(text.split("\n").at(-1)).toContain(
      'con el encargo tal cual (en Antigravity, `invoke_subagent` con `Workspace: "inherit"`, no `branch`, que le daría una carpeta que no es la de su cambio), y pon en él',
    );
  });

  it("AC5: keeps today's card for a new project and for code changed without a spec", () => {
    expect(card({ dirty: [], fresh: true }, CLAUDE)).toBe(card({ dirty: [], fresh: true }, ES));
    expect(card({ dirty: ["src/app.ts"] }, CLAUDE)).toBe(card({ dirty: ["src/app.ts"] }, ES));
    expect(card({ dirty: [], fresh: true }, CLAUDE)).not.toContain("ENCARGO");
  });

  it("AC6: in English", () => {
    const text = idle({ ...EN, tool: "claude-code" });
    expect(text).toContain(
      [
        "BRIEF:",
        "  Do the change the user asked for, from its spec to its closing, without launching other subagents:",
        '  1. `specty new "<title>" --request "<the user\'s literal request>" --subagent`',
        "  2. `specty enter <id>`, with the id `new` gives you.",
        "  3. Your `cd` does not last between commands: start each one with `cd '<change folder>' &&` and use absolute paths in that folder.",
        "  4. Follow `specty next` until it is closed; when it waits for the person, run `specty wait`",
      ].join("\n"),
    );
    expect(text).toContain(
      [
        "  5. If the spec needs an answer from the user, do not assume it: stop and answer with the question.",
        "  6. Answer in three lines: the change, its phase and what is left.",
      ].join("\n"),
    );
    expect(text.split("\n").at(-1)).toBe(
      "NEXT: launch one subagent per change the user asked for, with the brief as is, putting in it its title and literal request in place of `<title>` and `<the user's literal request>` (add `--kind quick` for up to 3 code files without sensitive paths); if there are several, launch them in parallel, in a single message. Do not enter their folders, and create an epic yourself here, without a subagent. If one comes back with a question, ask the user and pass it the answer (in Claude Code, with `SendMessage`); once they finish, run `specty next` again here.",
    );
  });

  it("AC6: leaves the card of an epic that hands out its slices as it was", () => {
    const epic: ChangeView = {
      id: "20261024-panel",
      kind: "epic",
      phase: "implementing",
      title: "Panel",
      specPath: ".specty/changes/20261024-panel/spec.md",
      revision: 1,
      tasks: [],
      conventions: [],
      pendingScope: [],
      rejected: [],
      closingSubmitted: false,
      specChanged: false,
      slices: [{ id: "C1", title: "Corte C1", depends: [], status: "ready" }],
    };
    const text = card({ change: epic, dirty: [] }, CLAUDE);
    expect(text).toContain(
      "ENCARGO C1:\n  Haz el corte C1 con sus tareas en orden y sin lanzar otros subagentes:",
    );
    expect(text).toContain("  5. Responde en tres líneas: el cambio, su fase y lo que falta.");
    expect(text).not.toContain("Haz el cambio que pidió el usuario");
    expect(text).not.toContain("detente y responde con la pregunta");
  });
});
