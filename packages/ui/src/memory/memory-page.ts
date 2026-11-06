// SPDX-License-Identifier: Apache-2.0

import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import { LucideDynamicIcon } from "@lucide/angular";
import { PhaseBadge } from "../components/badge";
import { Button } from "../components/button";
import { Dialogs } from "../components/dialog";
import { LIST, PAGE, REVEAL, ROW, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideSearch } from "../components/icons";
import { Segmented } from "../components/segmented";
import { Skeleton } from "../components/skeleton";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import { ActionError, type Bilingual, SpectyData } from "../data/records";
import { reportFailure } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";
import { DropEntry } from "./drop-entry";
import { MemoryGroupView } from "./memory-group";
import { changeLine, ENTRY_KINDS, entryLine, firstLine } from "./memory-lines";
import { type MemoryItem, memorySections } from "./memory-view";

/** The toolbar's choices of kind: every entry, or one kind. */
const KIND_FILTERS = ["all", "pending", "improvement", "reminder", "decision", "lesson"] as const;

const ALL_KINDS: Bilingual = { es: "Todas", en: "All" };

const PLURALS: Readonly<Record<MemoryEntry["kind"], Bilingual>> = {
  pending: { es: "Pendientes", en: "Pending" },
  improvement: { es: "Mejoras", en: "Improvements" },
  reminder: { es: "Recordatorios", en: "Reminders" },
  decision: { es: "Decisiones", en: "Decisions" },
  lesson: { es: "Lecciones", en: "Lessons" },
};

/**
 * The memory page of `specty ui` (ADR 0016): what is the person's turn, who holds each open change
 * and Specty's memory, with a search, a filter by kind and the done and dropped entries on demand,
 * read again with every event the data source hears.
 */
@Component({
  selector: "sp-memory-page",
  imports: [
    NgTemplateOutlet,
    RouterLink,
    LucideDynamicIcon,
    PhaseBadge,
    SectionDivider,
    EmptyState,
    Skeleton,
    Segmented,
    Button,
    MemoryGroupView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page + ' flex flex-col gap-8 pt-10 pb-16'">
      <header class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Memoria de Specty', "Specty's memory") }}</h1>
        @if (summary(); as line) {
          <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
        }
        @if (read.hasValue() && !decisions.allowed()) {
          <p class="m-0 text-xs text-text-muted" data-read-only>
            {{ t()('Solo lectura: arranca', 'Read-only: start') }} <code class="font-mono">specty ui</code>
            {{ t()('desde tu terminal para descartar entradas o marcarlas hechas.', 'from your terminal to drop entries or mark them done.') }}
          </p>
        }
      </header>
      @if (read.error(); as error) {
        <div role="alert" class="rounded-xl border border-border bg-surface p-4 text-sm">
          {{ t()('No se pudo leer la memoria', 'Could not read the memory') }}: {{ message(error) }}
        </div>
      } @else if (!read.hasValue()) {
        <sp-skeleton height="4.5rem" />
      } @else if (everything().length === 0) {
        <sp-empty-state [heading]="t()('La memoria de Specty está vacía.', 'Specty\\'s memory is empty.')">
          {{ t()('Los agentes anotan aquí lo pendiente con specty memory add.', 'Agents add what is pending here with specty memory add.') }}
        </sp-empty-state>
      } @else {
        <div class="flex flex-wrap items-center gap-3" data-toolbar>
          <label class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-text-muted focus-within:border-focus sm:max-w-md">
            <svg [lucideIcon]="searchIcon" size="15" aria-hidden="true"></svg>
            <span class="sr-only">{{ t()('Buscar en la memoria', 'Search the memory') }}</span>
            <input type="search" class="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm text-text outline-none placeholder:text-text-muted" [placeholder]="t()('Buscar en la memoria', 'Search the memory')" [value]="query()" (input)="type($event)" (keydown.escape)="query.set('')" />
          </label>
          <sp-segmented [label]="t()('Tipo de entrada', 'Kind of entry')" [hideLabel]="true" [options]="kindOptions()" [(value)]="kind" />
          <label class="flex items-center gap-2 text-sm text-text-muted">
            <input type="checkbox" [checked]="closed()" (change)="closed.set(!closed())" />
            {{ t()('Ver hechas y descartadas', 'Show done and dropped') }}
          </label>
        </div>
        @if (sections().length === 0) {
          <p class="m-0 text-sm text-text-muted" role="status" data-no-match>{{ t()('Nada coincide con el filtro.', 'Nothing matches the filter.') }}</p>
        }
        @for (section of sections(); track section.key) {
          <section [attr.aria-labelledby]="'memory-' + section.key" [attr.data-section]="section.key">
            <sp-section-divider [heading]="t()(section.label.es, section.label.en)" [headingId]="'memory-' + section.key" [meta]="section.items.length" [level]="2" />
            @if (section.groups; as groups) {
              <div [class]="list + ' mt-2'">
                @for (group of groups; track group.change?.id ?? 'none') {
                  <sp-memory-group [group]="group" [row]="entryRow" />
                }
              </div>
            } @else {
              <div role="list" [class]="list + ' mt-2'">
                @for (item of section.items; track keyOf(item)) {
                  @if (entryOf(item)) {
                    <ng-container *ngTemplateOutlet="entryRow; context: { $implicit: item }" />
                  } @else if (changeOf(item); as change) {
                    <div role="listitem" [class]="row" [attr.data-change]="change.id">
                      <span></span>
                      <div class="flex min-w-0 flex-col gap-0.5">
                        <span class="flex flex-wrap items-center gap-2">
                          <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', change.id]">{{ change.title }}</a>
                          <sp-phase-badge [phase]="change.phase" />
                          @if (change.orphan) {
                            <span class="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" style="color: var(--color-phase-review); background: var(--color-phase-review-bg)">{{ t()('huérfano', 'orphaned') }}</span>
                          }
                        </span>
                        <span class="text-xs break-all text-text-muted">{{ changeLine(change) }}</span>
                      </div>
                      <span></span>
                    </div>
                  }
                }
              </div>
            }
          </section>
        }
      }
    </div>
    <ng-template #entryRow let-item>
      @if (entryOf(item); as entry) {
        <div role="listitem" [class]="row" [attr.data-entry]="entry.id">
          <span class="pt-0.5 font-mono text-xs text-text-muted tabular-nums">{{ entry.id }}</span>
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-sm break-words">
              <span class="mr-1.5 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" [style.color]="'var(--color-phase-' + kinds[entry.kind].tone + ')'" [style.background]="'var(--color-phase-' + kinds[entry.kind].tone + '-bg)'">{{ t()(kinds[entry.kind].label.es, kinds[entry.kind].label.en) }}</span>{{ firstLine(entry.text) }}
            </span>
            <span class="text-xs text-text-muted">{{ entryLine(item, entry) }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            @if (decisions.allowed()) {
              @switch (item.kind) {
                @case ('proposal') {
                  <sp-button size="sm" variant="primary" (pressed)="drop(entry)">{{ t()('Descartar', 'Drop') }}</sp-button>
                  <sp-button size="sm" (pressed)="keep(entry)">{{ t()('Mantener', 'Keep') }}</sp-button>
                }
                @case ('reminder') {
                  <sp-button size="sm" (pressed)="done(entry)">{{ t()('Marcar hecho', 'Mark done') }}</sp-button>
                }
                @case ('closed') {}
                @default {
                  <span [class]="reveal"><sp-button size="sm" (pressed)="drop(entry)">{{ t()('Descartar', 'Drop') }}</sp-button></span>
                }
              }
            }
          </div>
        </div>
      }
    </ng-template>
  `,
})
export class MemoryPage {
  /** From the route: `/memory?q=P12&closed=1`, as a change's page links one of its entries. */
  readonly q = input<string | undefined>(undefined);
  readonly closedParam = input<string | undefined>(undefined, { alias: "closed" });

  private readonly data = inject(SpectyData);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  private readonly failed = reportFailure(this.toasts, this.preferences);
  /** Whether the person can decide here: only on a server they started from their terminal. */
  protected readonly decisions = inject(Decisions);
  protected readonly t = this.preferences.t;
  protected readonly read = resource({ loader: () => this.data.memory() });
  protected readonly page = PAGE;
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly reveal = REVEAL;
  protected readonly kinds = ENTRY_KINDS;
  protected readonly firstLine = firstLine;

  /** «Descartar»: the dialog with the reason, which brings the one of a proposal. */
  protected drop(entry: MemoryEntry): void {
    this.dialogs.open(DropEntry, { entry });
  }

  /** «Mantener»: an entry an agent proposed to drop is open again. */
  protected keep(entry: MemoryEntry): void {
    const { id } = entry;
    this.data.memoryAction(id, "keep").then(() => {
      this.toasts.show(this.t()(`${id} sigue abierta.`, `${id} stays open.`), "success");
    }, this.failed);
  }

  /** «Marcar hecho»: a reminder is done. */
  protected done(entry: MemoryEntry): void {
    const { id } = entry;
    this.data.memoryAction(id, "done").then(() => {
      this.toasts.show(this.t()(`${id} hecho.`, `${id} done.`), "success");
    }, this.failed);
  }

  protected readonly searchIcon = LucideSearch;
  /** The search and the closed entries start as the URL says; the toolbar changes them after. */
  protected readonly query = linkedSignal(() => this.q() ?? "");
  protected readonly kind = signal("all");
  protected readonly closed = linkedSignal(() => this.closedParam() === "1");

  /** The page's sections without the toolbar's filter: none means the memory is empty. */
  protected readonly everything = computed(() => memorySections(this.record()));

  protected readonly sections = computed(() => {
    const kind = KIND_FILTERS.find((value) => value === this.kind()) ?? "all";
    return memorySections(this.record(), { query: this.query(), kind, closed: this.closed() });
  });

  protected readonly kindOptions = computed(() =>
    KIND_FILTERS.map((value) => {
      const label = value === "all" ? ALL_KINDS : PLURALS[value];
      return { value, label: this.t()(label.es, label.en) };
    }),
  );

  private readonly record = computed(() => {
    const record = this.read.hasValue() ? this.read.value() : undefined;
    return record ?? { entries: [], changes: [] };
  });

  protected type(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }

  protected readonly summary = computed(() => {
    const record = this.read.hasValue() ? this.read.value() : undefined;
    if (record === undefined) return undefined;
    const open = record.entries.filter(
      (entry) => entry.status !== "done" && entry.status !== "dropped",
    );
    return this.t()(
      `${open.length} entradas abiertas · ${record.changes.length} cambios abiertos`,
      `${open.length} open entries · ${record.changes.length} open changes`,
    );
  });

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  protected keyOf(item: MemoryItem): string {
    return `${item.kind}:${"entry" in item ? item.entry.id : item.change.id}`;
  }

  protected entryOf(item: MemoryItem): MemoryEntry | undefined {
    return "entry" in item ? item.entry : undefined;
  }

  protected changeOf(item: MemoryItem): StatusEntry | undefined {
    return "change" in item ? item.change : undefined;
  }

  /** Under an entry: who proposed to drop it and why, or who took it, its quote and its origin. */
  protected entryLine(item: MemoryItem, entry: MemoryEntry): string {
    return entryLine(item, entry, this.t());
  }

  /** Under a change: its id and kind, who it waits for, and who holds it or that it is orphaned. */
  protected changeLine(change: StatusEntry): string {
    return changeLine(change, this.t());
  }

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }
}
