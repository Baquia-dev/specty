// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { Badge } from "../components/badge";
import { ItemTooltips } from "../components/item-tooltip";
import { Select, type SelectOption } from "../components/select";
import { Skeleton } from "../components/skeleton";
import type { DiffFile, DiffLine } from "../data/diff";
import { ActionError, SpectyData } from "../data/records";
import type { TraceBlock, TraceRecord } from "../data/trace";
import { HIGHLIGHT, type LineSpan, spansOf } from "../highlight/highlight";
import { Preferences } from "../theme/preferences";
import { TraceDiff } from "./trace-diff";

/** A block with its lines, each with its number in the file and its pieces of code. */
interface ShownBlock {
  readonly block: TraceBlock;
  readonly lines: readonly { readonly number: number; readonly spans: readonly LineSpan[] }[];
}

/** The file as one section of context lines, numbered as in the file. */
function diffOf(trace: TraceRecord): DiffFile {
  const lines = trace.lines.map(
    (text, index): DiffLine => ({
      kind: "context",
      text,
      oldNumber: index + 1,
      newNumber: index + 1,
    }),
  );
  const count = lines.length;
  return {
    path: trace.path,
    status: "modified",
    binary: false,
    additions: 0,
    deletions: 0,
    hunks: [{ oldStart: 1, oldLines: count, newStart: 1, newLines: count, section: "", lines }],
  };
}

/**
 * The «Trazabilidad» view of the History tab (docs/ui.md, Historial): the files the change left
 * and, of the chosen one, its lines with a blame margin. Each block says which commit it comes
 * from and, when Specty made it, its change, its task and the criteria it covers.
 */
@Component({
  selector: "sp-trace-view",
  imports: [Select, Skeleton, Badge, RouterLink, TraceDiff],
  hostDirectives: [ItemTooltips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-4" },
  template: `
    @if (message(); as message) {
      <p class="m-0 text-sm text-text-muted" data-trace-message>{{ message }}</p>
    } @else if (!files.hasValue()) {
      <sp-skeleton [lines]="4" height="12px" />
    } @else {
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
        <sp-select class="w-full max-w-xl" [label]="t()('Archivo', 'File')" [options]="fileOptions()" [(value)]="chosen" />
        @if (trace.hasValue()) {
          <p class="m-0 pb-2 text-xs text-text-muted">
            {{ t()('Como lo dejó el commit', 'As left by commit') }}
            <code class="font-mono">{{ trace.value().commit }}</code>
          </p>
        }
      </div>
      @if (traceFailure(); as failure) {
        <p class="m-0 text-sm text-text-muted" data-trace-message>{{ failure }}</p>
      } @else if (!trace.hasValue()) {
        <sp-skeleton [lines]="8" height="12px" />
      } @else {
        <div class="overflow-x-auto rounded-lg border border-border">
          @for (shown of blocks(); track shown.block.start) {
            <section class="grid min-w-max grid-cols-[14rem_minmax(0,1fr)] border-b border-border last:border-b-0" data-block>
              @let commit = shown.block.commit;
              @let open = opened() === shown.block.start;
              <div class="flex flex-col gap-1 border-r border-border bg-surface px-3 py-2 text-xs text-text-muted" data-blame>
                <p class="m-0 font-mono text-text">{{ commit.commit }} <span class="font-sans text-text-muted">· {{ commit.date }}</span></p>
                @if (commit.change; as change) {
                  <a class="text-text underline-offset-2 hover:underline" [routerLink]="['/changes', change.id]" [queryParams]="{ tab: 'history' }">{{ change.title ?? change.id }}</a>
                  @if (change.task; as task) {
                    <p class="m-0"><span [attr.data-item-ref]="task.id" [attr.data-item-text]="task.title ?? ''">{{ task.id }}</span> · {{ task.title ?? '' }}</p>
                    <button type="button" class="w-fit cursor-pointer border-0 bg-transparent p-0 font-sans text-xs text-text underline underline-offset-2" [attr.aria-expanded]="open" (click)="toggle(shown.block.start)" data-show-diff>{{ open ? t()('Ocultar diff', 'Hide diff') : t()('Ver diff', 'Show diff') }}</button>
                  }
                  @if (change.criteria.length > 0) {
                    <p class="m-0 flex flex-wrap gap-1">
                      @for (criterion of change.criteria; track criterion.id) {
                        <sp-badge [attr.data-item-ref]="criterion.id" [attr.data-item-text]="criterion.text">{{ criterion.id }}</sp-badge>
                      }
                    </p>
                  }
                } @else {
                  <p class="m-0 text-text">{{ commit.subject }}</p>
                  <p class="m-0">{{ commit.author }} · {{ t()('fuera de Specty', 'outside Specty') }}</p>
                }
              </div>
              <ol class="m-0 list-none p-0 py-1 font-mono text-[13px] leading-5">
                @for (line of shown.lines; track line.number) {
                  <li class="flex gap-3 px-3" data-line>
                    <span class="w-10 shrink-0 select-none text-right text-text-muted">{{ line.number }}</span>
                    <code class="whitespace-pre text-text">@for (span of line.spans; track $index) {<span [class.italic]="span.italic === true" [style.color]="span.color ?? null">{{ span.text }}</span>}</code>
                  </li>
                }
              </ol>
              @if (open && trace.hasValue()) {
                @if (commit.change; as change) {
                  @if (change.task; as task) {
                    <sp-trace-diff class="col-span-2 border-t border-border" [change]="change.id" [task]="task.id" [path]="trace.value().path" [lines]="shown.block.origin ?? []" />
                  }
                }
              }
            </section>
          }
        </div>
      }
    }
  `,
})
export class TraceView {
  readonly change = input.required<string>();

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly highlight = inject(HIGHLIGHT);
  protected readonly t = this.preferences.t;

  constructor() {
    inject(ItemTooltips).setSource(() => this.change());
  }

  protected readonly files = resource({
    params: () => this.change(),
    loader: ({ params }) => this.source.traceFiles(params),
  });

  protected readonly fileOptions = computed((): readonly SelectOption[] =>
    (this.files.hasValue() ? this.files.value() : []).map((path) => ({ value: path, label: path })),
  );

  /** The file on screen: the first one, until the person chooses another. */
  protected readonly chosen = linkedSignal(
    () => (this.files.hasValue() ? this.files.value()[0] : undefined) ?? "",
  );

  protected readonly trace = resource({
    params: () => {
      const path = this.chosen();
      return path === "" ? undefined : { change: this.change(), path };
    },
    loader: ({ params }) => this.source.trace(params.change, params.path),
  });

  /** The traced file as one section of context lines: what the diff viewer's colors read. */
  private readonly asDiff = computed(() =>
    this.trace.hasValue() ? diffOf(this.trace.value()) : undefined,
  );

  private readonly colors = resource({
    params: () => this.asDiff(),
    loader: ({ params }) => this.highlight(params),
  });

  /** The block whose diff is open, by its first line; none when the file changes. */
  protected readonly opened = linkedSignal<string, number | undefined>({
    source: this.chosen,
    computation: () => undefined,
  });

  protected readonly blocks = computed((): readonly ShownBlock[] => {
    const file = this.asDiff();
    if (!this.trace.hasValue() || file === undefined) return [];
    const lines = file.hunks[0]?.lines ?? [];
    const colors = this.colors.hasValue() ? this.colors.value() : undefined;
    return this.trace.value().blocks.map((block) => ({
      block,
      lines: lines.slice(block.start - 1, block.end).map((line, index) => ({
        number: block.start + index,
        spans: spansOf(line, colors?.get(line)),
      })),
    }));
  });

  protected toggle(start: number): void {
    this.opened.update((open) => (open === start ? undefined : start));
  }

  /** Why there is nothing to trace: the source's reason, or a change that left no files. */
  protected readonly message = computed(() => {
    const t = this.t();
    const error = this.files.error();
    if (error !== undefined) {
      return this.reason(
        error,
        t("No se pudo leer la trazabilidad.", "The traceability could not be read."),
      );
    }
    if (this.files.hasValue() && this.files.value().length === 0) {
      return t("Este cambio no dejó archivos que trazar.", "This change left no files to trace.");
    }
    return undefined;
  });

  /** Why the chosen file could not be traced. */
  protected readonly traceFailure = computed(() => {
    const error = this.trace.error();
    if (error === undefined) return undefined;
    return this.reason(
      error,
      this.t()("No se pudo trazar el archivo.", "The file could not be traced."),
    );
  });

  private reason(error: unknown, fallback: string): string {
    return error instanceof ActionError ? error.text[this.preferences.lang()] : fallback;
  }
}
