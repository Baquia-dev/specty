// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { contextFile } from "../data/diff";
import { HIGHLIGHT, spansOf } from "../highlight/highlight";

/** The lines of a text: none when it is empty, and no empty one for the newline that ends it. */
function linesOf(text: string): readonly string[] {
  if (text === "") return [];
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

/**
 * Lines of code of a file, whole or a stretch of it, each with its number in the file and the
 * diff viewer's colors, without green or red: a test in «Ver código», or a piece of an unlock's
 * evidence.
 */
@Component({
  selector: "sp-code-lines",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <ol class="m-0 list-none overflow-x-auto rounded-lg border border-border bg-surface p-0 py-1 font-mono text-xs leading-5 [tab-size:4]" [attr.aria-label]="path()">
      @for (line of lines(); track line.number) {
        <li class="flex gap-3 px-3" data-line>
          <span class="w-8 shrink-0 select-none text-right text-text-muted" aria-hidden="true" data-number>{{ line.number }}</span>
          <code class="whitespace-pre text-text" data-code>@for (span of line.spans; track $index) {<span [class.italic]="span.italic === true" [style.color]="span.color ?? null">{{ span.text }}</span>}</code>
        </li>
      }
    </ol>
  `,
})
export class CodeLines {
  readonly path = input.required<string>();
  readonly text = input.required<string>();
  /** The number of its first line in the file. */
  readonly start = input(1);

  private readonly highlight = inject(HIGHLIGHT);

  /** The lines as context lines of one section, numbered from `start`: what the colors read. */
  private readonly file = computed(() =>
    contextFile(this.path(), linesOf(this.text()), this.start()),
  );

  private readonly colors = resource({
    params: () => this.file(),
    loader: ({ params }) => this.highlight(params),
  });

  protected readonly lines = computed(() => {
    const colors = this.colors.hasValue() ? this.colors.value() : undefined;
    return (this.file().hunks[0]?.lines ?? []).map((line, index) => ({
      number: this.start() + index,
      spans: spansOf(line, colors?.get(line)),
    }));
  });
}
