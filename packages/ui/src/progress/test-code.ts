// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from "@angular/core";
import { Skeleton } from "../components/skeleton";
import type { DiffFile, DiffLine } from "../data/diff";
import { ActionError, SpectyData } from "../data/records";
import { HIGHLIGHT, spansOf } from "../highlight/highlight";
import { Preferences } from "../theme/preferences";

/** A test's lines as context lines of one section, numbered as in the file: what the colors read. */
function asFile(path: string, text: string): DiffFile {
  const rows = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  const lines = (text === "" ? [] : rows).map(
    (line, index): DiffLine => ({
      kind: "context",
      text: line,
      oldNumber: index + 1,
      newNumber: index + 1,
    }),
  );
  const count = lines.length;
  const hunk = { oldStart: 1, oldLines: count, newStart: 1, newLines: count, section: "", lines };
  return { path, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [hunk] };
}

/**
 * «Ver código» of a test of the change (docs/ui.md, Progreso): folded, it asks for nothing; open,
 * the test as the change's branch has it, each line with its number and the diff viewer's colors.
 */
@Component({
  selector: "sp-test-code",
  imports: [Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex min-w-0 flex-col gap-1.5" },
  template: `
    <button type="button" class="h-6 w-fit cursor-pointer border-0 bg-transparent px-0 font-sans text-[13px] text-text underline" [attr.aria-expanded]="open()" (click)="open.set(!open())" data-test-code-toggle>
      {{ open() ? t()('Ocultar código', 'Hide code') : t()('Ver código', 'Show code') }}
    </button>
    @if (open()) {
      @if (message(); as message) {
        <p class="m-0 text-[13px] text-text-muted" data-test-code-message>{{ message }}</p>
      } @else if (file()) {
        <ol class="m-0 list-none overflow-x-auto rounded-lg border border-border bg-surface p-0 py-1 font-mono text-xs leading-5 [tab-size:4]" [attr.aria-label]="path()" data-test-code>
          @for (line of lines(); track line.number) {
            <li class="flex gap-3 px-3" data-line>
              <span class="w-8 shrink-0 select-none text-right text-text-muted" aria-hidden="true" data-number>{{ line.number }}</span>
              <code class="whitespace-pre text-text" data-code>@for (span of line.spans; track $index) {<span [class.italic]="span.italic === true" [style.color]="span.color ?? null">{{ span.text }}</span>}</code>
            </li>
          }
        </ol>
      } @else {
        <sp-skeleton [lines]="4" height="12px" />
      }
    }
  `,
})
export class TestCode {
  readonly change = input.required<string>();
  readonly path = input.required<string>();

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly highlight = inject(HIGHLIGHT);
  protected readonly t = this.preferences.t;
  protected readonly open = signal(false);

  /** Asked each time it opens, so it shows what the branch has now; nothing while folded. */
  private readonly code = resource({
    params: () => (this.open() ? { change: this.change(), path: this.path() } : undefined),
    loader: ({ params }) => this.source.testCode(params.change, params.path),
  });

  protected readonly file = computed(() =>
    this.code.hasValue() ? asFile(this.path(), this.code.value()) : undefined,
  );

  private readonly colors = resource({
    params: () => this.file(),
    loader: ({ params }) => this.highlight(params),
  });

  protected readonly lines = computed(() => {
    const colors = this.colors.hasValue() ? this.colors.value() : undefined;
    return (this.file()?.hunks[0]?.lines ?? []).map((line, index) => ({
      number: index + 1,
      spans: spansOf(line, colors?.get(line)),
    }));
  });

  /** Why the code does not show: the source's reason, in the page's language. */
  protected readonly message = computed(() => {
    const error = this.code.error();
    if (error === undefined) return undefined;
    return error instanceof ActionError
      ? error.text[this.preferences.lang()]
      : this.t()("No se pudo leer el código de este test.", "This test's code could not be read.");
  });
}
