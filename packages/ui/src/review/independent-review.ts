// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { SectionDivider } from "../components/document";
import { LucideBot } from "../components/icons";
import { type ReviewRecord, relativeTime } from "../data/records";
import { Preferences } from "../theme/preferences";

/**
 * An independent review (ADR 0011, `specty review`): what another model said about the spec or
 * the result. Information for the person, who still decides; its text goes as it came, as plain
 * text, never as markup.
 */
@Component({
  selector: "sp-independent-review",
  imports: [LucideDynamicIcon, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="independent-review" data-review>
      <sp-section-divider [heading]="heading()" headingId="independent-review" [level]="2" />
      <p class="m-0 mt-2 text-sm text-text-muted">
        {{ t()('Lo que dijo otro modelo, con specty review. Es información: decides tú.', 'What another model said, with specty review. It is information: you decide.') }}
      </p>
      <p class="m-0 mt-3 flex items-center gap-1.5 text-xs text-text-muted" data-review-meta>
        <svg [lucideIcon]="icon" size="13" aria-hidden="true"></svg>{{ meta() }}
      </p>
      <div class="mt-2 border-l-2 border-border pl-4 text-sm whitespace-pre-line" data-review-text>{{ review().text }}</div>
    </section>
  `,
})
export class IndependentReview {
  readonly review = input.required<ReviewRecord>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly icon = LucideBot;

  protected readonly heading = computed(() =>
    this.review().target === "spec"
      ? this.t()("Revisión independiente de la spec", "Independent review of the spec")
      : this.t()("Revisión independiente del resultado", "Independent review of the result"),
  );

  /** «Revisión 2 · hace 3 h». */
  protected readonly meta = computed(() => {
    const { revision, at } = this.review();
    const when = relativeTime(at, Date.now(), this.preferences.lang());
    return this.t()(`Revisión ${revision} · ${when}`, `Revision ${revision} · ${when}`);
  });
}
