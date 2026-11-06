// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  absorbedLine,
  backOnTargetLine,
  type CardContext,
  commandFailsLine,
  commitOrDiscardNext,
  folderRemovedLine,
  folderStaysLine,
  holderDirtyLine,
  holderDirtyNext,
  incorporationTitle,
  integrateRetry,
  integrationResolvedLine,
  landedLine,
  leaveFolderNext,
  markersLeftLine,
  mergeAbortedLine,
  mergeByHandNext,
  mergedVerifyFailsLine,
  mergeFailedLine,
  mergingLabel,
  noIncorporationCard,
  notLandedLine,
  notYetLine,
  outsideIncorporationLine,
  personOnlyLine,
  renderText,
  resolveIncorporationNext,
  retryLandingNext,
  runAgainNext,
  stillResolvingLine,
  targetAheadLine,
  targetConflictsLine,
  uncommittedOverlapLine,
  undoOutsideNext,
  verifyingNote,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const DELEGATED: CardContext = { ...ES, delegated: true };

describe("bringing the main branch into a change", () => {
  it("refuses when it could overwrite work, or does not merge, and says how to do it by hand", () => {
    expect(holderDirtyLine("main", "/repo", "es")).toBe(
      "main está en /repo, que tiene cambios sin commit: avanzarla podría pisarlos.",
    );
    expect(holderDirtyNext("/repo", "close", EN)).toBe(
      "commit or discard those changes in /repo and run `specty close` again.",
    );
    expect(mergeByHandNext("main", "accept", ES)).toBe(
      "incorpora main a mano en esta carpeta (`git merge main`, resuelve y haz el commit) y vuelve a ejecutar `specty accept`.",
    );
    expect(targetConflictsLine("main", "en")).toBe("main conflicts with this change.");
    expect(mergeFailedLine("main", "fatal: x", "es")).toBe(
      "No se pudo incorporar main a este cambio: fatal: x",
    );
    expect(mergedVerifyFailsLine("main", "pnpm check", "en")).toBe(
      "With main merged in, `pnpm check` fails.",
    );
  });

  it("names the details of what went wrong", () => {
    expect(incorporationTitle("conflicts", "es")).toBe("CONFLICTOS");
    expect(incorporationTitle("markers", "en")).toBe("WITH MARKERS");
    expect(incorporationTitle("outside", "es")).toBe("FUERA");
    expect(incorporationTitle("uncommitted", "en")).toBe("UNCOMMITTED");
    expect(incorporationTitle("verification", "es")).toBe("SALIDA DE LA VERIFICACIÓN");
  });

  it("says that nothing moved, or that the merge waits for the agent", () => {
    expect(notYetLine("closing", "unchanged", "es")).toBe("No se cerró y nada cambió.");
    expect(notYetLine("acceptance", "unchanged", "en")).toBe("Not accepted, and nothing changed.");
    expect(notYetLine("done", "waiting", "es")).toBe(
      "No se incorporó: el merge queda en esta carpeta para que lo resuelva el agente.",
    );
    expect(resolveIncorporationNext("close", ES)).toBe(
      "dile a tu agente «continúa» (ejecutará `specty next`); cuando termine, vuelve a ejecutar `specty close`.",
    );
    expect(resolveIncorporationNext("accept", DELEGATED)).toBe(
      "modo delegado: resuélvela tú (`specty next` te dice qué falta), termínala con `specty integrate` y vuelve a ejecutar `specty accept`.",
    );
  });

  it("says how it came in, verified or not", () => {
    expect(absorbedLine("main", "a1b2c3d", { kind: "passed", command: "pnpm check" }, "es")).toBe(
      "Antes, main se incorporó a la rama del cambio (merge a1b2c3d) y `pnpm check` pasó.",
    );
    expect(absorbedLine("main", "a1b2c3d", { kind: "epic" }, "en")).toBe(
      "First, main was merged into the change's branch (merge a1b2c3d) without a verification: an epic has no code of its own.",
    );
    expect(absorbedLine("main", "a1b2c3d", { kind: "none" }, "es")).toBe(
      "Antes, main se incorporó a la rama del cambio (merge a1b2c3d) sin verificar: .specty/config.yaml no tiene `verify.full` ni `verify.default`.",
    );
    // AC5
    expect(absorbedLine("main", "a1b2c3d", { kind: "no-code" }, "es")).toBe(
      "Antes, main se incorporó a la rama del cambio (merge a1b2c3d) sin verificar: el cambio no toca código, así que el código es el de main.",
    );
    expect(absorbedLine("main", "a1b2c3d", { kind: "no-code" }, "en")).toBe(
      "First, main was merged into the change's branch (merge a1b2c3d) without a verification: the change touches no code, so the code is main's.",
    );
    expect(verifyingNote("pnpm check", "es")).toBe("specty: verificando `pnpm check`…");
    expect(verifyingNote("pnpm check", "en")).toBe("specty: verifying `pnpm check`…");
  });

  it("AC6: says when the units of its full verification passed, in Spanish and in English", () => {
    const units = { reused: ["core"], passed: [{ name: "cli", ms: 2000 }], skipped: [] };
    const passed = { kind: "passed", command: "pnpm lint && pnpm test", units } as const;
    expect(absorbedLine("main", "a1b2c3d", passed, "es")).toBe(
      "Antes, main se incorporó a la rama del cambio (merge a1b2c3d) y pasaron las unidades de su verificación completa.",
    );
    expect(absorbedLine("main", "a1b2c3d", passed, "en")).toBe(
      "First, main was merged into the change's branch (merge a1b2c3d) and the units of its full verification passed.",
    );
  });
});

describe("`specty integrate`", () => {
  it("has nothing to finish without a pending incorporation", () => {
    const card = noIncorporationCard("SPECTY · 20261020-saludo · closing", EN);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "en")).toBe(
      [
        "SPECTY · 20261020-saludo · closing",
        "There is no pending incorporation.",
        "NEXT: run `specty next`.",
      ].join("\n"),
    );
  });

  it("refuses what is not ready, and says how to retry", () => {
    expect(mergingLabel("main", "es")).toBe("incorporando main");
    expect(integrateRetry(ES)).toBe("corrígelo y vuelve a ejecutar `specty integrate`.");
    expect(mergeAbortedLine("en")).toBe("The merge is no longer in progress: someone aborted it.");
    expect(markersLeftLine("es")).toBe("Quedan marcadores de conflicto.");
    expect(outsideIncorporationLine("main", "es")).toBe(
      "Hay cambios fuera de la incorporación de main.",
    );
    expect(undoOutsideNext(EN)).toBe("undo those changes and run `specty integrate` again.");
    expect(commandFailsLine("pnpm check", "es")).toBe("`pnpm check` falla.");
    expect(stillResolvingLine("main", "en")).toBe(
      "The agent is still resolving the incorporation of main in this folder.",
    );
  });

  it("AC1, AC4: once resolved, sends the closing again and instructs specty wait", () => {
    expect(integrationResolvedLine("main", "a1b2c3d", "es")).toBe(
      "Incorporación de main resuelta (merge a1b2c3d).",
    );
    expect(runAgainNext("close", ES)).toBe(
      "pide al usuario que vuelva a ejecutar `specty close` y ejecuta `specty wait` para esperar su decisión. Ejecútalo en primer plano y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
    expect(runAgainNext("accept", { ...EN, delegated: true })).toBe(
      "delegated mode: run `specty accept` again yourself and follow its output.",
    );
  });
});

describe("landing a closed change", () => {
  it("says whether the main branch moved", () => {
    expect(landedLine("main", "es")).toBe("Incorporado a main.");
    expect(notLandedLine("main", "fatal: x", "en")).toBe("main did not move: fatal: x");
    expect(targetAheadLine("es")).toBe("ya tiene commits que el cambio no incluye.");
    expect(retryLandingNext(EN)).toBe("when possible, run `specty close` again to merge it.");
  });

  it("says where the change's folder went, and how the session leaves it", () => {
    expect(backOnTargetLine("main", "es")).toBe("Esta carpeta vuelve a main.");
    expect(folderRemovedLine("/w/x", "specty/x", "/repo", "en")).toBe(
      "Folder /w/x was removed and branch specty/x stays; carry on in /repo.",
    );
    expect(folderStaysLine("/w/x", "locked.", "es")).toBe(
      "La carpeta /w/x queda: locked. Bórrala con `git worktree remove` cuando ya no la necesites.",
    );
    expect(leaveFolderNext({ folder: "/w/x", main: "/repo", removed: true }, ES)).toBe(
      '/w/x ya no existe: sal de ella (en Claude Code, `ExitWorktree`) y sigue en /repo; para otro cambio, `specty new "<título>"`.',
    );
    expect(leaveFolderNext({ folder: "/w/x", main: "/repo", removed: false }, EN)).toBe(
      'leave /w/x (in Claude Code, `ExitWorktree`) and carry on in /repo; for another change, `specty new "<title>"`.',
    );
  });
});

describe("leaving a slice's folder for its epic", () => {
  const CLAUDE: CardContext = { ...ES, tool: "claude-code" };
  const epic = { id: "20261105-panel", folder: "/w/panel", inMain: false, byName: true };
  const left = { folder: "/w/c1", main: "/repo", removed: true, epic };

  it("AC1: Claude Code leaves it keeping it and goes back to the epic by name, then runs `next`", () => {
    expect(leaveFolderNext(left, CLAUDE)).toBe(
      '/w/c1 ya no existe: sal de ella (en Claude Code, `ExitWorktree` con `action: "keep"`) y vuelve a la épica 20261105-panel, en /w/panel: en Claude Code, `EnterWorktree` con `name: "20261105-panel"`, y ejecuta `specty next`.',
    );
    expect(leaveFolderNext({ ...left, removed: false }, { ...CLAUDE, lang: "en" })).toBe(
      'leave /w/c1 (in Claude Code, `ExitWorktree` with `action: "keep"`) and go back to epic 20261105-panel, in /w/panel: in Claude Code, `EnterWorktree` with `name: "20261105-panel"`, and run `specty next`.',
    );
  });

  it("AC3: with the epic in the main folder, carries on with it there with `next`", () => {
    const inMain = { ...left, epic: { ...epic, folder: "/repo", inMain: true } };
    expect(leaveFolderNext(inMain, CLAUDE)).toBe(
      '/w/c1 ya no existe: sal de ella (en Claude Code, `ExitWorktree` con `action: "keep"`) y sigue con la épica 20261105-panel en /repo: ejecuta `specty next`.',
    );
    expect(leaveFolderNext(inMain, { ...CLAUDE, lang: "en" })).toBe(
      '/w/c1 no longer exists: leave it (in Claude Code, `ExitWorktree` with `action: "keep"`) and carry on with epic 20261105-panel in /repo: run `specty next`.',
    );
  });

  it("AC4: a tool that enters with `specty enter` goes back with it, and Claude Code without the hooks switches its folder", () => {
    expect(leaveFolderNext(left, { ...ES, tool: "cursor" })).toBe(
      "/w/c1 ya no existe: sal de ella y vuelve a la épica 20261105-panel, en /w/panel: ejecuta `specty enter 20261105-panel` y sigue su salida.",
    );
    expect(leaveFolderNext(left, { ...EN, tool: "cursor" })).toBe(
      "/w/c1 no longer exists: leave it and go back to epic 20261105-panel, in /w/panel: run `specty enter 20261105-panel` and follow its output.",
    );
    const without = { ...left, epic: { ...epic, byName: false } };
    expect(leaveFolderNext(without, CLAUDE)).toBe(
      '/w/c1 ya no existe: sal de ella (en Claude Code, `ExitWorktree` con `action: "keep"`) y vuelve a la épica 20261105-panel, en /w/panel: cambia allí la carpeta de trabajo de tu sesión o abre allí un agente, y ejecuta `specty next`.',
    );
    expect(leaveFolderNext(without, { ...CLAUDE, lang: "en" })).toBe(
      '/w/c1 no longer exists: leave it (in Claude Code, `ExitWorktree` with `action: "keep"`) and go back to epic 20261105-panel, in /w/panel: switch your session\'s working folder there or open an agent there, and run `specty next`.',
    );
  });
});

describe("the uncommitted files the main branch also changed", () => {
  it("AC3: names them, says who commits Specty's own, and what next, in Spanish, in English and delegated", () => {
    expect(uncommittedOverlapLine("main", "es")).toBe(
      "main también cambió archivos que aquí tienen cambios sin commit: el merge los pisaría, así que no empezó.",
    );
    expect(uncommittedOverlapLine("main", "en")).toBe(
      "main also changed files with uncommitted changes here: the merge would overwrite them, so it did not start.",
    );
    expect(personOnlyLine([".specty/config.yaml"], "es")).toBe(
      "Solo la persona puede hacer el commit de los cambios de .specty/config.yaml o descartarlos: el guard no deja que el agente edite lo que gestiona Specty.",
    );
    expect(personOnlyLine([".specty/config.yaml", ".husky/pre-commit"], "en")).toBe(
      "Only the person can commit or discard the changes to .specty/config.yaml, .husky/pre-commit: the guard does not let the agent edit what Specty manages.",
    );
    expect(commitOrDiscardNext("close", ES)).toBe(
      "haz el commit de esos archivos o descarta sus cambios en esta carpeta y vuelve a ejecutar `specty close`.",
    );
    expect(commitOrDiscardNext("accept", EN)).toBe(
      "commit those files or discard their changes in this folder and run `specty accept` again.",
    );
    expect(commitOrDiscardNext("close", DELEGATED)).toBe(
      "modo delegado: pide al usuario que haga el commit de esos archivos o descarte sus cambios en esta carpeta (tú no haces commits) y, cuando lo haga, vuelve a ejecutar tú `specty close`.",
    );
    expect(commitOrDiscardNext("accept", { ...EN, delegated: true })).toBe(
      "delegated mode: ask the user to commit those files or discard their changes in this folder (you do not make commits), and once they do, run `specty accept` again yourself.",
    );
  });
});
