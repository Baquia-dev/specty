// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import type { StatsView, StatsWho } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { SectionDivider } from "../components/document";
import { formatDuration } from "../data/progress";
import { Preferences } from "../theme/preferences";
import { percent, usd } from "./dashboard-format";

type Row = NonNullable<StatsView["people"]>[number];

/** The columns after «Quién», in the order of the maqueta, and how each value reads. */
const COLUMNS = [
  { id: "changes", es: "Cambios", en: "Changes" },
  { id: "tasks", es: "Tareas", en: "Tasks" },
  { id: "cycle", es: "Ciclo (mediana)", en: "Cycle (median)" },
  { id: "verifications", es: "Verificaciones que pasan", en: "Verifications passing" },
  { id: "sessions", es: "Sesiones", en: "Sessions" },
  { id: "cost", es: "Coste medido", en: "Measured cost" },
] as const satisfies readonly {
  readonly id: keyof Row;
  readonly es: string;
  readonly en: string;
}[];

const HEAD =
  "border-b border-border px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-text-muted";

/**
 * «Personas y agentes», in the «Panel» (docs/ui.md): a row per person, agent and model with a
 * change in the period, and what their changes did in it. Choosing a row filters the panel by
 * it, as «Ver por» does; choosing the one that filters it goes back to everyone.
 */
@Component({
  selector: "sp-dashboard-people",
  imports: [SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-col gap-4",
    role: "region",
    "aria-labelledby": "dashboard-people",
    "data-section": "people",
  },
  template: `
    <sp-section-divider [heading]="t()('Personas y agentes', 'People and agents')" headingId="dashboard-people" [level]="2" [meta]="rows().length" />
    <div class="overflow-x-auto pl-6">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" [class]="head + ' text-left'">{{ t()('Quién', 'Who') }}</th>
            @for (column of columns(); track column.id) {
              <th scope="col" [class]="head + ' text-right'">{{ column.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.key) {
            <tr [attr.data-row]="row.key">
              <td class="py-0.5 pr-2" data-cell="who">
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left font-sans text-sm text-text hover:bg-text/4 focus-visible:outline-2 focus-visible:outline-focus aria-pressed:bg-text/6 aria-pressed:font-medium aria-pressed:shadow-[inset_2px_0_0_var(--color-accent)]"
                  [attr.aria-pressed]="row.current"
                  (click)="pick.emit(row.current ? '' : row.key)"
                >
                  <span class="rounded-full border border-border px-1.5 text-[11px] leading-4 font-normal text-text-muted">{{ row.kind }}</span>
                  {{ row.name }}
                </button>
              </td>
              @for (cell of row.cells; track cell.id) {
                <td class="px-2 py-1 text-right whitespace-nowrap tabular-nums" [attr.data-cell]="cell.id">{{ cell.value }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DashboardPeople {
  private readonly preferences = inject(Preferences);

  readonly people = input.required<NonNullable<StatsView["people"]>>();
  /** Who the panel is cut by, if anyone: their row shows pressed. */
  readonly who = input<StatsWho>();
  /** The `who` of the URL for the row chosen, as `person:Ana`; empty to go back to everyone. */
  readonly pick = output<string>();

  protected readonly t = this.preferences.t;
  protected readonly head = HEAD;

  protected readonly columns = computed(() => {
    const t = this.t();
    return COLUMNS.map(({ id, es, en }) => ({ id, label: t(es, en) }));
  });

  protected readonly rows = computed(() => {
    const t = this.t();
    const lang = this.preferences.lang();
    const chosen = this.who();
    const kinds = {
      person: t("Persona", "Person"),
      agent: t("Agente", "Agent"),
      model: t("Modelo", "Model"),
    };
    return this.people().map((row) => ({
      key: `${row.who.kind}:${row.who.name}`,
      kind: kinds[row.who.kind],
      name: row.who.name === "" ? t("(sin dato)", "(no data)") : row.who.name,
      current: chosen?.kind === row.who.kind && chosen.name === row.who.name,
      cells: COLUMNS.map(({ id }) => ({ id, value: shown(row, id, lang) })),
    }));
  });
}

/** A value of `row` in the page's language, or «—» when nothing measures it. */
function shown(row: Row, id: (typeof COLUMNS)[number]["id"], lang: Lang): string {
  const value = row[id];
  if (value === null) return "—";
  switch (id) {
    case "cycle":
      return formatDuration(value, lang);
    case "verifications":
      return percent(value, lang, 1);
    case "cost":
      return usd(value, lang);
    default:
      return new Intl.NumberFormat(lang).format(value);
  }
}
