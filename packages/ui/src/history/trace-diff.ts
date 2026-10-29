// SPDX-License-Identifier: Apache-2.0
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  Injector,
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
      <sp-diff-file [file]="file" [marked]="lines()" />
    } @else {
      <sp-skeleton [lines]="4" height="12px" />
    }
  `,
})
export class TraceDiff {
  readonly change = input.required<string>();
  readonly task = input.required<string>();
  readonly path = input.required<string>();
  /** The block's lines, by their numbers in the task's commit: the diff marks them. */
  readonly lines = input<readonly number[]>([]);

  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    // Once the diff shows, its first marked line comes into view.
    effect(() => {
      if (this.file() === undefined) return;
      afterNextRender(
        () => {
          const first = this.host.nativeElement.querySelector<HTMLElement>("[data-marked]");
          // Some hosts, like jsdom, have no scrolling.
          if (typeof first?.scrollIntoView === "function")
            first.scrollIntoView({ block: "nearest" });
        },
        { injector: this.injector },
      );
    });
  }

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
