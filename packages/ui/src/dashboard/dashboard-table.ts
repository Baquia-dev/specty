// SPDX-License-Identifier: Apache-2.0
// The table of the «Cambios» section of the «Panel» (docs/ui.md): its columns, and each change
// of a page as its row writes it. Pure: the section (`dashboard-changes.ts`) shows them.
import type {
  ChangeKind,
  StatsChange,
  StatsChangeSort,
  StatsChangesPage,
} from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { agentName } from "../data/agent-name";
import { formatDuration } from "../data/progress";
import type { StatsChangesParams } from "../data/source";

export type Direction = StatsChangesParams["dir"];

/** What a cell shows when the change lacks its value. */
const NONE = "—";

/** A column: what it sorts by, its header, whether it holds figures, and where it starts. */
export interface Column {
  readonly key: StatsChangeSort;
  readonly es: string;
  readonly en: string;
  readonly figure: boolean;
  /** Texts from A to Z, dates and figures from the most. */
  readonly natural: Direction;
}

export const COLUMNS: readonly Column[] = [
  { key: "closed", es: "Cerrado", en: "Closed", figure: false, natural: "desc" },
  { key: "title", es: "Cambio", en: "Change", figure: false, natural: "asc" },
  { key: "kind", es: "Carril", en: "Lane", figure: false, natural: "asc" },
  { key: "size", es: "Tamaño", en: "Size", figure: false, natural: "desc" },
  { key: "agent", es: "Agente", en: "Agent", figure: false, natural: "asc" },
  { key: "tasks", es: "Tareas", en: "Tasks", figure: true, natural: "desc" },
  { key: "cycle", es: "Ciclo", en: "Cycle", figure: true, natural: "desc" },
  { key: "failed", es: "Fallidas", en: "Failed", figure: true, natural: "desc" },
  { key: "cost", es: "Coste", en: "Cost", figure: true, natural: "desc" },
];

/** A change as its row shows it, each value written in the page's language. */
interface Row {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  readonly closed: string;
  readonly size: string;
  readonly agent: string;
  readonly tasks: string;
  readonly cycle: string;
  readonly failed: number;
  readonly failedText: string;
  readonly cost: string;
}

/** The rows of a page, each value written in `lang`; a date of another year says its year. */
export function rowsOf(page: StatsChangesPage, lang: Lang): readonly Row[] {
  const year = Number(page.range.to.slice(0, 4));
  const count = new Intl.NumberFormat(lang);
  const usd = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
  const day = (iso: string) => {
    const date = new Date(iso);
    const options: Intl.DateTimeFormatOptions =
      date.getFullYear() === year
        ? { day: "numeric", month: "short" }
        : { day: "numeric", month: "short", year: "numeric" };
    return new Intl.DateTimeFormat(lang, options).format(date);
  };
  return page.changes.map(
    (change: StatsChange): Row => ({
      id: change.id,
      title: change.title,
      kind: change.kind,
      closed: change.closed === undefined ? NONE : day(change.closed),
      size: change.size ?? NONE,
      agent: change.agent === undefined ? NONE : agentName(change.agent),
      tasks: count.format(change.tasks),
      cycle: change.cycle === undefined ? NONE : formatDuration(change.cycle, lang),
      failed: change.failed,
      failedText: count.format(change.failed),
      cost: change.cost === undefined ? NONE : usd.format(change.cost),
    }),
  );
}
