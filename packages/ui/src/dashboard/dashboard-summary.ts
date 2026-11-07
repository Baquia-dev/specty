// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import type { StatsFigure, StatsPeriod, StatsView } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import { formatDuration } from "../data/progress";
import { Preferences } from "../theme/preferences";

type Translate = (es: string, en: string) => string;

/** How many days each period compares with: «all» compares with nothing. */
const DAYS: Readonly<Record<StatsPeriod, number | undefined>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: undefined,
};

/** A figure of the first row, as the page shows it. */
interface Tile {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly delta?: Delta;
  readonly note?: string;
}

/** How a figure changed against the period before: better (good), worse (bad) or neither. */
interface Delta {
  readonly tone: "good" | "bad" | "none";
  /** «▲ 12 %», in the tone's color; none when there is no change to show. */
  readonly mark?: string;
  readonly text: string;
}

const TONES = { good: "var(--color-phase-done)", bad: "var(--color-phase-cancelled)" } as const;

/**
 * The first row of the «Panel» (docs/ui.md): its six figures, each with its value in the page's
 * language, its change against the period before, in the tone of a phase when it is better or
 * worse, and what it is counted on.
 */
@Component({
  selector: "sp-dashboard-summary",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-6 border-b border-border pb-6" data-kpis>
      @for (tile of tiles(); track tile.id) {
        <div class="flex min-w-0 flex-col gap-0.5" [attr.data-kpi]="tile.id">
          <span class="text-xs text-text-muted" data-label>{{ tile.label }}</span>
          <span class="text-[1.625rem] leading-tight font-semibold text-text tabular-nums" data-value>{{ tile.value }}</span>
          @if (tile.delta; as delta) {
            <span class="text-xs text-text-muted" data-delta [attr.data-tone]="delta.tone">
              @if (delta.mark; as mark) {
                <span class="font-medium tabular-nums" [style.color]="toneColor(delta.tone)">{{ mark }}</span>
              }
              {{ delta.text }}
            </span>
          }
          @if (tile.note; as note) {
            <span class="text-xs text-text-muted" data-note>{{ note }}</span>
          }
        </div>
      }
    </div>
  `,
})
export class DashboardSummary {
  private readonly preferences = inject(Preferences);

  /** The panel of the cut in sight. */
  readonly view = input.required<StatsView>();

  protected readonly tiles = computed(() =>
    tilesOf(this.view(), this.preferences.t(), this.preferences.lang()),
  );

  protected toneColor(tone: Delta["tone"]): string | null {
    return tone === "none" ? null : TONES[tone];
  }
}

/** How a figure's value reads: a count, a duration, a share or US dollars. */
type Shape = "count" | "duration" | "share" | "usd";

/** The six figures, in the order of the row: whether going up is good, and how each reads. */
const FIGURES = [
  { id: "closed", es: "Cambios cerrados", en: "Changes closed", upIsGood: true, shape: "count" },
  { id: "tasks", es: "Tareas completadas", en: "Tasks completed", upIsGood: true, shape: "count" },
  { id: "cycle", es: "Ciclo (mediana)", en: "Cycle (median)", upIsGood: false, shape: "duration" },
  {
    id: "verifications",
    es: "Verificaciones que pasan",
    en: "Verifications passing",
    upIsGood: true,
    shape: "share",
  },
  { id: "cost", es: "Coste medido", en: "Measured cost", upIsGood: false, shape: "usd" },
  {
    id: "pending",
    es: "Pendientes abiertos",
    en: "Open pending items",
    upIsGood: false,
    shape: "count",
  },
] as const satisfies readonly {
  readonly id: keyof StatsView["summary"];
  readonly es: string;
  readonly en: string;
  readonly upIsGood: boolean;
  readonly shape: Shape;
}[];

/** The six figures, with their values in the page's language, their changes and their notes. */
function tilesOf(view: StatsView, t: Translate, lang: Lang): readonly Tile[] {
  const days = DAYS[view.query.period];
  return FIGURES.map(({ id, es, en, upIsGood, shape }) => {
    const figure = view.summary[id];
    const delta = deltaOf(figure, upIsGood, days, t, lang);
    const note = noteOf(id, view.summary, t, lang);
    return {
      id,
      label: t(es, en),
      value: figure.value === null ? "—" : shownValue(figure.value, shape, lang),
      ...(delta === undefined ? {} : { delta }),
      ...(note === undefined ? {} : { note }),
    };
  });
}

function shownValue(value: number, shape: Shape, lang: Lang): string {
  switch (shape) {
    case "duration":
      return formatDuration(value, lang);
    case "share":
      return percent(value, lang, 1);
    case "usd":
      return new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value);
    default:
      return new Intl.NumberFormat(lang).format(value);
  }
}

/** What a figure is counted on, under it: the cycle's ends, the verifications, the cost's changes. */
function noteOf(
  id: keyof StatsView["summary"],
  summary: StatsView["summary"],
  t: Translate,
  lang: Lang,
): string | undefined {
  const count = (value: number) => new Intl.NumberFormat(lang).format(value);
  const { verifications, cost } = summary;
  switch (id) {
    case "cycle":
      return t("de crear a cerrar", "from created to closed");
    case "verifications":
      return verifications.count === 1
        ? t("1 verificación de tarea", "1 task verification")
        : t(
            `${count(verifications.count)} verificaciones de tarea`,
            `${count(verifications.count)} task verifications`,
          );
    case "cost":
      return t(
        `en ${count(cost.measured)} de ${count(cost.of)} ${cost.of === 1 ? "cambio cerrado" : "cambios cerrados"}`,
        `in ${count(cost.measured)} of ${count(cost.of)} closed ${cost.of === 1 ? "change" : "changes"}`,
      );
    case "pending":
      return t("en la memoria", "in the memory");
    default:
      return undefined;
  }
}

function percent(value: number, lang: Lang, digits: number): string {
  return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: digits }).format(
    value,
  );
}

/**
 * How `figure` changed against the `days` before: none with «Todo» or without a value; «sin
 * datos» when those days have none; else ▲ or ▼ with the %, good when it went the right way.
 */
function deltaOf(
  figure: StatsFigure,
  upIsGood: boolean,
  days: number | undefined,
  t: Translate,
  lang: Lang,
): Delta | undefined {
  const { change } = figure;
  if (days === undefined || change === undefined || figure.value === null) return undefined;
  const before = t(`los ${days} días anteriores`, `the previous ${days} days`);
  if (change === null)
    return { tone: "none", text: t(`sin datos en ${before}`, `no data in ${before}`) };
  if (Math.round(change * 100) === 0)
    return { tone: "none", text: t(`sin cambios frente a ${before}`, `no change vs. ${before}`) };
  const up = change > 0;
  return {
    tone: up === upIsGood ? "good" : "bad",
    mark: `${up ? "▲" : "▼"} ${percent(Math.abs(change), lang, 0)}`,
    text: t(`frente a ${before}`, `vs. ${before}`),
  };
}
