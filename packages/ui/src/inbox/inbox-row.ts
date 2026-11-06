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
import type { Lang } from "@baquia-dev/specty-core/light";
import { KindBadge, PhaseBadge } from "../components/badge";
import { Button } from "../components/button";
import { ItemTooltips } from "../components/item-tooltip";
import { ShownText } from "../components/shown-text";
import { formatDuration } from "../data/progress";
import { type Bilingual, type DecisionKind, isWhole, type ListedChange } from "../data/records";
import { Preferences } from "../theme/preferences";
import type { EpicTally } from "./epic-lanes";

/** What each decision is called and the action that takes the person to it: rows and lines share them. */
export const DECISIONS: Readonly<
  Record<DecisionKind, { readonly label: Bilingual; readonly action: Bilingual }>
> = {
  review: {
    label: { es: "Spec por revisar", en: "Spec to review" },
    action: { es: "Revisar spec", en: "Review spec" },
  },
  tests: {
    label: { es: "Tests por aprobar", en: "Tests to approve" },
    action: { es: "Aprobar tests", en: "Approve tests" },
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
 * What goes after the decision: the revision in review, against the approved one when there is a
 * delta, or how many tests wait for approval.
 */
function detailOf(change: ListedChange, t: (es: string, en: string) => string): string {
  const delta = change.review?.delta;
  if (change.decision === "review") {
    return delta
      ? t(
          ` · revisión ${change.revision}, frente a la ${delta.approvedRevision} aprobada`,
          ` · revision ${change.revision}, against approved revision ${delta.approvedRevision}`,
        )
      : t(` · revisión ${change.revision}`, ` · revision ${change.revision}`);
  }
  const sent = change.decision === "tests" ? (change.tests?.files.length ?? 0) : 0;
  if (sent === 0) return "";
  return sent === 1
    ? t(" · 1 test nuevo", " · 1 new test")
    : t(` · ${sent} tests nuevos`, ` · ${sent} new tests`);
}

/** «2 te esperan»: `n` with its word, or nothing when there are none. */
function counted(n: number, one: string, many: string): string {
  if (n === 0) return "";
  return `${n} ${n === 1 ? one : many}`;
}

/** «C1, C2 ni C5»: the items, the last one after `word`. */
function either(items: readonly string[], word: string): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;
}

/** The milliseconds from an ISO time to `end`; none when the time cannot be read or comes later. */
function elapsed(from: string, end: number): number {
  const start = Date.parse(from);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

/** «3 nov, 14:05» in the viewer's zone, with the year only when it is not the clock's. */
function dayAndTime(iso: string, now: number, lang: Lang): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const year =
    date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" as const };
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    ...year,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * A document row; the one picked with j/k keeps the highlight the others show on hover. Its
 * scroll margin keeps it clear of the pinned search when j/k bring it into view.
 */
const ROW =
  "group -mx-3 grid scroll-mt-[calc(var(--sp-sticky-top,9rem)+0.5rem)] scroll-mb-4 grid-cols-1 items-start gap-x-4 gap-y-2 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-text/4 focus-within:bg-text/4 motion-reduce:transition-none sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]";

/**
 * One change in the Inbox: its phase, what it waits for, how long, and the way into it. A finished
 * change of a page comes by its summary: what only an open change has is missing from it.
 */
@Component({
  selector: "sp-inbox-row",
  imports: [RouterLink, PhaseBadge, KindBadge, Button, ShownText],
  hostDirectives: [ItemTooltips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    "[class]": "current() ? row + ' bg-text/4' : row",
    "[attr.data-id]": "change().id",
    "[attr.aria-current]": "current() || null",
  },
  template: `
    <!-- How long under the phase; on a phone, beside it. -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-col sm:items-start sm:gap-0.5">
      @if (tally(); as tally) {
        <!-- An epic in implementation: how many of its slices finished, with a ring. -->
        <span class="inline-flex h-6 items-center gap-1.5 rounded-md bg-text/8 px-2 text-xs font-medium whitespace-nowrap text-text" data-epic-progress>
          <svg class="size-3.5 shrink-0 -rotate-90" viewBox="0 0 16 16" aria-hidden="true" data-ring>
            <circle class="stroke-text/20" cx="8" cy="8" r="6" fill="none" stroke-width="3" />
            <circle cx="8" cy="8" r="6" fill="none" stroke-width="3" pathLength="100" stroke="var(--color-phase-done)" [attr.stroke-dasharray]="share() + ' 100'" data-arc />
          </svg>
          {{ t()(tally.done + '/' + tally.total + ' cortes', tally.done + '/' + tally.total + ' slices') }}
        </span>
      } @else {
        <sp-phase-badge [phase]="change().phase" />
      }
      <span class="text-xs whitespace-nowrap text-text-muted" data-since data-started>{{ started() }}</span>
      @if (isFinished()) {
        <span class="text-xs whitespace-nowrap text-text-muted" data-took>{{ took() }}</span>
      } @else {
        <span class="text-xs whitespace-nowrap text-text-muted" data-phase-time>{{ phaseTime() }}</span>
      }
    </div>
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a class="font-semibold text-text no-underline hover:underline" [routerLink]="['/changes', change().id]" [queryParams]="{ tab: change().tab }" (focus)="picked.emit()"><sp-text [text]="change().title" /></a>
        <sp-kind-badge [kind]="change().kind" [epic]="change().epic" />
      </div>
      @if (tally()) {
        <span class="text-[13px] text-text-muted" data-tally>{{ tallyLine() }}</span>
      } @else if (waits(); as line) {
        <span class="text-[13px] text-text-muted" data-waits>{{ line }}</span>
      }
      @if (folder(); as place) {
        <span class="font-mono text-xs break-all text-text-muted" [attr.title]="change().folder" data-folder>{{ place }}</span>
      }
      @if (tally()) {
        <!-- Nobody works on an epic in implementation: its slices say who holds them. -->
        @if (idle(); as line) {
          <span class="text-[13px]" style="color: var(--color-phase-review)" data-idle>{{ line }}</span>
        }
      } @else if (change().unattended) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-unattended>{{ t()('Nadie retoma tu decisión', 'Nobody picks up your decision') }}</span>
      } @else if (change().away; as away) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-unheld>{{ t()('Su conversación (' + away.tool + ') salió de su carpeta', 'Its conversation (' + away.tool + ') left its folder') }}</span>
      } @else if (change().orphan) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-unheld>{{ t()('Ninguna conversación lo lleva', 'No conversation holds it') }}</span>
      }
      @if (change().lost) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-lost>{{ t()('Sin carpeta', 'No folder') }}</span>
      }
      @if (change().configIssues) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-config>{{ t()('Su configuración no se pudo leer', 'Its configuration could not be read') }}</span>
      }
      @if (change().shared; as shared) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-shared>
          {{ t()('Comparte', 'Shares') }}
          @for (file of shared; track file.path; let last = $last) {
            <code class="font-mono text-xs"><sp-text [text]="file.path" /></code>@if (!last) {,&ngsp;}
          }
          {{ t()('con', 'with') }} {{ sharers() }}
        </span>
      }
      @if ((change().highImpactPending ?? 0) > 0) {
        <span class="text-[13px]" style="color: var(--color-phase-review)" data-note>{{ pending() }}</span>
      }
      @for (request of change().scopeRequests ?? []; track request.id) {
        <span class="text-[13px] text-text-muted" data-note>
          <span [attr.data-item-ref]="request.task">{{ request.task }}</span> {{ t()('pide', 'asks for') }}
          @for (path of request.paths; track path) {
            <code class="font-mono text-xs text-text"><sp-text [text]="path" /></code>
          }: «<sp-text [text]="request.reason" />»
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
  readonly change = input.required<ListedChange>();
  /** Picked with j/k: highlighted, with its action as the main one. */
  readonly current = input(false);
  /**
   * How the slices go, when the row heads the card of an epic in implementation: it takes the
   * place of its phase, what it does with its size, its folder and who holds it.
   */
  readonly tally = input<EpicTally | undefined>(undefined);
  /** The clock of the page, so "hace 3 min" moves on. */
  readonly now = input(Date.now());
  /** The person reached it with the keyboard or the pointer. */
  readonly picked = output();

  private readonly preferences = inject(Preferences);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly t = this.preferences.t;
  protected readonly row = ROW;
  protected readonly decisions = DECISIONS;

  constructor() {
    // Its items' texts come with the whole change: a summary has none to show.
    inject(ItemTooltips).setSource(() => {
      const change = this.change();
      return isWhole(change) ? change : undefined;
    });
  }

  /** What it waits for, or what it is doing, and its size. */
  protected readonly waits = computed(() => {
    const change = this.change();
    const t = this.t();
    const lang = this.preferences.lang();
    const doing =
      change.decision !== undefined
        ? DECISIONS[change.decision].label[lang] + detailOf(change, t)
        : change.phase === "draft"
          ? t("La spec se está redactando", "The spec is being written")
          : "";
    const size = change.size
      ? [change.size.level, ...change.size.reasons.map((reason) => reason[lang])].join(" · ")
      : "";
    return [doing, size].filter((part) => part !== "").join(" · ");
  });

  /** Where it lives, by the last two parts of its folder: «specty.worktrees/<id>». */
  protected readonly folder = computed(() =>
    this.tally() === undefined
      ? (this.change().folder?.split(/[\\/]/).filter(Boolean).slice(-2).join("/") ?? "")
      : "",
  );

  /** The share of an epic's slices finished, in hundredths: the arc of its ring. */
  protected readonly share = computed(() => {
    const tally = this.tally();
    return tally === undefined || tally.total === 0
      ? 0
      : Math.round((tally.done / tally.total) * 100);
  });

  /** «1 de 5 terminados · 1 te espera · 2 en marcha · 1 listo para empezar · 1 espera a otro corte». */
  protected readonly tallyLine = computed(() => {
    const tally = this.tally();
    if (tally === undefined) return "";
    const t = this.t();
    return [
      t(`${tally.done} de ${tally.total} terminados`, `${tally.done} of ${tally.total} finished`),
      counted(tally.waiting, t("te espera", "waits for you"), t("te esperan", "wait for you")),
      counted(tally.running, t("en marcha", "under way"), t("en marcha", "under way")),
      counted(
        tally.ready,
        t("listo para empezar", "ready to start"),
        t("listos para empezar", "ready to start"),
      ),
      counted(
        tally.blocked,
        t("espera a otro corte", "waits for another slice"),
        t("esperan a otro corte", "wait for another slice"),
      ),
    ]
      .filter((part) => part !== "")
      .join(" · ");
  });

  /** «Ningún corte en marcha: nadie empezó C1, C2 ni C5», when none has an open change. */
  protected readonly idle = computed(() => {
    const slices = this.tally()?.idle ?? [];
    if (slices.length === 0) return "";
    const t = this.t();
    const nobody = either(slices, t("ni", "or"));
    return t(
      `Ningún corte en marcha: nadie empezó ${nobody}`,
      `No slice under way: nobody started ${nobody}`,
    );
  });

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

  protected readonly isFinished = computed(() => {
    const phase = this.change().phase;
    return phase === "done" || phase === "cancelled";
  });

  /** Open: how long since it started, by the page clock. Finished: the day and time it started. */
  protected readonly started = computed(() => {
    const { createdAt } = this.change();
    const lang = this.preferences.lang();
    if (this.isFinished()) {
      const day = dayAndTime(createdAt, this.now(), lang);
      return this.t()(`Empezó el ${day}`, `Started ${day}`);
    }
    const since = formatDuration(elapsed(createdAt, this.now()), lang);
    return this.t()(`Empezó hace ${since}`, `Started ${since} ago`);
  });

  /** How long an open change has been in its phase, by the page clock. */
  protected readonly phaseTime = computed(() => {
    const since = formatDuration(
      elapsed(this.change().phaseSince, this.now()),
      this.preferences.lang(),
    );
    return this.t()(`En esta fase: ${since}`, `In this phase: ${since}`);
  });

  /** How long a finished change took, from its start to its closing or cancelling. */
  protected readonly took = computed(() => {
    const { createdAt, closedAt, phaseSince } = this.change();
    const took = formatDuration(
      elapsed(createdAt, Date.parse(closedAt ?? phaseSince)),
      this.preferences.lang(),
    );
    return this.t()(`Tardó ${took}`, `Took ${took}`);
  });

  /** Moves focus to the row's link, so Enter opens it, and brings the row into view. */
  focus(): void {
    this.host.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    this.host.scrollIntoView?.({ block: "nearest" });
  }

  protected open(): void {
    this.host.querySelector<HTMLAnchorElement>("a")?.click();
  }
}
