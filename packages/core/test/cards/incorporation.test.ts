// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  absorbedLine,
  backOnTargetLine,
  type CardContext,
  commandFailsLine,
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
  renderText,
  resolveIncorporationNext,
  retryLandingNext,
  runAgainNext,
  stillResolvingLine,
  targetAheadLine,
  targetConflictsLine,
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
    expect(verifyingNote("pnpm check", "es")).toBe("specty: verificando `pnpm check`…");
    expect(verifyingNote("pnpm check", "en")).toBe("specty: verifying `pnpm check`…");
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

  it("once resolved, sends the closing again", () => {
    expect(integrationResolvedLine("main", "a1b2c3d", "es")).toBe(
      "Incorporación de main resuelta (merge a1b2c3d).",
    );
    expect(runAgainNext("close", ES)).toBe(
      "pide al usuario que vuelva a ejecutar `specty close` y termina tu turno.",
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
