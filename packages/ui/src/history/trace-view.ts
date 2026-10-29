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
import { Select, type SelectOption } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { ActionError, SpectyData } from "../data/records";
import type { TraceBlock } from "../data/trace";
import { Preferences } from "../theme/preferences";

/** A block with its lines, each with its number in the file. */
interface ShownBlock {
  readonly block: TraceBlock;
  readonly lines: readonly { readonly number: number; readonly text: string }[];
}

/**
 * The «Trazabilidad» view of the History tab (docs/ui.md, Historial): the files the change left
 * and, of the chosen one, its lines with a blame margin. Each block says which commit it comes
 * from and, when Specty made it, its change, its task and the criteria it covers.
 */
@Component({
  selector: "sp-trace-view",
  imports: [Select, Skeleton, Badge, RouterLink],
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
              <div class="flex flex-col gap-1 border-r border-border bg-surface px-3 py-2 text-xs text-text-muted" data-blame>
                @let commit = shown.block.commit;
                <p class="m-0 font-mono text-text">{{ commit.commit }} <span class="font-sans text-text-muted">· {{ commit.date }}</span></p>
                @if (commit.change; as change) {
                  <a class="text-text underline-offset-2 hover:underline" [routerLink]="['/changes', change.id]" [queryParams]="{ tab: 'history' }">{{ change.title ?? change.id }}</a>
                  @if (change.task; as task) {
                    <p class="m-0">{{ task.id }} · {{ task.title ?? '' }}</p>
                  }
                  @if (change.criteria.length > 0) {
                    <p class="m-0 flex flex-wrap gap-1">
                      @for (criterion of change.criteria; track criterion.id) {
                        <sp-badge [attr.title]="criterion.text">{{ criterion.id }}</sp-badge>
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
                    <code class="whitespace-pre text-text">{{ line.text }}</code>
                  </li>
                }
              </ol>
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
  protected readonly t = this.preferences.t;

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

  protected readonly blocks = computed((): readonly ShownBlock[] => {
    if (!this.trace.hasValue()) return [];
    const { lines, blocks } = this.trace.value();
    return blocks.map((block) => ({
      block,
      lines: lines
        .slice(block.start - 1, block.end)
        .map((text, index) => ({ number: block.start + index, text })),
    }));
  });

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
