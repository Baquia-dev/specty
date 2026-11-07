// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  resource,
} from "@angular/core";
import { Router } from "@angular/router";
import type {
  ChangeKind,
  StatsPeriod,
  StatsQuery,
  StatsView,
  StatsWho,
} from "@baquia-dev/specty-core";
import { PAGE } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { Segmented } from "../components/segmented";
import { Select } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { ActionError, SpectyData } from "../data/records";
import type { StatsParams } from "../data/source";
import { Preferences } from "../theme/preferences";
import { DashboardChanges } from "./dashboard-changes";
import { DashboardCost } from "./dashboard-cost";
import { DashboardExport } from "./dashboard-export";
import { DashboardFlow } from "./dashboard-flow";
import { shortDay } from "./dashboard-format";
import { DashboardMemory } from "./dashboard-memory";
import { DashboardPeople } from "./dashboard-people";
import { DashboardQuality } from "./dashboard-quality";
import { DashboardRhythm } from "./dashboard-rhythm";
import { DashboardScope } from "./dashboard-scope";
import { DashboardSummary } from "./dashboard-summary";

type Translate = (es: string, en: string) => string;

/** The periods, in the order of the filter; «all» compares with nothing. */
const PERIODS: readonly {
  readonly value: StatsPeriod;
  readonly es: string;
  readonly en: string;
}[] = [
  { value: "7d", es: "7 días", en: "7 days" },
  { value: "30d", es: "30 días", en: "30 days" },
  { value: "90d", es: "90 días", en: "90 days" },
  { value: "all", es: "Todo", en: "All time" },
];

/** The lanes, by the names of the Inbox's badges (`components/badge.ts`). */
const LANES: readonly { readonly value: ChangeKind; readonly es: string; readonly en: string }[] = [
  { value: "standard", es: "Feature", en: "Feature" },
  { value: "quick", es: "Quick", en: "Quick" },
  { value: "epic", es: "Épica", en: "Epic" },
  { value: "spike", es: "Spike", en: "Spike" },
  { value: "retro", es: "Manual", en: "Manual" },
];

/**
 * The «Panel» page of `specty ui` (docs/ui.md): what was done with Specty in a period, for
 * everyone or one person, agent or model, and one lane. Its filters live in the URL, so a reload
 * or a shared link keeps the cut; the source gives the figures of each cut (`GET /api/stats`).
 */
@Component({
  selector: "sp-dashboard-page",
  imports: [
    DashboardChanges,
    DashboardCost,
    DashboardExport,
    DashboardFlow,
    DashboardMemory,
    DashboardPeople,
    DashboardQuality,
    DashboardRhythm,
    DashboardScope,
    DashboardSummary,
    EmptyState,
    Segmented,
    Select,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page + ' flex flex-col gap-6 pt-10 pb-16'">
      <header class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Panel', 'Dashboard') }}</h1>
        @if (summary(); as line) {
          <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
        }
      </header>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3" data-filters>
        <sp-segmented data-period [label]="t()('Periodo', 'Period')" [options]="periods()" [value]="query().period" (valueChange)="choose({ period: $event })" />
        <sp-select data-who [label]="t()('Ver por', 'View by')" [options]="whoOptions()" [value]="whoText(query().who)" (valueChange)="choose({ who: $event })" />
        <sp-select data-kind [label]="t()('Carril', 'Lane')" [options]="lanes()" [value]="query().kind ?? ''" (valueChange)="choose({ kind: $event })" />
        @if (shown(); as view) {
          <sp-dashboard-export data-export class="ml-auto" [query]="view.query" />
        }
      </div>
      @if (read.error(); as error) {
        <div role="alert" class="rounded-xl border border-border bg-surface p-4 text-sm">
          {{ t()('No se pudo leer el panel', 'Could not read the dashboard') }}: {{ message(error) }}
        </div>
      } @else if (shown(); as view) {
        @if (view.changes === 0) {
          <sp-empty-state data-empty [heading]="t()('Ningún cambio en este periodo', 'No change in this period')">
            {{ t()('Elige otro periodo, otra persona, agente o modelo, u otro carril.', 'Choose another period, person, agent, model or lane.') }}
          </sp-empty-state>
        } @else {
          <sp-dashboard-summary [view]="view" />
          @if (view.rhythm; as rhythm) {
            <sp-dashboard-rhythm class="mt-4" [rhythm]="rhythm" [kind]="view.query.kind" />
          }
          @if (view.flow; as flow) {
            <sp-dashboard-flow class="mt-4" [flow]="flow" />
          }
          @if (view.quality; as quality) {
            <sp-dashboard-quality class="mt-4" [quality]="quality" />
          }
          @if (view.cost; as cost) {
            <sp-dashboard-cost class="mt-4" [cost]="cost" [measured]="view.summary.cost" />
          }
          @if (view.scope; as scope) {
            <sp-dashboard-scope class="mt-4" [scope]="scope" />
          }
          @if (view.memory; as memory) {
            <sp-dashboard-memory class="mt-4" [memory]="memory" />
          }
          @if (view.people; as people) {
            <sp-dashboard-people class="mt-4" [people]="people" [who]="view.query.who" (pick)="choose({ who: $event })" />
          }
          <sp-dashboard-changes [query]="view.query" />
        }
      } @else if (read.isLoading()) {
        <sp-skeleton height="5rem" />
      } @else {
        <sp-empty-state [heading]="t()('Esta fuente no da el panel.', 'This source does not give the dashboard.')">
          {{ t()('Lo da el servidor de specty ui.', 'The specty ui server gives it.') }}
        </sp-empty-state>
      }
    </div>
  `,
})
export class DashboardPage {
  private readonly data = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly router = inject(Router);

  /** The cut, as the URL has it: each parameter, if it is there. */
  readonly period = input<string>();
  readonly who = input<string>();
  readonly kind = input<string>();

  protected readonly t = this.preferences.t;
  protected readonly page = PAGE;

  private readonly params = computed((): StatsParams => {
    const period = this.period();
    const who = this.who();
    const kind = this.kind();
    return {
      ...(period === undefined ? {} : { period }),
      ...(who === undefined ? {} : { who }),
      ...(kind === undefined ? {} : { kind }),
    };
  });

  protected readonly read = resource({
    params: () => this.params(),
    loader: ({ params }) => this.data.stats(params),
  });

  /** The last panel read: another cut keeps the one in sight until it comes. */
  protected readonly shown = linkedSignal<StatsView | undefined, StatsView | undefined>({
    source: () => (this.read.hasValue() ? this.read.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });

  /** The cut in sight, as the source understood it. */
  protected readonly query = computed((): StatsQuery => this.shown()?.query ?? { period: "30d" });

  protected readonly periods = computed(() => {
    const t = this.t();
    return PERIODS.map(({ value, es, en }) => ({ value, label: t(es, en) }));
  });

  protected readonly lanes = computed(() => {
    const t = this.t();
    return [
      { value: "", label: t("Todos", "All") },
      ...LANES.map(({ value, es, en }) => ({ value, label: t(es, en) })),
    ];
  });

  protected readonly whoOptions = computed(() => {
    const t = this.t();
    const options = this.shown()?.options ?? [];
    return [
      { value: "", label: t("Todos", "Everyone") },
      ...options.map(({ who }) => ({ value: this.whoText(who), label: whoLabel(who, t) })),
    ];
  });

  /** «42 cambios · 9 oct – 7 nov · Todos», and the lane when there is one. */
  protected readonly summary = computed(() => {
    const view = this.shown();
    if (view === undefined) return undefined;
    const t = this.t();
    const lang = this.preferences.lang();
    const { changes, range, query } = view;
    const lane = LANES.find((known) => known.value === query.kind);
    return [
      t(
        `${changes} ${changes === 1 ? "cambio" : "cambios"}`,
        `${changes} ${changes === 1 ? "change" : "changes"}`,
      ),
      `${shortDay(range.from, lang)} – ${shortDay(range.to, lang)}`,
      query.who === undefined ? t("Todos", "Everyone") : whoLabel(query.who, t),
      ...(lane === undefined ? [] : [t(lane.es, lane.en)]),
    ].join(" · ");
  });

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  /** Another period, who or lane: into the URL, without the defaults, and the page follows it. */
  protected choose(change: Readonly<Partial<Record<"period" | "who" | "kind", string>>>): void {
    const query = this.query();
    const next = {
      period: query.period,
      who: this.whoText(query.who),
      kind: query.kind ?? "",
      ...change,
    };
    void this.router.navigate([], {
      queryParams: {
        period: next.period === "30d" ? null : next.period,
        who: next.who === "" ? null : next.who,
        kind: next.kind === "" ? null : next.kind,
      },
      replaceUrl: true,
    });
  }

  /** `person:Ana` as the URL has it; empty for everyone. */
  protected whoText(who: StatsWho | undefined): string {
    return who === undefined ? "" : `${who.kind}:${who.name}`;
  }

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }
}

/** «Persona: Ana», or «Modelo: (sin dato)» for the changes that do not say. */
function whoLabel(who: StatsWho, t: Translate): string {
  const kinds = {
    person: t("Persona", "Person"),
    agent: t("Agente", "Agent"),
    model: t("Modelo", "Model"),
  };
  return `${kinds[who.kind]}: ${who.name === "" ? t("(sin dato)", "(no data)") : who.name}`;
}
