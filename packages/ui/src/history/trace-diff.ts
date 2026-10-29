// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { DiffFileView } from "../components/diff-file";
import { Skeleton } from "../components/skeleton";
import { parseDiff } from "../data/diff";
import { ActionError, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";

/**
 * The diff of a traced file in the task that wrote a block (docs/ui.md, Historial): the task's
 * diff, from the source, down to that file, in the diff viewer's file view.
 */
@Component({
  selector: "sp-trace-diff",
  imports: [DiffFileView, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    @if (message(); as message) {
      <p class="m-0 px-3 py-2 text-sm text-text-muted" data-trace-diff-message>{{ message }}</p>
    } @else if (file(); as file) {
      <sp-diff-file [file]="file" />
    } @else {
      <sp-skeleton [lines]="4" height="12px" />
    }
  `,
})
export class TraceDiff {
  readonly change = input.required<string>();
  readonly task = input.required<string>();
  readonly path = input.required<string>();

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);

  private readonly diff = resource({
    params: () => ({ change: this.change(), task: this.task() }),
    loader: ({ params }) => this.source.diff(params.change, params.task),
  });

  protected readonly file = computed(() =>
    this.diff.hasValue()
      ? parseDiff(this.diff.value()).find((file) => file.path === this.path())
      : undefined,
  );

  /** Why there is no diff to show: the source's reason, or a task that left the file alone. */
  protected readonly message = computed(() => {
    const t = this.preferences.t();
    const error = this.diff.error();
    if (error !== undefined) {
      return error instanceof ActionError
        ? error.text[this.preferences.lang()]
        : t("No se pudo leer el diff.", "The diff could not be read.");
    }
    if (this.diff.hasValue() && this.file() === undefined) {
      return t("Esta tarea no cambió este archivo.", "This task did not change this file.");
    }
    return undefined;
  });
}
