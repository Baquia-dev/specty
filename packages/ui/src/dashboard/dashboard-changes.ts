// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  PendingTasks,
  resource,
  signal,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { StatsChangeSort, StatsChangesPage, StatsQuery } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import { KindBadge } from "../components/badge";
import { Button } from "../components/button";
import { SectionDivider } from "../components/document";
import { LucideCircleX, LucideSearch } from "../components/icons";
import { ShownText } from "../components/shown-text";
import { ActionError, SpectyData } from "../data/records";
import type { StatsChangesParams } from "../data/source";
import { Preferences } from "../theme/preferences";
import { COLUMNS, type Column, type Direction, rowsOf } from "./dashboard-table";

/** How many changes a page has, as the server gives them by default. */
const PAGE_SIZE = 25;
/** How long the search waits for the person to stop typing, as the Inbox's. */
const TYPING_MS = 250;

const CELL = "px-2 py-1.5";
const FIGURE = `${CELL} text-right whitespace-nowrap tabular-nums`;

/**
 * The «Cambios» section of the «Panel» (docs/ui.md): the changes of the cut in a table, by pages
 * of 25 that the source gives (`GET /api/stats/changes`), found by title or id, sorted by the
 * column whose header is pressed, and each row opening its change. The search, the order and the
 * page live here: a new cut, search or order goes back to the first page. A source that does not
 * give the table leaves the section out.
 */
@Component({
  selector: "sp-dashboard-changes",
  imports: [Button, KindBadge, LucideDynamicIcon, RouterLink, SectionDivider, ShownText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown() || read.error()) {
      <section class="flex flex-col gap-3" aria-labelledby="dashboard-changes" data-changes>
        <sp-section-divider [heading]="t()('Cambios', 'Changes')" headingId="dashboard-changes" [level]="2" [meta]="shown()?.total ?? ''" />
        <div class="flex flex-col gap-3 pl-6">
          <label class="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-text-muted focus-within:border-focus sm:max-w-md">
            <svg [lucideIcon]="searchIcon" size="15" aria-hidden="true"></svg>
            <span class="sr-only">{{ t()('Buscar en los cambios del periodo', 'Search the changes of the period') }}</span>
            <input data-search type="search" class="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm text-text outline-none placeholder:text-text-muted" [placeholder]="t()('Buscar por título o id', 'Search by title or id')" [value]="typed()" (input)="type($event)" (keydown.escape)="clear()" />
          </label>
          @if (read.error(); as error) {
            <p role="alert" class="m-0 text-sm text-text-muted">{{ t()('No se pudo leer la tabla', 'Could not read the table') }}: {{ message(error) }}</p>
          }
          @if (shown(); as page) {
            @if (page.total === 0) {
              <p class="m-0 text-sm text-text-muted" data-none>{{ none() }}</p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[56rem] border-collapse text-[13px]">
                  <caption class="sr-only">{{ t()('Cambios del periodo; cada fila abre su cambio', 'Changes of the period; each row opens its change') }}</caption>
                  <thead>
                    <tr>
                      @for (column of columns(); track column.key) {
                        <th scope="col" [class]="'border-b border-border px-2 py-1.5 whitespace-nowrap ' + (column.figure ? 'text-right' : 'text-left')" [attr.aria-sort]="ariaSort(column.key)">
                          <button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-sans text-xs font-medium text-text-muted hover:text-text" [attr.data-sort]="column.key" (click)="sortBy(column)">{{ column.label }}@if (arrow(column.key); as mark) {<span aria-hidden="true">&ngsp;{{ mark }}</span>}</button>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.id) {
                      <tr class="cursor-pointer align-top transition-colors duration-150 hover:bg-text/4 motion-reduce:transition-none" [attr.data-change]="row.id" (click)="open($event, row.id)">
                        <td data-cell="closed" [class]="CELL + ' whitespace-nowrap tabular-nums'">{{ row.closed }}</td>
                        <td data-cell="title" [class]="CELL + ' max-w-md'">
                          <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', row.id]"><sp-text [text]="row.title" /></a>
                          <span class="block font-mono text-[11px] text-text-muted">{{ row.id }}</span>
                        </td>
                        <td data-cell="kind" [class]="CELL"><sp-kind-badge [kind]="row.kind" /></td>
                        <td data-cell="size" [class]="CELL">{{ row.size }}</td>
                        <td data-cell="agent" [class]="CELL + ' whitespace-nowrap'">{{ row.agent }}</td>
                        <td data-cell="tasks" [class]="FIGURE">{{ row.tasks }}</td>
                        <td data-cell="cycle" [class]="FIGURE">{{ row.cycle }}</td>
                        <td data-cell="failed" [class]="FIGURE">
                          @if (row.failed > 0) {
                            <span class="inline-flex items-center gap-1 text-phase-cancelled" data-failed><svg [lucideIcon]="failedIcon" size="12" aria-hidden="true"></svg>{{ row.failedText }}</span>
                          } @else {
                            {{ row.failedText }}
                          }
                        </td>
                        <td data-cell="cost" [class]="FIGURE">{{ row.cost }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="flex items-center justify-end gap-2 text-xs text-text-muted" data-pager>
                <span data-page>{{ pageLine() }}</span>
                <sp-button data-previous size="sm" [disabledReason]="first() ? t()('Es la primera página', 'This is the first page') : ''" (pressed)="go(-1)">{{ t()('Anterior', 'Previous') }}</sp-button>
                <sp-button data-next size="sm" [disabledReason]="last() ? t()('Es la última página', 'This is the last page') : ''" (pressed)="go(1)">{{ t()('Siguiente', 'Next') }}</sp-button>
              </div>
            }
          }
        </div>
      </section>
    }
  `,
})
export class DashboardChanges {
  private readonly data = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly router = inject(Router);
  private readonly tasks = inject(PendingTasks);

  /** The panel's cut, as the source understood it. */
  readonly query = input.required<StatsQuery>();

  protected readonly t = this.preferences.t;
  protected readonly CELL = CELL;
  protected readonly FIGURE = FIGURE;
  protected readonly searchIcon = LucideSearch;
  protected readonly failedIcon = LucideCircleX;

  /** What the search box has, and the search asked, once the person stops typing. */
  protected readonly typed = signal("");
  private readonly search = signal("");
  private readonly order = signal<{ readonly sort: StatsChangeSort; readonly dir: Direction }>({
    sort: "closed",
    dir: "desc",
  });

  /** The page asked for, from 0: back to the first with a new cut, search or order. */
  private readonly index = linkedSignal({
    source: computed(() => JSON.stringify([this.query(), this.search(), this.order()])),
    computation: () => 0,
  });

  private readonly params = computed(
    (): StatsChangesParams => {
      const { period, who, kind } = this.query();
      return {
        period,
        ...(who === undefined ? {} : { who: `${who.kind}:${who.name}` }),
        ...(kind === undefined ? {} : { kind }),
        q: this.search(),
        ...this.order(),
        offset: this.index() * PAGE_SIZE,
        limit: PAGE_SIZE,
        lang: this.preferences.lang(),
      };
    },
    { equal: (one, other) => JSON.stringify(one) === JSON.stringify(other) },
  );

  protected readonly read = resource({
    params: () => this.params(),
    loader: ({ params }) => this.data.statsChanges(params),
  });

  /** The last page read: another one keeps it in sight until it comes. */
  protected readonly shown = linkedSignal<
    StatsChangesPage | undefined,
    StatsChangesPage | undefined
  >({
    source: () => (this.read.hasValue() ? this.read.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });

  protected readonly columns = computed(() => {
    const t = this.t();
    return COLUMNS.map((column) => ({ ...column, label: t(column.es, column.en) }));
  });

  protected readonly rows = computed(() => {
    const page = this.shown();
    return page === undefined ? [] : rowsOf(page, this.preferences.lang());
  });

  /** The page in sight, from 0, as the source gave it. */
  private readonly at = computed(() => {
    const table = this.shown()?.table;
    return table === undefined ? 0 : Math.floor(table.offset / table.limit);
  });
  private readonly pages = computed(() =>
    Math.max(1, Math.ceil((this.shown()?.total ?? 0) / PAGE_SIZE)),
  );
  protected readonly first = computed(() => this.at() === 0);
  protected readonly last = computed(() => this.at() + 1 >= this.pages());

  protected readonly pageLine = computed(() => {
    const page = this.at() + 1;
    const pages = this.pages();
    return this.t()(`Página ${page} de ${pages}`, `Page ${page} of ${pages}`);
  });

  /** Why the table is empty: nothing matches the search, or nothing lived in the period. */
  protected readonly none = computed(() => {
    const t = this.t();
    const q = this.shown()?.table.q ?? "";
    return q === ""
      ? t("Ningún cambio en este periodo.", "No change in this period.")
      : t(
          `Ningún cambio del periodo coincide con «${q}».`,
          `No change of the period matches “${q}”.`,
        );
  });

  private timer: ReturnType<typeof setTimeout> | undefined;
  private waiting: (() => void) | undefined;

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.stopWaiting();
    });
  }

  /** The search, asked once the person stops typing: the wait is a pending task. */
  protected type(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const text = event.target.value;
    this.typed.set(text);
    this.stopWaiting();
    this.waiting = this.tasks.add();
    this.timer = setTimeout(() => {
      this.search.set(text);
      this.stopWaiting();
    }, TYPING_MS);
  }

  protected clear(): void {
    this.stopWaiting();
    this.typed.set("");
    this.search.set("");
  }

  /** Its column the other way, or another column in its natural direction. */
  protected sortBy(column: Column): void {
    const { sort, dir } = this.order();
    this.order.set(
      sort === column.key
        ? { sort, dir: dir === "asc" ? "desc" : "asc" }
        : { sort: column.key, dir: column.natural },
    );
  }

  protected ariaSort(key: StatsChangeSort): "ascending" | "descending" | null {
    const { sort, dir } = this.order();
    if (sort !== key) return null;
    return dir === "asc" ? "ascending" : "descending";
  }

  protected arrow(key: StatsChangeSort): string {
    const { sort, dir } = this.order();
    if (sort !== key) return "";
    return dir === "asc" ? "↑" : "↓";
  }

  protected go(step: number): void {
    this.index.set(this.at() + step);
  }

  /** A press anywhere in the row opens its change; its link opens it on its own. */
  protected open(event: MouseEvent, id: string): void {
    if (event.target instanceof Element && event.target.closest("a") !== null) return;
    void this.router.navigate(["/changes", id]);
  }

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }

  private stopWaiting(): void {
    clearTimeout(this.timer);
    this.waiting?.();
    this.waiting = undefined;
  }
}
