// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  changeCreatedLead,
  type NewRefusal,
  newRefusalCard,
  renderText,
  type WorktreeCreated,
  worktreeCreatedCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const refused = (refusal: NewRefusal, ctx = ES) => newRefusalCard(refusal, ctx);

describe("the cards of a refused `new`", () => {
  it("are invalid when the command is wrong, and say how to write it", () => {
    const kind = refused({ reason: "unknown-kind", kind: "big" });
    expect(kind.status).toBe("invalid");
    expect(renderText(kind, "es")).toContain("Tipo de cambio desconocido: big.");
    expect(kind.next).toBe("--kind quick|standard|spike|retro|epic");
    const type = refused({ reason: "unknown-type", type: "bug" });
    expect(type.status).toBe("invalid");
    expect(renderText(type, "es")).toContain("Tipo de commit desconocido: bug.");
    expect(renderText(refused({ reason: "unknown-type", type: "bug" }, EN), "en")).toContain(
      "Unknown commit type: bug.",
    );
    expect(type.next).toBe("--type feat|fix|refactor|perf|test|docs|chore|build|ci|style");
    const bootstrap = refused({ reason: "bootstrap-quick", title: "Esqueleto" });
    expect(bootstrap.status).toBe("invalid");
    expect(bootstrap.next).toBe(
      'ejecuta `specty new "Esqueleto" --request "<petición literal del usuario>"`, sin `--kind quick`.',
    );
    expect(renderText(refused({ reason: "no-title" }), "es")).toContain("Falta el título.");
    const request = refused({ reason: "empty-request" }, EN);
    expect(renderText(request, "en")).toContain("The request (--request) is empty.");
    expect(request.next).toBe(
      'run `specty new "<title>" --request "<the user\'s literal request>"`.',
    );
    const from = refused({ reason: "from-without-worktree", from: "dev" });
    expect(from.status).toBe("invalid");
    expect(from.next).toBe('ejecuta `specty new --worktree --from dev "<título>"`.');
  });

  it("are blocked when the repository's settings or state stop it", () => {
    const branches = refused({ reason: "worktree-without-branches" });
    expect(branches.status).toBe("blocked");
    expect(renderText(branches, "es")).toContain("`git.branchPerChange` está desactivado.");
    const base = refused({ reason: "unknown-base", base: "nada" }, EN);
    expect(renderText(base, "en")).toContain("`nada` is neither a branch nor a commit.");
    const busy = { reason: "in-progress", id: "20261020-saludo", phase: "implementing" } as const;
    const parallel = refused({ ...busy, branchPerChange: true });
    expect(parallel.header).toBe("SPECTY · 20261020-saludo · implementing");
    expect(parallel.next).toContain('`specty new --worktree "<título>"`');
    expect(refused({ ...busy, branchPerChange: false }).next).toBe(
      "termínalo (`specty next`) o cámbiate a otra rama antes de crear otro.",
    );
  });
});

describe("a change created by `new`", () => {
  it("names its branch, if it has one", () => {
    expect(changeCreatedLead("20261020-saludo", "specty/20261020-saludo", ES)).toBe(
      "Cambio creado: 20261020-saludo (rama specty/20261020-saludo).",
    );
    expect(changeCreatedLead("20261020-saludo", undefined, EN)).toBe(
      "Change created: 20261020-saludo.",
    );
  });

  const CREATED: WorktreeCreated = {
    id: "20261020-saludo",
    branch: "specty/20261020-saludo",
    folder: "/repo.worktrees/20261020-saludo",
    from: "main (d64c425)",
    prepared: { command: "pnpm install", ok: true, output: [] },
    copied: [".claude/settings.local.json"],
    removed: [],
    byName: true,
  };

  it("in a worktree says where, how it was prepared and how the session moves there", () => {
    const card = worktreeCreatedCard(CREATED, ES);
    expect(card.header).toBe("SPECTY · 20261020-saludo · draft");
    const text = renderText(card, "es");
    expect(text).toContain(
      "Cambio creado: 20261020-saludo (rama specty/20261020-saludo) en /repo.worktrees/20261020-saludo, desde main (d64c425).",
    );
    expect(text).toContain("Carpeta preparada con `pnpm install`.");
    expect(text).toContain("HOOKS DEL AGENTE COPIADOS:\n  .claude/settings.local.json");
    expect(text).not.toContain("CARPETAS DE CAMBIOS TERMINADOS");
    expect(card.next).toBe(
      'continúa en /repo.worktrees/20261020-saludo: cambia allí la carpeta de trabajo de tu sesión (en Claude Code, `EnterWorktree` con `name: "20261020-saludo"`; o abre allí un agente) y ejecuta `specty next`; esta carpeta sigue con su propio trabajo.',
    );
  });

  it("tells an agent that enters a change's folder to run specty enter, or how the person opens its tool there (C6 AC4)", () => {
    const folder = "/repo.worktrees/20261020-saludo";
    const next = (agent: WorktreeCreated["agent"]) =>
      worktreeCreatedCard({ ...CREATED, byName: false, agent }, ES).next;
    expect(next("codex")).toBe(
      `continúa en ${folder}: Codex entra en ella desde esta misma sesión: ejecuta \`specty enter 20261020-saludo\` y sigue su salida. Si la persona prefiere otra sesión, pídele que abra Codex en esa carpeta (\`codex -C "${folder}"\`) y termina tu turno. Esta carpeta sigue con su propio trabajo.`,
    );
    expect(next("opencode")).toContain(`(\`opencode "${folder}"\`)`);
    expect(next("cursor")).toContain(
      `una ventana de Cursor en esa carpeta (\`cursor "${folder}"\`)`,
    );
    expect(next("gemini-cli")).toContain(`(\`cd "${folder}" && gemini\`)`);
    expect(next("antigravity")).toContain(`(\`cd "${folder}" && agy\`)`);
    // Devin has no way to be opened that Specty knows: it enters, and that is all.
    expect(next("windsurf")).toBe(
      `continúa en ${folder}: Devin (Windsurf) entra en ella desde esta misma sesión: ejecuta \`specty enter 20261020-saludo\` y sigue su salida. Esta carpeta sigue con su propio trabajo.`,
    );
    // Claude Code enters by name, and an agent Specty does not recognize gets the general way on.
    expect(next("claude-code")).toBe(next(undefined));
    expect(next(undefined)).toContain("o abre allí un agente");
    expect(worktreeCreatedCard({ ...CREATED, agent: "codex" }, EN).next).toContain(
      `Codex enters it from this same session: run \`specty enter 20261020-saludo\` and follow its output. If the person would rather have another session, ask them to open Codex in that folder (\`codex -C "${folder}"\`) and end your turn.`,
    );
  });

  it("in a worktree that needs no preparation, goes straight on", () => {
    const { prepared: _, ...unprepared } = CREATED;
    const card = worktreeCreatedCard(unprepared, ES);
    expect(card.blocks[0]?.lines).toEqual([
      "Cambio creado: 20261020-saludo (rama specty/20261020-saludo) en /repo.worktrees/20261020-saludo, desde main (d64c425).",
    ]);
    expect(card.next).toMatch(/^continúa en \/repo\.worktrees\/20261020-saludo: /);
  });

  it("in a worktree that could not be prepared, asks to prepare it first", () => {
    const card = worktreeCreatedCard(
      {
        ...CREATED,
        prepared: { command: "pnpm install", ok: false, output: ["ERR_PNPM_FETCH"] },
        copied: [],
        removed: ["/repo.worktrees/20261001-viejo"],
        byName: false,
      },
      EN,
    );
    const text = renderText(card, "en");
    expect(text).not.toContain("Folder prepared");
    expect(text).toContain("`pnpm install` FAILED:\n  ERR_PNPM_FETCH");
    expect(text).toContain(
      "FOLDERS OF FINISHED CHANGES, REMOVED:\n  /repo.worktrees/20261001-viejo",
    );
    expect(card.next).toBe(
      "in /repo.worktrees/20261020-saludo, run `pnpm install`; then switch your session's working folder there (or open an agent there) and run `specty next`; this folder carries on with its own work.",
    );
  });
});
