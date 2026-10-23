// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { LucideDynamicIcon, LucidePencilLine } from "@lucide/angular";
import { SectionDivider } from "../components/document";
import type { ClosingParts } from "../data/closing";
import type { Bilingual, ChangeView } from "../data/records";
import { Markdown } from "../review/markdown";
import { Preferences } from "../theme/preferences";

/** The parts in the order the agent writes them; what fits none goes last, with no title. */
const PARTS: readonly { readonly key: keyof ClosingParts; readonly title?: Bilingual }[] = [
  { key: "summary", title: { es: "Resumen", en: "Summary" } },
  { key: "deviations", title: { es: "Desviaciones", en: "Deviations" } },
  { key: "decisions", title: { es: "Decisiones", en: "Decisions" } },
  { key: "pending", title: { es: "Pendientes", en: "Follow-ups" } },
  { key: "other" },
];

/**
 * The closing of a change (docs/ui.md, Cierre): what the agent wrote at the end, part by part,
 * for the person to confirm; while the agent writes it, it says so. Once done, it stays to read.
 */
@Component({
  selector: "sp-closing-view",
  imports: [SectionDivider, Markdown, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <section aria-labelledby="acceptance-closing">
      <sp-section-divider [heading]="t()('Cierre', 'Closing')" headingId="acceptance-closing" [meta]="state()" [level]="2" />
      @if (writing()) {
        <p class="m-0 mt-3 flex items-start gap-2 pl-6 text-sm text-text-muted" data-writing>
          <svg class="mt-0.5 shrink-0" [lucideIcon]="pencil" size="14" aria-hidden="true"></svg>
          {{ t()('El agente redacta el cierre: resumen, desviaciones, decisiones y pendientes. Aparecerá aquí para que lo confirmes.', 'The agent is writing the closing: summary, deviations, decisions and follow-ups. It will show here for you to confirm.') }}
        </p>
      } @else {
        <div class="mt-3 flex flex-col gap-5 pl-6">
          @for (part of parts(); track part.key) {
            <div class="flex flex-col gap-1" [attr.data-part]="part.key">
              @if (part.title; as title) {
                <h3 class="m-0 text-sm font-semibold text-text">{{ title }}</h3>
              }
              <sp-markdown [text]="part.text" />
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class ClosingView {
  readonly change = input.required<ChangeView>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly pencil = LucidePencilLine;

  /** In closing, until the agent sends it: nothing to read yet. */
  protected readonly writing = computed(
    () => this.change().phase === "closing" && this.change().decision !== "closing",
  );

  /** «en redacción», «por confirmar» or, once done, «confirmado». */
  protected readonly state = computed(() => {
    if (this.writing()) return this.t()("en redacción", "being written");
    return this.change().phase === "done"
      ? this.t()("confirmado", "confirmed")
      : this.t()("por confirmar", "to confirm");
  });

  /** The parts with text, titled in the current language. */
  protected readonly parts = computed(() => {
    const closing = this.change().closing;
    if (closing === undefined) return [];
    const lang = this.preferences.lang();
    return PARTS.filter(({ key }) => closing[key] !== "").map(({ key, title }) => ({
      key,
      text: closing[key],
      ...(title === undefined ? {} : { title: title[lang] }),
    }));
  });
}
