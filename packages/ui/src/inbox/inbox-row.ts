// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { PhaseBadge } from "../components/badge";
import { Button } from "../components/button";
import { type Bilingual, type ChangeView, type DecisionKind, relativeTime } from "../data/records";
import { Preferences } from "../theme/preferences";

const DECISIONS: Readonly<
  Record<DecisionKind, { readonly label: Bilingual; readonly action: Bilingual }>
> = {
  review: {
    label: { es: "Spec por revisar", en: "Spec to review" },
    action: { es: "Revisar spec", en: "Review spec" },
  },
  scope: {
    label: { es: "Solicitud de alcance", en: "Scope request" },
    action: { es: "Decidir alcance", en: "Decide scope" },
  },
  acceptance: {
    label: { es: "Resultado por aceptar", en: "Result to accept" },
    action: { es: "Revisar resultado", en: "Review result" },
  },
  closing: {
    label: { es: "Cierre por confirmar", en: "Closing to confirm" },
    action: { es: "Revisar cierre", en: "Review closing" },
  },
};

/**
 * A document row; the one picked with j/k keeps the highlight the others show on hover. Its
 * scroll margin keeps it clear of the pinned search when j/k bring it into view.
 */
const ROW =
  "group -mx-3 grid scroll-mt-[calc(var(--sp-sticky-top,9rem)+0.5rem)] scroll-mb-4 grid-cols-1 items-start gap-x-4 gap-y-2 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-text/4 focus-within:bg-text/4 motion-reduce:transition-none sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]";

/** One change in the Inbox: its phase, what it waits for, how long, and the way into it. */
@Component({
  selector: "sp-inbox-row",
  imports: [RouterLink, PhaseBadge, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    "[class]": "current() ? row + ' bg-text/4' : row",
    "[attr.data-id]": "change().id",
    "[attr.aria-current]": "current() || null",
  },
  template: `
    <!-- How long under the phase; on a phone, beside it. -->
    <div class="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
      <sp-phase-badge [phase]="change().phase" />
      <span class="text-xs whitespace-nowrap text-text-muted" data-since>{{ since() }}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-0.5">
      <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', change().id]" [queryParams]="{ tab: change().tab }" (focus)="picked.emit()">{{ change().title }}</a>
      @if (waits(); as line) {
        <span class="text-[13px] text-text-muted" data-waits>{{ line }}</span>
      }
      @if (folder(); as place) {
        <span class="font-mono text-xs break-all text-text-muted" [attr.title]="change().folder" data-folder>{{ place }}</span>
      }
      @if (change().shared; as shared) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-shared>
          {{ t()('Comparte', 'Shares') }}
          @for (file of shared; track file.path; let last = $last) {
            <code class="font-mono text-xs">{{ file.path }}</code>@if (!last) {,&ngsp;}
          }
          {{ t()('con', 'with') }} {{ sharers() }}
        </span>
      }
      @if (change().highImpactPending > 0) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-note>{{ pending() }}</span>
      }
      @for (request of change().scopeRequests; track request.id) {
        <span class="text-[13px] text-text-muted" data-note>
          {{ request.task }} {{ t()('pide', 'asks for') }}
          @for (path of request.paths; track path) {
            <code class="font-mono text-xs text-text">{{ path }}</code>
          }: «{{ request.reason }}»
        </span>
      }
      @if (progress(); as share) {
        <span class="mt-1 flex items-center gap-2 text-xs text-text-muted" data-progress>
          <span class="h-1 w-28 overflow-hidden rounded-full bg-text/10" aria-hidden="true">
            <span class="block h-1 rounded-full" [style.width.%]="share.percent" [style.background]="'var(--color-phase-' + change().phase + ')'"></span>
          </span>
          {{ share.label }}
        </span>
      }
    </div>
    @if (change().decision; as decision) {
      <div class="flex sm:self-center sm:justify-self-end">
        <sp-button size="sm" [variant]="current() ? 'primary' : 'secondary'" (pressed)="open()">
          {{ t()(decisions[decision].action.es, decisions[decision].action.en) }}
        </sp-button>
      </div>
    }
  `,
})
export class InboxRow {
  readonly change = input.required<ChangeView>();
  /** Picked with j/k: highlighted, with its action as the main one. */
  readonly current = input(false);
  /** The clock of the page, so "hace 3 min" moves on. */
  readonly now = input(Date.now());
  /** The person reached it with the keyboard or the pointer. */
  readonly picked = output();

  private readonly preferences = inject(Preferences);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly t = this.preferences.t;
  protected readonly row = ROW;
  protected readonly decisions = DECISIONS;

  /** What it waits for, or what it is doing, and its size. */
  protected readonly waits = computed(() => {
    const change = this.change();
    const t = this.t();
    const lang = this.preferences.lang();
    const delta = change.review.delta;
    const doing =
      change.decision !== undefined
        ? DECISIONS[change.decision].label[lang] +
          (change.decision === "review"
            ? delta
              ? t(
                  ` · revisión ${change.revision}, frente a la ${delta.approvedRevision} aprobada`,
                  ` · revision ${change.revision}, against approved revision ${delta.approvedRevision}`,
                )
              : t(` · revisión ${change.revision}`, ` · revision ${change.revision}`)
            : "")
        : change.phase === "draft"
          ? t("La spec se está redactando", "The spec is being written")
          : "";
    const size = change.size
      ? [change.size.level, ...change.size.reasons.map((reason) => reason[lang])].join(" · ")
      : "";
    return [doing, size].filter((part) => part !== "").join(" · ");
  });

  /** Where it lives, by the last two parts of its folder: «specty.worktrees/<id>». */
  protected readonly folder = computed(
    () => this.change().folder?.split(/[\\/]/).filter(Boolean).slice(-2).join("/") ?? "",
  );

  /** The other open changes that list the same files, by title. */
  protected readonly sharers = computed(() => {
    const titles = (this.change().shared ?? []).flatMap((file) => file.changes.map((c) => c.title));
    return [...new Set(titles)].map((title) => `«${title}»`).join(", ");
  });

  protected readonly pending = computed(() => {
    const count = this.change().highImpactPending;
    return count === 1
      ? this.t()("1 supuesto de alto impacto por confirmar", "1 high-impact assumption to confirm")
      : this.t()(
          `${count} supuestos de alto impacto por confirmar`,
          `${count} high-impact assumptions to confirm`,
        );
  });

  /** Work in progress shows how far its tasks are. */
  protected readonly progress = computed(() => {
    const { phase, tasks } = this.change();
    if ((phase !== "implementing" && phase !== "adjusting") || tasks.total === 0) return undefined;
    return {
      percent: Math.round((tasks.done / tasks.total) * 100),
      label: this.t()(
        `${tasks.done} de ${tasks.total} tareas`,
        `${tasks.done} of ${tasks.total} tasks`,
      ),
    };
  });

  protected readonly since = computed(() =>
    relativeTime(this.change().phaseSince, this.now(), this.preferences.lang()),
  );

  /** Moves focus to the row's link, so Enter opens it, and brings the row into view. */
  focus(): void {
    this.host.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    this.host.scrollIntoView?.({ block: "nearest" });
  }

  protected open(): void {
    this.host.querySelector<HTMLAnchorElement>("a")?.click();
  }
}
