// SPDX-License-Identifier: Apache-2.0
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { PHASES } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import { EdgeFade } from "../components/edge-fade";
import { LucideSearch } from "../components/icons";
import { Kbd } from "../components/kbd";
import { Select } from "../components/select";
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

/**
 * Pinned across the whole width, like the compact bar of a change, but solid: rows pass right
 * under the search. Its line shows once pinned.
 */
const BAR =
  "sticky top-0 z-10 block border-b bg-bg transition-colors duration-200 motion-reduce:transition-none";
const BAR_PINNED = `${BAR} border-border`;
const BAR_RESTING = `${BAR} border-transparent`;

/** Grouping and sorting: preferences of the view, rarely touched, so they sit in the header. */
@Component({
  selector: "sp-inbox-view-options",
  imports: [Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-wrap items-center gap-x-4 gap-y-3 text-[13px] text-text-muted" },
  template: `
    <div class="flex items-center gap-2">
      <span id="inbox-group">{{ t()('Agrupar', 'Group') }}</span>
      <div class="flex gap-1 rounded-lg bg-text/5 p-1" role="group" aria-labelledby="inbox-group" data-group>
        @for (group of groups; track group) {
          <button type="button" [class]="toggle" [attr.aria-pressed]="state.group() === group" (click)="state.group.set(group)">{{ t()(groupLabels[group][0], groupLabels[group][1]) }}</button>
        }
      </div>
    </div>
    <sp-select [label]="t()('Ordenar', 'Sort')" [options]="sorts()" [value]="state.sort()" (valueChange)="sortBy($event)" data-sort />
  `,
})
export class InboxViewOptions {
  protected readonly state = inject(InboxState);
  protected readonly t = inject(Preferences).t;
  protected readonly toggle = TOGGLE;
  protected readonly groups = INBOX_GROUPS;
  protected readonly groupLabels = GROUP_LABELS;
  /** The ways to sort, in the language of the interface, for the select. */
  protected readonly sorts = computed(() => {
    const t = this.t();
    return INBOX_SORTS.map((sort) => ({ value: sort, label: t(...SORT_LABELS[sort]) }));
  });

  protected sortBy(value: string): void {
    const sort = INBOX_SORTS.find((option) => option === value);
    if (sort !== undefined) this.state.sort.set(sort);
  }
}

/** Search and phase filters, pinned while the Inbox scrolls. "/" goes to the search. */
@Component({
  selector: "sp-inbox-toolbar",
  imports: [LucideDynamicIcon, Kbd, EdgeFade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class]": "pinned() ? barPinned : barResting",
    "[attr.data-pinned]": "pinned() || null",
  },
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-3">
      <div class="flex items-center gap-3">
        <label class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-text-muted focus-within:border-focus sm:max-w-md">
          <svg [lucideIcon]="searchIcon" size="15" aria-hidden="true"></svg>
          <span class="sr-only">{{ t()('Buscar cambios', 'Search changes') }}</span>
          <input #search type="search" class="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm text-text outline-none placeholder:text-text-muted" [placeholder]="t()('Buscar por título o id', 'Search by title or id')" [value]="state.query()" (input)="type($event)" (keydown.escape)="state.query.set('')" />
          <sp-kbd keys="/" />
        </label>
        <span class="ml-auto hidden items-center gap-1 text-xs text-text-muted sm:flex">
          <sp-kbd keys="j" /> <sp-kbd keys="k" /> {{ t()('moverte', 'move') }} ·
          <sp-kbd keys="enter" /> {{ t()('abrir', 'open') }}
        </span>
      </div>
      <!-- On a phone the phases stay on one line that scrolls sideways. -->
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div spEdgeFade class="-mx-6 flex min-w-0 gap-1.5 overflow-x-auto px-6 scrollbar-none sm:mx-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" [attr.aria-label]="t()('Filtrar por fase', 'Filter by phase')" data-phases>
          @for (option of phases(); track option.key) {
            <button type="button" class="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 font-sans text-xs font-medium text-text-muted aria-pressed:border-transparent aria-pressed:text-text" [style.background]="state.phase() === option.key ? option.background : null" [attr.aria-pressed]="state.phase() === option.key" (click)="pick(option.key)">
              <span class="size-1.5 rounded-full" [style.background]="option.dot" aria-hidden="true"></span>
              {{ option.label }}&ngsp;<span class="font-mono text-[11px] opacity-80">{{ option.count }}</span>
            </button>
          }
        </div>
        @if (state.filtered()) {
          <p class="m-0 flex shrink-0 items-center gap-2 text-[13px] text-text-muted sm:h-7" data-shown>
            {{ t()(shown() + ' de ' + total() + ' cambios', shown() + ' of ' + total() + ' changes') }} ·
            <button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] text-text underline" (click)="state.clear()">{{ t()('Limpiar filtros', 'Clear filters') }}</button>
          </p>
        }
      </div>
    </div>
  `,
})
export class InboxToolbar {
  /** How many changes of each phase the search lets through. */
  readonly counts = input.required<ReadonlyMap<InboxPhase, number>>();
  /** How many changes the filters let through, of all of them. */
  readonly shown = input(0);
  readonly total = input(0);

  protected readonly state = inject(InboxState);
  protected readonly t = inject(Preferences).t;
  protected readonly searchIcon = LucideSearch;
  protected readonly barPinned = BAR_PINNED;
  protected readonly barResting = BAR_RESTING;
  /** Stuck at the top, with rows passing under it. */
  protected readonly pinned = signal(false);
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
    // Pinned, its first pixel sits above the top edge: the bar is no longer whole in view.
    const host: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === "undefined") return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry === undefined) return;
          const top = entry.rootBounds?.top ?? 0;
          this.pinned.set(entry.intersectionRatio < 1 && entry.boundingClientRect.top <= top + 1);
        },
        // The shell's main is what scrolls; outside it, the viewport.
        { root: host.closest("main"), rootMargin: "-1px 0px 0px 0px", threshold: [1] },
      );
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Choosing the chosen phase again shows them all. */
  protected pick(phase: InboxPhase): void {
    this.state.phase.set(this.state.phase() === phase && phase !== "all" ? "all" : phase);
  }

  protected type(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.state.query.set(event.target.value);
  }
}
