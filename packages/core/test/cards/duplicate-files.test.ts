// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  duplicateApproveNext,
  duplicateFilesBlock,
  renderText,
  type StatusEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const OPEN: StatusEntry = {
  id: "20261103-saludo",
  kind: "standard",
  phase: "implementing",
  title: "Saludo personalizado",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  folder: "../repo.worktrees/20261103-saludo",
  holder: { tool: "codex", ago: 5 },
};

/** The blocks of a card, as the agent reads them. */
const text = (blocks: ReturnType<typeof duplicateFilesBlock>, ctx: CardContext = ES) =>
  renderText({ status: "ok", header: "SPECTY", blocks, next: "x" }, ctx.lang);

describe("the possible duplicate of a proposed spec", () => {
  it("AC1: names how many governed files it shares, with which change and where", () => {
    const blocks = duplicateFilesBlock([{ change: OPEN, shared: 2, total: 3 }], ES);
    expect(text(blocks)).toContain(
      "POSIBLE DUPLICADO:\n  Comparte 2 de 3 archivos gobernados con 20261103-saludo (implementing, en ../repo.worktrees/20261103-saludo, lo lleva codex, hace 5 min) — «Saludo personalizado».",
    );
    expect(text(duplicateFilesBlock([{ change: OPEN, shared: 2, total: 3 }], EN), EN)).toContain(
      "POSSIBLE DUPLICATE:\n  Shares 2 of 3 governed files with 20261103-saludo (implementing, in ../repo.worktrees/20261103-saludo, held by codex, 5 min ago) — “Saludo personalizado”.",
    );
  });

  it("AC3: says nothing without a possible duplicate", () => {
    expect(duplicateFilesBlock([], ES)).toEqual([]);
  });

  it("AC2: in delegated mode, asks the user before approving", () => {
    expect(duplicateApproveNext(["20261103-saludo"], ES)).toBe(
      "modo delegado: antes de aprobar, pregúntale al usuario si este cambio duplica 20261103-saludo; si es otro trabajo, aprueba con `specty approve`, y si no, cancélalo con `specty cancel`.",
    );
    expect(duplicateApproveNext(["20261103-saludo", "20261103-otro"], EN)).toBe(
      "delegated mode: before approving, ask the user whether this change duplicates 20261103-saludo, 20261103-otro; if it is other work, approve with `specty approve`, and if not, cancel it with `specty cancel`.",
    );
  });
});
