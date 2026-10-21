// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  detectAgentTool,
  flowBlock,
  hasBlock,
  nextCard,
  parseSpec,
  renderText,
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
    expect(text().split("\n").at(-1)).toContain('specty new "<título>"');
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

  it("blocks when the approved spec was edited", () => {
    const card = nextCard(
      { change: { ...view("implementing", [task("T1", "active")]), specChanged: true }, dirty: [] },
      ES,
    );
    expect(card.status).toBe("blocked");
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

  it("keeps the flow block to a few lines", () => {
    expect(flowBlock("es", "specty").split("\n").length).toBeLessThanOrEqual(8);
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
    expect(detectAgentTool({ SPECTY_AGENT: "cursor", CLAUDECODE: "1" })).toBe("cursor");
    expect(detectAgentTool({ SPECTY_AGENT: "constructor" })).toBeUndefined();
    expect(detectAgentTool({})).toBeUndefined();
  });
});
