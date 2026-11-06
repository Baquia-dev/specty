// SPDX-License-Identifier: Apache-2.0
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  Injector,
  inject,
  signal,
  viewChild,
  viewChildren,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { LIST, PAGE, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideInbox, LucideSearchX, LucideTriangleAlert } from "../components/icons";
import { Skeleton } from "../components/skeleton";
import { ChangesStore } from "../data/changes-store";
import { ActionError, type ListedChange } from "../data/records";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences } from "../theme/preferences";
import { InboxEpic } from "./inbox-epic";
import { askWithFilters, InboxMore, pastTheEnd, withFinishedCounts } from "./inbox-more";
import { InboxRow } from "./inbox-row";
import { InboxState } from "./inbox-state";
import { InboxToolbar, InboxViewOptions } from "./inbox-toolbar";
import { inboxSections, phaseCounts, stateOf, visibleChanges } from "./inbox-view";

const TICK_MS = 30_000;

/** Every change as a document row: what waits for the person first, searchable and sortable. */
@Component({
  selector: "sp-inbox",
  imports: [
    LucideDynamicIcon,
    Button,
    SectionDivider,
    EmptyState,
    Skeleton,
    InboxEpic,
    InboxMore,
    InboxRow,
    InboxToolbar,
    InboxViewOptions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The search bar spans the whole width to pin like the compact bar; the rest keeps the page width. -->
    <div class="flex flex-col pt-10">
      <header [class]="page + ' flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-5'">
        <div class="flex flex-col gap-1.5">
          <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Bandeja', 'Inbox') }}</h1>
          @if (summary(); as line) {
            <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
          }
        </div>
        <sp-inbox-view-options />
      </header>

      @if (failure(); as error) {
        <div [class]="page + ' pt-3'">
        <div role="alert" class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <svg [lucideIcon]="warning" size="16" aria-hidden="true" style="color: var(--color-phase-cancelled)"></svg>
          <p class="m-0 flex-1 text-sm">
            {{ t()('No se pudieron leer los cambios', 'Could not read the changes') }}: {{ message(error) }}
          </p>
          <sp-button size="sm" (pressed)="retry()">{{ t()('Reintentar', 'Retry') }}</sp-button>
        </div>
        </div>
      }
      <!-- A read that fails after the first keeps the list under the alert. -->
      @if (!store.ready() || !store.pages.ready()) {
        @if (!failure()) {
        <div [class]="page + ' flex flex-col gap-3 pt-3'">
          <sp-skeleton height="2.5rem" />
          <sp-skeleton height="4.5rem" [announce]="false" />
          <sp-skeleton height="4.5rem" [announce]="false" />
        </div>
        }
      } @else {
        <sp-inbox-toolbar [counts]="counts()" [shown]="shown()" [total]="total()" />
        <div [class]="page + ' flex flex-col gap-8 pt-5'">
        @for (section of sections(); track section.key) {
          <section [attr.aria-labelledby]="'inbox-' + section.key" [attr.data-section]="section.key">
            <sp-section-divider [heading]="t()(section.label.es, section.label.en)" [headingId]="'inbox-' + section.key" [meta]="section.blocks.length" [level]="2" />
            <div role="list" [class]="list + ' mt-2'">
              @for (block of section.blocks; track block.key) {
                @if (block.kind === 'epic') {
                  <sp-inbox-epic [epicId]="block.epic.id">
                    <sp-inbox-row data-epic-head [change]="block.epic" [current]="isSelected(block.epic)" [now]="now()" (picked)="selectedId.set(block.epic.id)" />
                    @for (change of block.slices; track change.id) {
                      <sp-inbox-row [change]="change" [inEpic]="true" [current]="isSelected(change)" [now]="now()" (picked)="selectedId.set(change.id)" />
                    }
                  </sp-inbox-epic>
                } @else {
                  <sp-inbox-row [change]="block.change" [current]="isSelected(block.change)" [now]="now()" (picked)="selectedId.set(block.change.id)" />
                }
              }
            </div>
          </section>
        } @empty {
          @if (store.pages.loading()) {
            <!-- A new search, phase or sort: its first page is on its way. -->
          } @else if (state.filtered()) {
            <sp-empty-state [heading]="t()('Ningún cambio coincide', 'No change matches')" [icon]="noMatch">
              <p class="m-0">{{ t()('Prueba con otro texto u otra fase.', 'Try another text or phase.') }}</p>
              <sp-button size="sm" (pressed)="state.clear()">{{ t()('Limpiar filtros', 'Clear filters') }}</sp-button>
            </sp-empty-state>
          } @else {
            <sp-empty-state [heading]="t()('Aún no hay cambios', 'No changes yet')" [icon]="empty">
              <p class="m-0">{{ t()('Crea el primero desde la terminal con specty new.', 'Create the first one in the terminal with specty new.') }}</p>
            </sp-empty-state>
          }
        }
        @if (!store.pages.complete()) {
          <sp-inbox-more />
        }
        </div>
      }
    </div>
  `,
})
export class Inbox {
  protected readonly store = inject(ChangesStore);
  protected readonly state = inject(InboxState);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly page = PAGE;
  protected readonly list = LIST;
  protected readonly warning = LucideTriangleAlert;
  protected readonly noMatch = LucideSearchX;
  protected readonly empty = LucideInbox;
  protected readonly now = signal(Date.now());
  private readonly rows = viewChildren(InboxRow);
  private readonly toolbar = viewChild(InboxToolbar, { read: ElementRef });
  private readonly injector = inject(Injector);

  /** Why the changes could not be read: the open ones or a page of the finished ones. */
  protected readonly failure = computed(() => this.store.views.error() ?? this.store.pages.error());
  /** What the Inbox lists: every open change and the finished ones of the pages loaded. */
  private readonly listed = computed(() => [...this.store.open(), ...this.store.finished()]);
  protected readonly sections = computed(() =>
    inboxSections(this.listed(), this.state.filters(), this.preferences.lang()),
  );
  /** Each phase's count: the open ones here, the finished ones as the source counts them. */
  protected readonly counts = computed(() =>
    withFinishedCounts(
      phaseCounts(this.store.open(), this.state.query()),
      this.store.pages.counts(),
    ),
  );
  /** The rows j/k walk through, in the order they are shown: each epic, then its slices. */
  private readonly order = computed(() => this.sections().flatMap((section) => section.order));
  /** How many changes the filters let through, loaded or not, and how many there are. */
  protected readonly shown = computed(
    () => visibleChanges(this.store.open(), this.state.filters()).length + this.store.pages.total(),
  );
  protected readonly total = computed(() => this.store.open().length + this.store.pages.finished());
  /** The row picked with j/k: the first one until the person moves. */
  protected readonly selectedId = signal<string | undefined>(undefined);
  private readonly selected = computed(() => {
    const id = this.selectedId();
    return this.order().some((change) => change.id === id) ? id : this.order()[0]?.id;
  });

  /** "5 decisiones · 2 en curso · 2 recientes". */
  protected readonly summary = computed(() => {
    const t = this.t();
    const count = (state: string) =>
      this.store.open().filter((change) => stateOf(change) === state).length;
    const parts = [
      [count("decision"), t("decisión", "decision"), t("decisiones", "decisions")],
      [count("active"), t("en curso", "in progress"), t("en curso", "in progress")],
      [this.store.pages.finished(), t("reciente", "recent"), t("recientes", "recent")],
    ] as const;
    return parts
      .filter(([n]) => n > 0)
      .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
      .join(" · ");
  });

  constructor() {
    askWithFilters(this.store.pages);
    const shortcuts = inject(Shortcuts);
    const move = (step: number) => (): void => {
      const order = this.order();
      if (order.length === 0) return;
      const at = order.findIndex((change) => change.id === this.selected());
      // Past the last row loaded, the next page of finished changes, and then on to it.
      if (step > 0 && at === order.length - 1) {
        void pastTheEnd(this.store.pages, move(step));
        return;
      }
      const next = order[Math.min(Math.max(at + step, 0), order.length - 1)];
      if (next === undefined) return;
      this.selectedId.set(next.id);
      this.focus(next.id);
    };
    shortcuts.register({
      keys: "j",
      description: { es: "Siguiente cambio", en: "Next change" },
      run: move(1),
    });
    shortcuts.register({
      keys: "k",
      description: { es: "Cambio anterior", en: "Previous change" },
      run: move(-1),
    });
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    // A row reached with j/k stays under the fixed bar, however tall the bar grows.
    const host: HTMLElement = inject(ElementRef).nativeElement;
    let resize: ResizeObserver | undefined;
    effect(() => {
      const bar: HTMLElement | undefined = this.toolbar()?.nativeElement;
      resize?.disconnect();
      if (bar === undefined || typeof ResizeObserver === "undefined") return;
      resize = new ResizeObserver(() =>
        host.style.setProperty("--sp-sticky-top", `${bar.offsetHeight}px`),
      );
      resize.observe(bar);
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      resize?.disconnect();
    });
  }

  protected isSelected(change: ListedChange): boolean {
    return this.selected() === change.id;
  }

  protected retry(): void {
    this.store.views.reload();
    void this.store.pages.reload();
  }

  /** Focuses the row of `id`, or once it is drawn: a row of a page that just arrived. */
  private focus(id: string): void {
    const row = () => this.rows().find((item) => item.change().id === id);
    const now = row();
    if (now !== undefined) now.focus();
    else afterNextRender(() => row()?.focus(), { injector: this.injector });
  }

  protected message(error: unknown): string {
    if (error instanceof ActionError) return error.text[this.preferences.lang()];
    return error instanceof Error ? error.message : String(error);
  }
}
