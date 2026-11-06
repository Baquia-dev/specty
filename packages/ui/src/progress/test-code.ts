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
import { ActionError, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { CodeLines } from "./code-lines";

/**
 * «Ver código» of a test of the change (docs/ui.md, Progreso): folded, it asks for nothing; open,
 * the test as the change's branch has it, in `sp-code-lines`.
 */
@Component({
  selector: "sp-test-code",
  imports: [Skeleton, CodeLines],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex min-w-0 flex-col gap-1.5" },
  template: `
    <button type="button" class="h-6 w-fit cursor-pointer border-0 bg-transparent px-0 font-sans text-[13px] text-text underline" [attr.aria-expanded]="open()" (click)="open.set(!open())" data-test-code-toggle>
      {{ open() ? t()('Ocultar código', 'Hide code') : t()('Ver código', 'Show code') }}
    </button>
    @if (open()) {
      @if (message(); as message) {
        <p class="m-0 text-[13px] text-text-muted" data-test-code-message>{{ message }}</p>
      } @else if (code.hasValue()) {
        <sp-code-lines [path]="path()" [text]="code.value()" data-test-code />
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
  protected readonly t = this.preferences.t;
  protected readonly open = signal(false);

  /** Asked each time it opens, so it shows what the branch has now; nothing while folded. */
  protected readonly code = resource({
    params: () => (this.open() ? { change: this.change(), path: this.path() } : undefined),
    loader: ({ params }) => this.source.testCode(params.change, params.path),
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
