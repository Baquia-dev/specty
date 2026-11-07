// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { StatsView } from "@baquia-dev/specty-core";
import { BarList, type BarRow } from "../components/charts/bar-list";
import { SectionDivider } from "../components/document";
import { Preferences } from "../theme/preferences";

type Memory = NonNullable<StatsView["memory"]>;

/** A status or a kind, and its name. */
interface Named<Key extends string> {
  readonly key: Key;
  readonly es: string;
  readonly en: string;
}

/** The statuses, in the order an entry goes through them, which breaks a tie. */
const STATUSES: readonly Named<keyof Memory["statuses"]>[] = [
  { key: "open", es: "Abiertas", en: "Open" },
  { key: "taken", es: "Tomadas por un cambio", en: "Taken by a change" },
  { key: "drop-proposed", es: "Propuestas para descartar", en: "Proposed to drop" },
  { key: "done", es: "Hechas", en: "Done" },
  { key: "dropped", es: "Descartadas", en: "Dropped" },
];

/** The kinds, in the memory's own order, which breaks a tie. */
const KINDS: readonly Named<keyof Memory["kinds"]>[] = [
  { key: "pending", es: "Pendientes", en: "Pending items" },
  { key: "improvement", es: "Mejoras", en: "Improvements" },
  { key: "reminder", es: "Recordatorios", en: "Reminders" },
  { key: "decision", es: "Decisiones", en: "Decisions" },
  { key: "lesson", es: "Lecciones", en: "Lessons" },
];

/**
 * «Memoria», in the «Panel» (docs/ui.md): how many entries were noted in the period and how many
 * of them are of each status today and of each kind, in bars, the most first.
 */
@Component({
  selector: "sp-dashboard-memory",
  imports: [BarList, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-memory",
    "data-section": "memory",
  },
  template: `
    <sp-section-divider [heading]="t()('Memoria', 'Memory')" headingId="dashboard-memory" [level]="2" />
    <p class="m-0 pl-6 text-sm text-text-muted" data-noted>{{ noted() }}</p>
    @if (memory().entries > 0) {
      <div class="grid gap-x-10 gap-y-8 pl-6 lg:grid-cols-2">
        <sp-bar-list data-chart="statuses" [heading]="t()('Por estado', 'By status')" [category]="t()('Estado', 'Status')" [label]="t()('Entradas', 'Entries')" [rows]="statuses()" />
        <sp-bar-list data-chart="kinds" [heading]="t()('Por tipo', 'By kind')" [category]="t()('Tipo', 'Kind')" [label]="t()('Entradas', 'Entries')" [rows]="kinds()" />
      </div>
    }
  `,
})
export class DashboardMemory {
  private readonly preferences = inject(Preferences);

  readonly memory = input.required<Memory>();

  protected readonly t = this.preferences.t;

  /** «25 entradas anotadas en el periodo.», one in the singular, and none. */
  protected readonly noted = computed(() => {
    const t = this.t();
    const { entries } = this.memory();
    if (entries === 0)
      return t("Ninguna entrada anotada en el periodo.", "No entry noted in the period.");
    if (entries === 1) return t("1 entrada anotada en el periodo.", "1 entry noted in the period.");
    const count = new Intl.NumberFormat(this.preferences.lang()).format(entries);
    return t(`${count} entradas anotadas en el periodo.`, `${count} entries noted in the period.`);
  });

  protected readonly statuses = computed(() => this.rows(STATUSES, this.memory().statuses));

  protected readonly kinds = computed(() => this.rows(KINDS, this.memory().kinds));

  /** A bar per name, the most first; a tie keeps the order of `names`. */
  private rows<Key extends string>(
    names: readonly Named<Key>[],
    counts: Readonly<Record<Key, number>>,
  ): readonly BarRow[] {
    const t = this.t();
    const numbers = new Intl.NumberFormat(this.preferences.lang());
    return names
      .map(({ key, es, en }) => ({
        label: t(es, en),
        value: counts[key],
        text: numbers.format(counts[key]),
      }))
      .toSorted((one, other) => other.value - one.value);
  }
}
