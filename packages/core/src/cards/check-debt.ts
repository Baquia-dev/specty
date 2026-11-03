// SPDX-License-Identifier: Apache-2.0
import { type CheckReport, statusOf } from "../checks/report";
import type { Lang } from "../i18n";
import type { MemoryEntry } from "../memory/entries";
import { translator } from "./text";

// The debt `specty check --all` leaves in the memory (ADR 0016): one improvement for each check
// with findings, done on its own once a later run passes that check.

/** What a run of `check --all` changes in the memory. */
export interface CheckDebt {
  /** The text of each debt to add, in the report's order. */
  readonly add: readonly string[];
  /** The open entries whose check passed. */
  readonly done: readonly MemoryEntry[];
}

/**
 * What `report` changes in the memory of `entries`: the debt of each check that fails or warns,
 * unless an entry not done has its text, and the open improvements of the debt of each check
 * that passes. The text only names the check, so the next run finds it, in either language; a
 * check that did not run changes nothing.
 */
export function checkDebt(
  report: CheckReport,
  entries: readonly MemoryEntry[],
  lang: Lang,
): CheckDebt {
  const owed = (status: string) => status === "failed" || status === "warned";
  const ids = (keep: (status: string) => boolean) =>
    report.results.filter((result) => keep(statusOf(result))).map((result) => result.id);
  const kept = new Set(entries.filter((entry) => entry.status !== "done").map(textOf));
  const paid = new Set(ids((status) => status === "passed").flatMap(bothTexts));
  return {
    add: ids(owed)
      .filter((id) => !bothTexts(id).some((text) => kept.has(text)))
      .map((id) => debtText(id, lang)),
    done: entries.filter(
      (entry) => entry.kind === "improvement" && entry.status === "open" && paid.has(textOf(entry)),
    ),
  };
}

/** The lines of `check --all` with the entries it added and those it marked done. */
export function checkDebtLines(
  added: readonly string[],
  done: readonly string[],
  lang: Lang,
): readonly string[] {
  const t = translator(lang);
  return [
    ...(added.length === 0
      ? []
      : [
          t(
            `Deuda anotada en la memoria como mejoras: ${added.join(", ")}.`,
            `Debt added to the memory as improvements: ${added.join(", ")}.`,
          ),
        ]),
    ...(done.length === 0
      ? []
      : [
          t(
            `Deuda saldada, marcada hecha en la memoria: ${done.join(", ")}.`,
            `Debt paid, marked done in the memory: ${done.join(", ")}.`,
          ),
        ]),
  ];
}

/** The memory's text for the debt of check `id`: fixed, without counts or paths. */
function debtText(id: string, lang: Lang): string {
  return translator(lang)(
    `Deuda de \`specty check --all\`: la verificación \`${id}\` tiene hallazgos en el repositorio. Para verlos, \`specty check --all --verbose\`; Specty marca esta entrada hecha cuando la verificación pasa.`,
    `\`specty check --all\` debt: the \`${id}\` check has findings in the repository. To see them, \`specty check --all --verbose\`; Specty marks this entry done when the check passes.`,
  );
}

function bothTexts(id: string): readonly string[] {
  return [debtText(id, "es"), debtText(id, "en")];
}

function textOf(entry: MemoryEntry): string {
  return entry.text.trim();
}
