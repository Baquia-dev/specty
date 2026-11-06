// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  resource,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { LIST, ROW, SectionDivider } from "../components/document";
import { type Bilingual, SpectyData } from "../data/records";
import { ENTRY_KINDS, firstLine } from "../memory/memory-lines";
import { Preferences } from "../theme/preferences";

/** Each status of an entry: its name and the phase color it borrows. */
const STATUSES: Readonly<
  Record<MemoryEntry["status"], { readonly label: Bilingual; readonly tone: string }>
> = {
  open: { label: { es: "abierta", en: "open" }, tone: "draft" },
  taken: { label: { es: "tomada", en: "taken" }, tone: "implementing" },
  done: { label: { es: "hecha", en: "done" }, tone: "done" },
  dropped: { label: { es: "descartada", en: "dropped" }, tone: "cancelled" },
  "drop-proposed": {
    label: { es: "propuesta para descartar", en: "proposed to drop" },
    tone: "review",
  },
};

const PILL = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium";

/**
 * «En la memoria», at the end of a change's header: the entries of Specty's memory that came from
 * the change or that it took (ADR 0016), by date, each with its status and a link to the memory
 * page with it searched. Nothing when there are none or the source does not give the memory.
 */
@Component({
  selector: "sp-change-memory",
  imports: [RouterLink, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    @if (entries().length > 0) {
      <section class="mt-8" aria-labelledby="change-memory" data-change-memory>
        <sp-section-divider [heading]="t()('En la memoria', 'In the memory')" headingId="change-memory" [meta]="entries().length" [level]="2" />
        <div role="list" [class]="list + ' mt-2'">
          @for (entry of entries(); track entry.id) {
            <div role="listitem" [class]="row" [attr.data-entry]="entry.id">
              <a class="pt-0.5 font-mono text-xs text-text-muted tabular-nums no-underline hover:text-text hover:underline" routerLink="/memory" [queryParams]="linkOf(entry)" [title]="t()('Ver ' + entry.id + ' en la Memoria', 'See ' + entry.id + ' in the memory')">{{ entry.id }}</a>
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="text-sm break-words">
                  <span [class]="pill + ' mr-1.5'" [style.color]="tone(kinds[entry.kind].tone)" [style.background]="ground(kinds[entry.kind].tone)">{{ t()(kinds[entry.kind].label.es, kinds[entry.kind].label.en) }}</span>{{ firstLine(entry.text) }}
                </span>
                <span class="text-xs text-text-muted">{{ lineOf(entry) }}</span>
              </div>
              <span [class]="pill + ' self-start'" [style.color]="tone(statuses[entry.status].tone)" [style.background]="ground(statuses[entry.status].tone)" data-status>{{ t()(statuses[entry.status].label.es, statuses[entry.status].label.en) }}</span>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class ChangeMemory {
  /** The id of the change. */
  readonly change = input.required<string>();

  private readonly data = inject(SpectyData);
  protected readonly t = inject(Preferences).t;
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly pill = PILL;
  protected readonly kinds = ENTRY_KINDS;
  protected readonly statuses = STATUSES;
  protected readonly firstLine = firstLine;
  private readonly read = resource({ loader: () => this.data.memory() });

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  /** Those that came from the change or that it took, by date; none without the memory. */
  protected readonly entries = computed(() => {
    const record = this.read.hasValue() ? this.read.value() : undefined;
    const id = this.change();
    return (record?.entries ?? [])
      .filter((entry) => entry.origin.change === id || entry.taken?.change === id)
      .toSorted((a, b) => a.created.localeCompare(b.created));
  });

  /** The memory page with the entry searched, and the done and dropped in view for a closed one. */
  protected linkOf(entry: MemoryEntry): Readonly<Record<string, string>> {
    const closed = entry.status === "done" || entry.status === "dropped";
    return closed ? { q: entry.id, closed: "1" } : { q: entry.id };
  }

  /** Under its first line: whether it came from the change or the change took it, who and when. */
  protected lineOf(entry: MemoryEntry): string {
    const t = this.t();
    const id = this.change();
    const taken = entry.taken?.change;
    return [
      ...(entry.origin.change === id ? [t("salió de este cambio", "came from this change")] : []),
      ...(taken === id ? [t("la tomó este cambio", "taken by this change")] : []),
      ...(taken !== undefined && taken !== id
        ? [t(`tomada por ${taken}`, `taken by ${taken}`)]
        : []),
      entry.origin.by === "person" ? t("la persona", "the person") : entry.origin.by,
      entry.created.slice(0, 10),
    ].join(" · ");
  }

  protected tone(name: string): string {
    return `var(--color-phase-${name})`;
  }

  protected ground(name: string): string {
    return `var(--color-phase-${name}-bg)`;
  }
}
