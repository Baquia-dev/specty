// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  viewChild,
} from "@angular/core";
import { PHASES } from "@baquia-dev/specty-core";
import { LucideDynamicIcon, LucideSearch } from "@lucide/angular";
import { Kbd } from "../components/kbd";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences } from "../theme/preferences";
import { PHASE_LABELS } from "../theme/tokens";
import { InboxState } from "./inbox-state";
import {
  INBOX_GROUPS,
  INBOX_SORTS,
  type InboxGroup,
  type InboxPhase,
  type InboxSort,
} from "./inbox-view";

const GROUP_LABELS: Readonly<Record<InboxGroup, readonly [string, string]>> = {
  state: ["Estado", "State"],
  phase: ["Fase", "Phase"],
  none: ["Sin agrupar", "No groups"],
};

const SORT_LABELS: Readonly<Record<InboxSort, readonly [string, string]>> = {
  waiting: ["Lo que más espera primero", "Longest waiting first"],
  recent: ["Lo más reciente primero", "Most recent first"],
  title: ["Título, de la A a la Z", "Title, A to Z"],
  size: ["Tamaño, de mayor a menor", "Size, largest first"],
};

/** A pressed toggle in a group of them reads as the chosen one. */
const TOGGLE =
  "flex h-7 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 font-sans text-[13px] text-text-muted aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-sm";

/** Search, phase filters, grouping and sorting of the Inbox. "/" goes to the search. */
@Component({
  selector: "sp-inbox-toolbar",
  imports: [LucideDynamicIcon, Kbd],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-3" },
  template: `
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex h-10 min-w-0 flex-[1_1_18rem] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-text-muted focus-within:border-focus sm:max-w-md">
        <svg [lucideIcon]="searchIcon" size="15" aria-hidden="true"></svg>
        <span class="sr-only">{{ t()('Buscar cambios', 'Search changes') }}</span>
        <input #search type="search" class="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm text-text outline-none placeholder:text-text-muted" [placeholder]="t()('Buscar por título o id', 'Search by title or id')" [value]="state.query()" (input)="type($event)" (keydown.escape)="state.query.set('')" />
        <sp-kbd keys="/" />
      </label>
      <span class="hidden flex-1 md:block" aria-hidden="true"></span>
      <div class="flex items-center gap-2 text-[13px] text-text-muted">
        <span id="inbox-group">{{ t()('Agrupar', 'Group') }}</span>
        <div class="flex gap-1 rounded-lg bg-text/5 p-1" role="group" aria-labelledby="inbox-group" data-group>
          @for (group of groups; track group) {
            <button type="button" [class]="toggle" [attr.aria-pressed]="state.group() === group" (click)="state.group.set(group)">{{ t()(groupLabels[group][0], groupLabels[group][1]) }}</button>
          }
        </div>
      </div>
      <label class="flex items-center gap-2 text-[13px] text-text-muted">
        {{ t()('Ordenar', 'Sort') }}
        <select class="h-9 rounded-lg border border-border bg-surface px-2 font-sans text-[13px] text-text" (change)="sortBy($event)" data-sort>
          @for (sort of sorts; track sort) {
            <option [value]="sort" [selected]="state.sort() === sort">{{ t()(sortLabels[sort][0], sortLabels[sort][1]) }}</option>
          }
        </select>
      </label>
    </div>
    <div class="flex flex-wrap gap-1.5" role="group" [attr.aria-label]="t()('Filtrar por fase', 'Filter by phase')" data-phases>
      @for (option of phases(); track option.key) {
        <button type="button" class="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 font-sans text-xs font-medium text-text-muted aria-pressed:border-transparent aria-pressed:text-text" [style.background]="state.phase() === option.key ? option.background : null" [attr.aria-pressed]="state.phase() === option.key" (click)="pick(option.key)">
          <span class="size-1.5 rounded-full" [style.background]="option.dot" aria-hidden="true"></span>
          {{ option.label }}&ngsp;<span class="font-mono text-[11px] opacity-80">{{ option.count }}</span>
        </button>
      }
    </div>
  `,
})
export class InboxToolbar {
  /** How many changes of each phase the search lets through. */
  readonly counts = input.required<ReadonlyMap<InboxPhase, number>>();

  protected readonly state = inject(InboxState);
  protected readonly t = inject(Preferences).t;
  protected readonly searchIcon = LucideSearch;
  protected readonly toggle = TOGGLE;
  protected readonly groups = INBOX_GROUPS;
  protected readonly sorts = INBOX_SORTS;
  protected readonly groupLabels = GROUP_LABELS;
  protected readonly sortLabels = SORT_LABELS;
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>("search");

  /** "Todas" and every phase with changes, plus the one chosen even if it has none left. */
  protected readonly phases = computed(() => {
    const t = this.t();
    const chosen = this.state.phase();
    return [
      {
        key: "all" as const,
        label: t("Todas", "All"),
        count: this.counts().get("all") ?? 0,
        dot: "var(--color-text-muted)",
        background: "color-mix(in oklab, var(--color-text) 8%, transparent)",
      },
      ...PHASES.filter((phase) => (this.counts().get(phase) ?? 0) > 0 || phase === chosen).map(
        (phase) => ({
          key: phase,
          label: t(PHASE_LABELS[phase].es, PHASE_LABELS[phase].en),
          count: this.counts().get(phase) ?? 0,
          dot: `var(--color-phase-${phase})`,
          background: `var(--color-phase-${phase}-bg)`,
        }),
      ),
    ];
  });

  constructor() {
    inject(Shortcuts).register({
      keys: "/",
      description: { es: "Buscar en la Bandeja", en: "Search the Inbox" },
      run: () => this.search().nativeElement.focus(),
    });
  }

  /** Choosing the chosen phase again shows them all. */
  protected pick(phase: InboxPhase): void {
    this.state.phase.set(this.state.phase() === phase && phase !== "all" ? "all" : phase);
  }

  protected type(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.state.query.set(event.target.value);
  }

  protected sortBy(event: Event): void {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
    const sort = INBOX_SORTS.find((option) => option === value);
    if (sort !== undefined) this.state.sort.set(sort);
  }
}
