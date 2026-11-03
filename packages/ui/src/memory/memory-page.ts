// SPDX-License-Identifier: Apache-2.0

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import { PhaseBadge } from "../components/badge";
import { LIST, PAGE, ROW, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { Skeleton } from "../components/skeleton";
import { ActionError, type Bilingual, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { type MemoryItem, memorySections } from "./memory-view";

/** Each kind of entry: its name and the phase color it borrows. */
const KINDS: Readonly<
  Record<MemoryEntry["kind"], { readonly label: Bilingual; readonly tone: string }>
> = {
  pending: { label: { es: "pendiente", en: "pending" }, tone: "draft" },
  improvement: { label: { es: "mejora", en: "improvement" }, tone: "implementing" },
  reminder: { label: { es: "recordatorio", en: "reminder" }, tone: "acceptance" },
  decision: { label: { es: "decisión", en: "decision" }, tone: "review" },
};

/**
 * The memory page of `specty ui` (ADR 0016): what is the person's turn, who holds each open change
 * and Specty's memory, read again with every event the data source hears.
 */
@Component({
  selector: "sp-memory-page",
  imports: [RouterLink, PhaseBadge, SectionDivider, EmptyState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page + ' flex flex-col gap-8 pt-10 pb-16'">
      <header class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Memoria de Specty', "Specty's memory") }}</h1>
        @if (summary(); as line) {
          <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
        }
      </header>
      @if (read.error(); as error) {
        <div role="alert" class="rounded-xl border border-border bg-surface p-4 text-sm">
          {{ t()('No se pudo leer la memoria', 'Could not read the memory') }}: {{ message(error) }}
        </div>
      } @else if (!read.hasValue()) {
        <sp-skeleton height="4.5rem" />
      } @else if (sections().length === 0) {
        <sp-empty-state [heading]="t()('La memoria de Specty está vacía.', 'Specty\\'s memory is empty.')">
          {{ t()('Los agentes anotan aquí lo pendiente con specty memory add.', 'Agents add what is pending here with specty memory add.') }}
        </sp-empty-state>
      } @else {
        @for (section of sections(); track section.key) {
          <section [attr.aria-labelledby]="'memory-' + section.key" [attr.data-section]="section.key">
            <sp-section-divider [heading]="t()(section.label.es, section.label.en)" [headingId]="'memory-' + section.key" [meta]="section.items.length" [level]="2" />
            <div role="list" [class]="list + ' mt-2'">
              @for (item of section.items; track keyOf(item)) {
                @if (entryOf(item); as entry) {
                  <div role="listitem" [class]="row" [attr.data-entry]="entry.id">
                    <span class="pt-0.5 font-mono text-xs text-text-muted tabular-nums">{{ entry.id }}</span>
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <span class="text-sm break-words">
                        <span class="mr-1.5 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" [style.color]="'var(--color-phase-' + kinds[entry.kind].tone + ')'" [style.background]="'var(--color-phase-' + kinds[entry.kind].tone + '-bg)'">{{ t()(kinds[entry.kind].label.es, kinds[entry.kind].label.en) }}</span>{{ firstLine(entry.text) }}
                      </span>
                      <span class="text-xs text-text-muted">{{ entryLine(item, entry) }}</span>
                    </div>
                    <span></span>
                  </div>
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
          </section>
        }
      }
    </div>
  `,
})
export class MemoryPage {
  private readonly data = inject(SpectyData);
  protected readonly t = inject(Preferences).t;
  protected readonly read = resource({ loader: () => this.data.memory() });
  protected readonly page = PAGE;
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly kinds = KINDS;

  protected readonly sections = computed(() => {
    const record = this.read.hasValue() ? this.read.value() : undefined;
    return memorySections(record ?? { entries: [], changes: [] });
  });

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

  protected firstLine(text: string): string {
    return text.trim().split("\n")[0] ?? "";
  }

  /** Under an entry: who proposed to drop it and why, or who took it, its quote and its origin. */
  protected entryLine(item: MemoryItem, entry: MemoryEntry): string {
    const t = this.t();
    if (item.kind === "proposal" && entry.drop !== undefined)
      return t(
        `Propuesta para descartar por ${entry.drop.by}: «${entry.drop.reason}»`,
        `Proposed to drop by ${entry.drop.by}: “${entry.drop.reason}”`,
      );
    const by = entry.origin.by === "person" ? t("la persona", "the person") : entry.origin.by;
    return [
      ...(entry.taken === undefined
        ? []
        : [t(`tomada por ${entry.taken.change}`, `taken by ${entry.taken.change}`)]),
      ...(entry.quote === undefined ? [] : [`«${entry.quote}»`]),
      ...(entry.origin.change === undefined ? [] : [entry.origin.change]),
      by,
      entry.created.slice(0, 10),
    ].join(" · ");
  }

  /** Under a change: its id and kind, who it waits for, and who holds it or that it is orphaned. */
  protected changeLine(change: StatusEntry): string {
    const t = this.t();
    const waits = {
      agent: t("espera al agente", "waits for the agent"),
      human: t("espera tu decisión", "waits for your decision"),
      nobody: "—",
    }[change.waitingFor];
    return [`${change.id} · ${change.kind}`, waits, this.heldBy(change)].join(" · ");
  }

  private heldBy(change: StatusEntry): string {
    const t = this.t();
    const { holder } = change;
    if (holder === undefined)
      return change.orphan === true
        ? t("ninguna sesión lo lleva", "no session holds it")
        : t("sin sesión conocida", "no session seen");
    return t(
      `lo lleva ${holder.tool}, ${this.ago(holder.ago)}`,
      `held by ${holder.tool}, ${this.ago(holder.ago)}`,
    );
  }

  /** How long ago, from minutes: under a minute, minutes, hours up to two days, then days. */
  private ago(minutes: number): string {
    const t = this.t();
    if (minutes < 1) return t("ahora mismo", "just now");
    const [count, unit] =
      minutes < 60
        ? [Math.floor(minutes), "min"]
        : minutes < 48 * 60
          ? [Math.floor(minutes / 60), "h"]
          : [Math.floor(minutes / (24 * 60)), "d"];
    return t(`hace ${count} ${unit}`, `${count} ${unit} ago`);
  }

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }
}
