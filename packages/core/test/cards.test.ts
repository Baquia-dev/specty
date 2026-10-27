// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  detectAgentTool,
  type EffortRecommendation,
  effortLine,
  flowBlock,
  hasBlock,
  humanSections,
  nextCard,
  parseSpec,
  personAtTerminal,
  removeBlock,
  renderText,
  type StatusEntry,
  specTemplate,
  statusCard,
  type TaskView,
  upsertBlock,
} from "../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const task = (id: string, status: TaskView["status"]): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status,
  files: ["src/a.ts"],
  extras: [],
  criteria: [{ id: "AC1", text: "CUANDO x ENTONCES y." }],
  verify: "pnpm test",
  effort: "medium",
  ...(status === "done" ? { summary: "Hecho", commit: "abc1234" } : {}),
});
const view = (phase: ChangeView["phase"], tasks: TaskView[] = []): ChangeView => ({
  id: "20261021-x",
  kind: "standard",
  phase,
  title: "X",
  specPath: ".specty/changes/20261021-x/spec.md",
  branch: "specty/20261021-x",
  revision: 2,
  tasks,
  conventions: ["src/AGENTS.md"],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
});
const text = (change?: ChangeView) =>
  renderText(nextCard({ ...(change !== undefined ? { change } : {}), dirty: [] }, ES), "es");

describe("next cards", () => {
  it("ends every card with the exact next action", () => {
    for (const phase of [
      "draft",
      "review",
      "acceptance",
      "adjusting",
      "closing",
      "done",
      "cancelled",
    ] as const) {
      expect(text(view(phase)).split("\n").at(-1), phase).toMatch(/^SIGUIENTE: .*`specty /);
    }
    expect(text().split("\n").at(-1)).toBe(
      'SIGUIENTE: ejecuta `specty new "<título>" --request "<petición literal del usuario>"` (añade `--kind quick` si son hasta 3 archivos de código sin rutas sensibles).',
    );
    const en = renderText(nextCard({ dirty: [] }, { ...ES, lang: "en" }), "en");
    expect(en).toContain('`specty new "<title>" --request "<the user\'s literal request>"`');
  });

  it("asks for the change's type when the flow names the branches by it (AC1)", () => {
    const typed = { ...ES, branchTypes: true };
    expect(
      renderText(nextCard({ dirty: [] }, typed), "es")
        .split("\n")
        .at(-1),
    ).toBe(
      'SIGUIENTE: ejecuta `specty new "<título>" --type <tipo> --request "<petición literal del usuario>"`, con el tipo de commit que es el cambio, que nombra su rama: feat, fix, refactor, perf, test, docs, chore, build, ci o style (añade `--kind quick` si son hasta 3 archivos de código sin rutas sensibles).',
    );
    const en = renderText(nextCard({ dirty: [] }, { ...typed, lang: "en" }), "en");
    expect(en).toContain(
      'run `specty new "<title>" --type <type> --request "<the user\'s literal request>"`, with the commit type the change is, which names its branch: feat, fix, refactor, perf, test, docs, chore, build, ci or style (add',
    );
  });

  it("shows the user's literal request while drafting, when there is one", () => {
    const request = "Que el saludo use el nombre.\nY que no grite.";
    const card = text({ ...view("draft"), request });
    expect(card).toContain(
      "PETICIÓN DEL USUARIO:\n  Que el saludo use el nombre.\n  Y que no grite.\nCÓMO REDACTARLA:",
    );
    expect(text(view("draft"))).not.toContain("PETICIÓN DEL USUARIO");
  });

  it("gives the task card everything for one task", () => {
    const card = text(view("implementing", [task("T1", "done"), task("T2", "active")]));
    expect(card).toContain("SPECTY · 20261021-x · implementing · tarea 2 de 2");
    expect(card).toContain("TAREA T2: Tarea T2");
    expect(card).toContain("AC1: CUANDO x ENTONCES y.");
    expect(card).toContain("T1 Hecho (abc1234)");
    expect(card).toContain("CONVENCIONES:\n  src/AGENTS.md");
    expect(card).toContain("SIGUIENTE: implementa T2 y ejecuta `specty task done T2");
  });

  it("gives the agent the changes the person asked for in the review", () => {
    const requested: ChangeView["requested"] = [
      { id: "c1", anchor: { item: "A2" }, body: "Por trimestres." },
      { id: "c2", anchor: { section: "design", quote: "Container" }, body: "Usa CaChip." },
      { id: "c3", anchor: { section: "extra", quote: "x" }, body: "Revisa." },
    ];
    const card = text({ ...view("review"), requested });
    expect(card).toContain(
      "CAMBIOS PEDIDOS:\n  c1 · A2: Por trimestres.\n  c2 · Diseño «Container»: Usa CaChip.\n  c3 · extra «x»: Revisa.",
    );
    expect(card).not.toContain("SUPUESTOS RECHAZADOS");
    expect(card).toContain(
      "SIGUIENTE: corrige .specty/changes/20261021-x/spec.md y ejecuta `specty propose`.",
    );
    const english = renderText(
      nextCard({ change: { ...view("review"), requested }, dirty: [] }, { ...ES, lang: "en" }),
      "en",
    );
    expect(english).toContain('c2 · Design "Container": Usa CaChip.');
    expect(text({ ...view("review"), requested: [] })).toContain(
      "Esperando la revisión del usuario",
    );
  });

  it("blocks when the approved spec was edited", () => {
    const card = nextCard(
      { change: { ...view("implementing", [task("T1", "active")]), specChanged: true }, dirty: [] },
      ES,
    );
    expect(card.status).toBe("blocked");
  });

  it("puts a pending incorporation before the phase's work", () => {
    const paths = Array.from({ length: 22 }, (_, index) => `src/f${index + 1}.ts`);
    const closing: ChangeView = {
      ...view("closing"),
      closingSubmitted: true,
      integration: { target: "main", reason: "conflicts", conflicts: ["src/f1.ts"], paths },
    };
    expect(text(closing)).toBe(
      [
        "SPECTY · 20261021-x · closing · incorporando main",
        "Incorporar main a este cambio dio conflictos; el merge espera en esta carpeta.",
        "CONFLICTOS:",
        "  src/f1.ts",
        "PUEDES TOCAR:",
        ...paths.slice(0, 20).map((path) => `  ${path}`),
        "  y 2 más",
        "SIGUIENTE: resuelve los conflictos sin dejar marcadores (`<<<<<<<`) y ejecuta `specty integrate`.",
      ].join("\n"),
    );
    const failing: ChangeView = {
      ...view("acceptance"),
      integration: { target: "main", reason: "verify", conflicts: [], paths: ["src/a.ts"] },
    };
    const english = renderText(
      nextCard({ change: failing, dirty: [] }, { ...ES, lang: "en" }),
      "en",
    );
    expect(english).toContain("SPECTY · 20261021-x · acceptance · merging main");
    expect(english).toContain("With main merged in, the verification fails");
    expect(english).not.toContain("CONFLICTS");
    expect(english).toContain("NEXT: fix what fails and run `specty integrate`.");
    expect(text(view("closing"))).toContain("CÓMO CERRAR:");
  });

  it("asks to document changes made without a spec", () => {
    const card = nextCard({ dirty: ["src/a.ts"] }, ES);
    expect(card.status).toBe("blocked");
    expect(card.next).toContain("specty retro");
  });

  it("lists open changes and the decision the person owes", () => {
    const card = statusCard(
      [
        {
          id: "20261021-x",
          kind: "standard",
          phase: "review",
          title: "X",
          waitingFor: "human",
          current: true,
          pendingScope: [],
        },
      ],
      ES,
    );
    expect(card.next).toBe("te toca decidir en 20261021-x: `specty approve`.");
  });

  it("shows where each change lives and the decision owed in another folder", () => {
    const here: StatusEntry = {
      id: "a",
      kind: "standard",
      phase: "implementing",
      title: "A",
      waitingFor: "agent",
      current: true,
      pendingScope: [],
    };
    const there: StatusEntry = {
      ...here,
      id: "b",
      phase: "acceptance",
      title: "B",
      waitingFor: "human",
      current: false,
      folder: "../repo.worktrees/b",
    };
    const card = statusCard([here, there], ES);
    const text = renderText(card, "es");
    expect(text).toContain("▸ a · standard · implementing · espera al agente — A\n");
    expect(text).toContain(
      "  b · standard · acceptance · espera a ti — B · en ../repo.worktrees/b",
    );
    expect(card.next).toBe("te toca decidir en b: `specty accept`.");
    const english = renderText(statusCard([there], { ...ES, lang: "en" }), "en");
    expect(english).toContain(
      "b · standard · acceptance · waits for you — B · in ../repo.worktrees/b",
    );
  });
});

describe("effort", () => {
  it("recommends implementing and reviewing once the spec is written", () => {
    const effort: EffortRecommendation = { plan: "high", implement: "medium" };
    expect(effortLine(effort, ES)).toBe(
      "ESFUERZO RECOMENDADO: implementación medio · revisiones de la spec y del alcance: alto",
    );
    expect(effortLine(effort, { ...ES, lang: "en", tool: "claude-code" })).toBe(
      "RECOMMENDED EFFORT (Claude Code): implementation medium · spec and scope reviews: high",
    );
  });

  it("names the levels as Codex does, its maximum being `xhigh` (AC4)", () => {
    expect(effortLine({ plan: "max", implement: "high" }, { ...ES, tool: "codex" })).toBe(
      "ESFUERZO RECOMENDADO (Codex): implementación high · revisiones de la spec y del alcance: xhigh",
    );
    expect(
      effortLine({ plan: "medium", implement: "low" }, { ...ES, lang: "en", tool: "codex" }),
    ).toBe("RECOMMENDED EFFORT (Codex): implementation low · spec and scope reviews: medium");
  });
});

describe("AGENTS.md blocks", () => {
  it("inserts blocks after the title and replaces them in place", () => {
    const first = upsertBlock("# Proyecto\n\nTexto humano.\n", "flow", "uno");
    expect(first).toBe(
      "# Proyecto\n\n<!-- specty:begin id=flow -->\nuno\n<!-- specty:end id=flow -->\n\nTexto humano.\n",
    );
    const second = upsertBlock(first, "flow", "dos");
    expect(second).toContain("dos");
    expect(second).not.toContain("uno");
    expect(second).toContain("Texto humano.");
    expect(hasBlock(second, "flow")).toBe(true);
  });

  it("takes a block out and leaves the text as it was before it", () => {
    const human = "# Proyecto\n\nTexto humano.\n";
    const withBoth = upsertBlock(upsertBlock(human, "project", "hechos"), "flow", "uno");
    expect(removeBlock(removeBlock(withBoth, "flow"), "project")).toBe(human);
    expect(removeBlock(upsertBlock("", "flow", "uno"), "flow")).toBe("");
    expect(removeBlock(`${human}\n${upsertBlock("", "flow", "uno")}`, "flow")).toBe(human);
    expect(removeBlock(human, "flow")).toBe(human);
  });

  it("keeps the flow block to the flow and the five rules no tool can verify (AC4)", () => {
    const es = flowBlock("es", "specty").split("\n");
    expect(es.length).toBeLessThanOrEqual(15);
    expect(es.slice(-6)).toEqual([
      "## Reglas (Specty)",
      "- Antes de reportar una tarea como terminada, ejecuta `specty check --changed --spec` y corrige todos los fallos. No reportes con fallos pendientes.",
      "- Antes de crear un módulo, caso de uso, componente o pantalla, busca uno equivalente en el repo y replica su estructura.",
      "- Localiza el código con búsquedas dirigidas por símbolo o texto y lee solo los fragmentos necesarios, no archivos completos.",
      "- Edita con cambios puntuales; no reescribas archivos completos para cambios pequeños.",
      "- Reporte final breve: qué cambió, qué se verificó y qué queda pendiente.",
    ]);
    expect(flowBlock("en", "specty").split("\n").slice(-6)).toEqual([
      "## Rules (Specty)",
      "- Before reporting a task as done, run `specty check --changed --spec` and fix every failure. Do not report with failures pending.",
      "- Before creating a module, use case, component or screen, look for an equivalent one in the repo and replicate its structure.",
      "- Find code with targeted searches by symbol or text and read only the fragments you need, not whole files.",
      "- Edit with targeted changes; do not rewrite whole files for small changes.",
      "- Brief final report: what changed, what was verified and what is pending.",
    ]);
  });

  it("asks people not to write in Conventions what specty check verifies (AC5)", () => {
    expect(humanSections("es")).toContain("ni verifica `specty check`");
    expect(humanSections("en")).toContain("`specty check` does not verify");
  });

  it("tells the agent to work in the change's own folder", () => {
    expect(flowBlock("es", "specty")).toContain(
      "- Cada cambio vive en su propia carpeta (una worktree): tras `specty new`, trabaja en la carpeta que indica, no en la principal.",
    );
    expect(flowBlock("en", "specty")).toContain("after `specty new`, work in the folder it names");
  });
});

describe("templates", () => {
  it("produce specs that only lack their content", () => {
    for (const kind of ["quick", "standard", "spike", "retro", "epic"] as const) {
      const { diagnostics, spec } = parseSpec(specTemplate({ kind, lang: "en", title: "X" }));
      expect(spec.frontmatter.kind).toBe(kind);
      expect(diagnostics, kind).toEqual([]);
    }
  });

  it("pre-fill the files of a retro", () => {
    const spec = parseSpec(
      specTemplate({
        kind: "retro",
        lang: "es",
        title: "X",
        files: [{ action: "modify", path: "src/a.ts" }],
      }),
    ).spec;
    expect(spec.sections.files?.items).toEqual([{ action: "modify", path: "src/a.ts" }]);
  });
});

describe("agent detection", () => {
  it("reads the environment, with an explicit override", () => {
    expect(detectAgentTool({ CLAUDECODE: "1" })).toBe("claude-code");
    expect(detectAgentTool({ OPENCODE: "1" })).toBe("opencode");
    expect(detectAgentTool({ SPECTY_AGENT: "cursor", CLAUDECODE: "1" })).toBe("cursor");
    expect(detectAgentTool({ SPECTY_AGENT: "constructor" })).toBeUndefined();
    expect(detectAgentTool({})).toBeUndefined();
  });

  it("recognizes Codex outside its sandbox", () => {
    expect(detectAgentTool({ CODEX_SANDBOX: "seatbelt" })).toBe("codex");
    expect(detectAgentTool({ CODEX_CI: "1" })).toBe("codex");
    expect(detectAgentTool({ CODEX_THREAD_ID: "019a" })).toBe("codex");
  });

  it("recognizes Antigravity CLI by the editors it turns off in its commands (AC6)", () => {
    const antigravity = { GIT_EDITOR: "false", HGEDITOR: "false", JJ_EDITOR: "false" };
    expect(detectAgentTool(antigravity)).toBe("antigravity");
    expect(personAtTerminal(true, antigravity)).toBe(false);
    // One editor turned off is a person's choice.
    expect(detectAgentTool({ GIT_EDITOR: "false" })).toBeUndefined();
    expect(detectAgentTool({ HGEDITOR: "false" })).toBeUndefined();
  });

  it("counts a terminal as the person only without an agent's environment", () => {
    expect(personAtTerminal(true, {})).toBe(true);
    expect(personAtTerminal(false, {})).toBe(false);
    expect(personAtTerminal(true, { CODEX_THREAD_ID: "019a" })).toBe(false);
    expect(personAtTerminal(true, { CLAUDECODE: "1" })).toBe(false);
    expect(personAtTerminal(true, { SPECTY_AGENT: "cursor" })).toBe(false);
  });
});
