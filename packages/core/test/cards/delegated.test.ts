// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type AgentTool,
  type CardContext,
  type ChangeView,
  decisionCard,
  delegationCard,
  delegationWarning,
  flowBlock,
  nextCard,
  type ProposedView,
  proposedCard,
  recommendEffort,
  reviewedCard,
  runAgainNext,
  type SizeResult,
  scopeRequestedCard,
  statusCard,
  testsSubmittedCard,
  unlockRefusedCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const delegated = (ctx: CardContext): CardContext => ({ ...ctx, delegated: true });

const size: SizeResult = {
  level: "S",
  baseLevel: "S",
  score: 1,
  adjust: 0,
  reasons: [],
  signals: {
    files: { create: 0, modify: 1, delete: 0, rename: 0 },
    fileCount: 1,
    codeFiles: 1,
    modules: [],
    sensitive: [],
    manifests: [],
    tasks: 1,
    highFanIn: [],
    modulesWithoutTests: [],
  },
};
const proposed = (closing: boolean): ProposedView => ({
  header: "SPECTY · 20261021-x · review",
  specPath: ".specty/changes/20261021-x/spec.md",
  size,
  effort: recommendEffort("S"),
  warnings: [],
  delta: [],
  closing,
});
const view = (phase: ChangeView["phase"], extra: Partial<ChangeView> = {}): ChangeView => ({
  id: "20261021-x",
  kind: "standard",
  phase,
  title: "X",
  specPath: ".specty/changes/20261021-x/spec.md",
  branch: "specty/20261021-x",
  revision: 1,
  tasks: [],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  ...extra,
});
const next = (change: ChangeView, ctx: CardContext) => nextCard({ change, dirty: [] }, ctx).next;

/** Every `SIGUIENTE:` that waits for a decision of the person, with the command it names. */
const decisions = (ctx: CardContext) => [
  { next: proposedCard(proposed(false), ctx).next, command: "`specty approve`" },
  { next: proposedCard(proposed(true), ctx).next, command: "`specty close`" },
  {
    next: scopeRequestedCard("H", "S1", ["src/b.ts"], ctx).next,
    command: "`specty approve --scope S1`",
  },
  { next: next(view("review"), ctx), command: "`specty approve`" },
  { next: next(view("acceptance"), ctx), command: "`specty accept`" },
  { next: next(view("closing", { closingSubmitted: true }), ctx), command: "`specty close`" },
];

describe("agent cards in delegated mode", () => {
  it("tell the agent to run the person's command itself", () => {
    for (const entry of decisions(delegated(ES))) {
      expect(entry.next).toMatch(/^modo delegado: \S+ tú /);
      expect(entry.next).toContain(entry.command);
      expect(entry.next).not.toContain("termina tu turno");
    }
    for (const entry of decisions(delegated(EN))) {
      expect(entry.next).toMatch(/^delegated mode: .* yourself /);
      expect(entry.next).toContain(entry.command);
    }
  });

  it("AC1, AC4: keep asking the user without delegation and instruct specty wait", () => {
    const plain = decisions(ES);
    expect(decisions({ ...ES, delegated: false })).toEqual(plain);
    for (const entry of plain) {
      expect(entry.next).toContain("usuario");
      expect(entry.next).toContain(entry.command);
      expect(entry.next).toContain("specty wait");
      expect(entry.next).not.toContain("termina tu turno");
      expect(entry.next).not.toContain("modo delegado");
    }
    expect(plain[0]?.next).toBe(
      "dile al usuario que la spec está lista en .specty/changes/20261021-x/spec.md, con su tamaño y el esfuerzo recomendado, que la apruebe con `specty approve` en su terminal o en la UI, y ejecuta `specty wait` para esperar su decisión. Ejecútalo en primer plano y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
    expect(plain[3]?.next).toBe(
      "pide al usuario que revise la spec y la apruebe con `specty approve` en su terminal o en la UI, y ejecuta `specty wait` para esperar su decisión. Ejecútalo en primer plano y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
  });

  it("say who reviews and who confirms the closing", () => {
    const review = nextCard({ change: view("review"), dirty: [] }, delegated(ES));
    expect(review.blocks.flatMap((block) => block.lines)).toEqual([
      "Modo delegado: la revisión te toca a ti. No modifiques código.",
    ]);
    const closing = nextCard(
      { change: view("closing", { closingSubmitted: true }), dirty: [] },
      delegated(EN),
    );
    expect(closing.blocks.flatMap((block) => block.lines)).toEqual([
      "Closing submitted; in delegated mode you confirm it.",
    ]);
  });

  it("AC3: sends rejected assumptions back to the agent's spec only with the review sent back", () => {
    const assumptions = [{ id: "A1", text: "Supuesto", comment: "No" }];
    const sentBack = view("review", { rejected: assumptions, requested: [] });
    expect(next(sentBack, delegated(ES))).toBe(next(sentBack, ES));
    const loose = nextCard(
      { change: view("review", { rejected: assumptions }), dirty: [] },
      delegated(ES),
    );
    expect(loose.blocks.flatMap((block) => block.lines)).toEqual([
      "Modo delegado: la revisión te toca a ti. No modifiques código.",
    ]);
  });
});

/** How each tool's agent runs `specty wait`, as every output that waits for the person says it. */
const HOW: Readonly<Record<AgentTool | "none", { readonly es: string; readonly en: string }>> = {
  "claude-code": {
    es: "Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar,",
    en: "Run it in the background (`run_in_background: true`), which tells you when it ends,",
  },
  cursor: {
    es: "Ejecútalo en segundo plano (`block_until_ms: 0`), que te avisa al terminar,",
    en: "Run it in the background (`block_until_ms: 0`), which tells you when it ends,",
  },
  opencode: {
    es: "Ejecútalo en segundo plano (`background: true`) o, en OpenCode 1, con `timeout: 3660000`,",
    en: "Run it in the background (`background: true`) or, in OpenCode 1, with `timeout: 3660000`,",
  },
  antigravity: {
    es: "Ejecútalo y deja que pase a segundo plano, que te avisa al terminar,",
    en: "Run it and let it go to the background, which tells you when it ends,",
  },
  codex: {
    es: "Si sigue en marcha, consulta su salida hasta que termine,",
    en: "If it is still running, poll its output until it ends,",
  },
  windsurf: {
    es: "Si pasa a segundo plano, consulta su salida con `get_output` hasta que termine,",
    en: "If it goes to the background, poll its output with `get_output` until it ends,",
  },
  "gemini-cli": { es: "Ejecútalo en primer plano", en: "Run it in the foreground" },
  copilot: { es: "Ejecútalo en primer plano", en: "Run it in the foreground" },
  none: { es: "Ejecútalo en primer plano", en: "Run it in the foreground" },
};

/** Every tool, and none at all. */
const TOOLS = [
  "claude-code",
  "cursor",
  "opencode",
  "antigravity",
  "codex",
  "windsurf",
  "gemini-cli",
  "copilot",
  "none",
] as const satisfies readonly (AgentTool | "none")[];

/** The sentence that asks for `specty wait`, the same in every output that waits for the person. */
const waitSentence = (tool: AgentTool | "none", lang: "es" | "en"): string =>
  lang === "es"
    ? `ejecuta \`specty wait\` para esperar su decisión. ${HOW[tool].es} y vuelve a ejecutarlo cada vez que se agote o se corte.`
    : `run \`specty wait\` to wait for their decision. ${HOW[tool].en} and run it again each time it times out or is cut off.`;

/** Every `SIGUIENTE:` that leaves the change waiting for the person, beyond `decisions`. */
const waiting = (ctx: CardContext): readonly string[] => [
  ...decisions(ctx).map((entry) => entry.next),
  scopeRequestedCard("H", "S1", ["src/a.test.ts"], ctx, true).next,
  testsSubmittedCard("20261021-x", { commit: "abc1234", files: ["src/a.test.ts"] }, ctx).next,
  unlockRefusedCard("H", "S1", ctx).next,
  runAgainNext("close", ctx),
  runAgainNext("accept", ctx),
  reviewedCard(
    { header: "H", target: "spec", command: "claude -p", path: "spec-r1.md", text: "- Nada." },
    ctx,
  ).next,
  reviewedCard(
    { header: "H", target: "diff", command: "claude -p", path: "diff-1.md", text: "- Nada." },
    ctx,
  ).next,
];

describe("the outputs that wait for the person", () => {
  it("AC1, AC4: ask for `specty wait` with the same sentence, in each tool's way", () => {
    for (const tool of TOOLS) {
      for (const base of [ES, EN]) {
        const ctx: CardContext = tool === "none" ? base : { ...base, tool };
        const sentence = waitSentence(tool, base.lang);
        for (const next of waiting(ctx)) expect(next).toContain(sentence);
      }
    }
  });

  it("AC1: say how in Claude Code and, with no known tool, in the foreground", () => {
    expect(runAgainNext("close", { ...ES, tool: "claude-code" })).toBe(
      "pide al usuario que vuelva a ejecutar `specty close` y ejecuta `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
    expect(runAgainNext("accept", EN)).toBe(
      "ask the user to run `specty accept` again and run `specty wait` to wait for their decision. Run it in the foreground and run it again each time it times out or is cut off.",
    );
  });

  it("AC1: keep it out of delegated mode, where the agent decides", () => {
    for (const entry of decisions(delegated({ ...ES, tool: "claude-code" }))) {
      expect(entry.next).not.toContain("specty wait");
    }
  });
});

describe("person cards in delegated mode", () => {
  it("continue with `next` after a decision", () => {
    expect(decisionCard("H", ["Hecho."], delegated(ES)).next).toBe("sigue con `specty next`.");
    expect(decisionCard("H", ["Done."], delegated(EN)).next).toBe("continue with `specty next`.");
    expect(decisionCard("H", ["Hecho."], ES).next).toBe(
      "dile a tu agente «continúa»; ejecutará `specty next`.",
    );
  });

  it("remind the person in the status that the mode is on", () => {
    const block = (ctx: CardContext) =>
      statusCard([], ctx).blocks.find((entry) => entry.title === "MODO DELEGADO");
    expect(block(delegated(ES))?.lines[0]).toContain("`specty delegate off`");
    expect(block(ES)).toBeUndefined();
    const english = statusCard([], delegated(EN)).blocks.find(
      (entry) => entry.title === "DELEGATED MODE",
    );
    expect(english?.lines[0]).toContain("To turn it off: `specty delegate off`.");
  });

  it("warn about everything the agent will decide, in both languages", () => {
    const es = delegationWarning(ES).join("\n");
    for (const fragment of [
      "aprueba specs y confirma sus supuestos de impacto alto",
      "también en rutas sensibles",
      "pasan la verificación completa",
      "los incorpora a la rama principal, y cancela cambios",
      "deja de garantizar que una persona revise cada spec y cada resultado",
      "como del agente, por delegación",
      "este clon y todas sus worktrees hasta que ejecutes `specty delegate off`",
    ])
      expect(es).toContain(fragment);
    const en = delegationWarning(EN).join("\n");
    for (const fragment of [
      "high-impact assumptions",
      "sensitive paths included",
      "full verification",
      "cancels changes",
      "no longer guarantees",
      "by delegation",
      "all its worktrees until you run `specty delegate off`",
    ])
      expect(en).toContain(fragment);
    expect(delegationWarning(EN)).toHaveLength(delegationWarning(ES).length);
  });

  it("confirm the position of the switch", () => {
    const on = delegationCard(true, ES);
    expect(on.header).toBe("SPECTY · modo delegado");
    expect(on.blocks[0]?.lines[0]).toMatch(/^Modo delegado activado/);
    expect(on.next).toBe("dile a tu agente «continúa»; ejecutará `specty next`.");
    const off = delegationCard(false, EN);
    expect(off.blocks[0]?.lines[0]).toMatch(/^Delegated mode off/);
    expect(off.next).toBe("check `specty status` when you want to decide.");
  });
});

describe("flow block", () => {
  it("lets the agent run the person's commands only when `NEXT:` says so", () => {
    for (const lang of ["es", "en"] as const) {
      // The flow itself, before the rules that follow it.
      const [flow = ""] = flowBlock(lang, "specty").split("\n\n");
      expect(flow.split("\n").length).toBeLessThanOrEqual(8);
    }
    expect(flowBlock("es", "specty")).toContain(
      "Solo si `SIGUIENTE:` te lo pide (modo delegado), los ejecutas tú.",
    );
    expect(flowBlock("en", "specty")).toContain(
      "Only when `NEXT:` tells you to (delegated mode) do you run them yourself.",
    );
  });
});
