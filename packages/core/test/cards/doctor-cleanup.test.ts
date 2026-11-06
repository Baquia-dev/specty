// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type DoctorLine,
  doctorCard,
  doctorLine,
  renderText,
  statusCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const REF = "refs/specty/rescue/viejo/20261106090000";

/** One line of each new kind, as `doctor` gives them among its warnings. */
const LINES: readonly DoctorLine[] = [
  { code: "stale-records", count: 2 },
  { code: "finished-folders", count: 1 },
  { code: "ghost-folders", count: 3 },
  { code: "empty-change-folders", count: 4 },
  { code: "rescue-refs", count: 5, latest: REF },
];

describe("what `doctor` says of the orphans and the rescue refs", () => {
  it("AC9: says each kind of orphan with how many there are and what `specty prune` does with them", () => {
    expect(LINES.slice(0, 4).map((line) => doctorLine(line, ES))).toEqual([
      "Registros de git de worktrees cuya carpeta ya no existe: 2; los olvida `specty prune`.",
      "Carpetas de cambios terminados que ya no hacen falta: 1; las quita `specty prune`, tras guardar en una ref de rescate lo que tengan sin commit.",
      "Carpetas fantasma, que no son worktrees de git, en .worktrees/ o en la carpeta hermana: 3; las borra `specty prune`, tras guardar en una ref de rescate lo que git no ignora de ellas.",
      "Carpetas vacías en .specty/changes/: 4; las borra `specty prune`.",
    ]);
  });

  it("AC10: says how many rescue refs there are, with how to see the latest and get it back", () => {
    expect(doctorLine({ code: "rescue-refs", count: 5, latest: REF }, ES)).toBe(
      `Refs de rescate, con lo que guardó la limpieza de las carpetas que quitó: 5. La más reciente es ${REF}: mírala con \`git show ${REF}\` y recupérala con \`git worktree add <carpeta> ${REF}\`; lista las demás con \`git for-each-ref refs/specty/rescue/\`. Quedan hasta que las borres con \`git update-ref -d <ref>\`.`,
    );
  });

  it("AC9: they are warnings, which do not turn `doctor` red", () => {
    const card = doctorCard({ ok: [], warnings: LINES, problems: [] }, ES);
    expect(card.status).toBe("ok");
    const text = renderText(card, "es");
    expect(text).toContain(
      "AVISOS:\n  Registros de git de worktrees cuya carpeta ya no existe: 2; los olvida `specty prune`.\n",
    );
    expect(text).not.toContain("PROBLEMAS");
  });

  it("AC11: in English too", () => {
    expect(LINES.map((line) => doctorLine(line, EN))).toEqual([
      "Git records of worktrees whose folder no longer exists: 2; `specty prune` forgets them.",
      "Folders of finished changes no longer needed: 1; `specty prune` removes them, after saving in a rescue ref what they have uncommitted.",
      "Ghost folders, which are not git worktrees, in .worktrees/ or in the sibling folder: 3; `specty prune` removes them, after saving in a rescue ref what git does not ignore in them.",
      "Empty folders in .specty/changes/: 4; `specty prune` removes them.",
      `Rescue refs, with what the clean-up saved of the folders it removed: 5. The latest is ${REF}: see it with \`git show ${REF}\` and get it back with \`git worktree add <folder> ${REF}\`; list the others with \`git for-each-ref refs/specty/rescue/\`. They stay until you delete them with \`git update-ref -d <ref>\`.`,
    ]);
  });
});

describe("what `status` says of the orphans", () => {
  const status = (ctx: CardContext, orphans: number) =>
    statusCard([], ctx, [], { fronts: [], owners: [] }, orphans);

  it("AC9: says in one line how many orphans `specty prune` removes", () => {
    expect(renderText(status(ES, 7), "es")).toContain(
      "LIMPIEZA:\n  Huérfanos que quita `specty prune`: 7 (registros de worktrees sin carpeta y carpetas que sobran); `specty doctor` los cuenta por tipo.",
    );
  });

  it("AC9: says nothing of them when there are none", () => {
    expect(renderText(status(ES, 0), "es")).not.toContain("LIMPIEZA");
    expect(renderText(statusCard([], ES), "es")).not.toContain("LIMPIEZA");
  });

  it("AC11: in English too", () => {
    expect(renderText(status(EN, 7), "en")).toContain(
      "CLEAN-UP:\n  Orphans `specty prune` removes: 7 (records of worktrees with no folder and leftover folders); `specty doctor` counts them by kind.",
    );
    expect(renderText(status(EN, 0), "en")).not.toContain("CLEAN-UP");
  });
});
