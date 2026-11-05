// SPDX-License-Identifier: Apache-2.0

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { SessionView } from "@baquia-dev/specty-core/light";
import { LIST, PAGE, ROW } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { Skeleton } from "../components/skeleton";
import { ActionError, SpectyData } from "../data/records";
import { ago } from "../memory/memory-lines";
import { Preferences } from "../theme/preferences";

/**
 * The sessions page of `specty ui` (ADR 0016): each agent conversation in the repository, newest
 * first, with the change or folder of its last step, when it started and last stepped, whether it
 * still works and what it spent, read again with every event the data source hears.
 */
@Component({
  selector: "sp-sessions-page",
  imports: [RouterLink, EmptyState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page + ' flex flex-col gap-8 pt-10 pb-16'">
      <header class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Sesiones', 'Sessions') }}</h1>
        @if (summary(); as line) {
          <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
        }
      </header>
      @if (read.error(); as error) {
        <div role="alert" class="rounded-xl border border-border bg-surface p-4 text-sm">
          {{ t()('No se pudieron leer las sesiones', 'Could not read the sessions') }}: {{ message(error) }}
        </div>
      } @else if (!read.hasValue()) {
        <sp-skeleton height="4.5rem" />
      } @else if (sessions().length === 0) {
        <sp-empty-state [heading]="t()('Ninguna sesión de agente ha trabajado en este repositorio.', 'No agent session has worked in this repository.')">
          {{ t()('Specty anota cada sesión con el guard de su agente.', "Specty notes each session with its agent's guard.") }}
        </sp-empty-state>
      } @else {
        <div role="list" [class]="list">
          @for (session of sessions(); track session.tool + session.conversation) {
            <div role="listitem" [class]="row" [attr.data-session]="session.conversation">
              <span></span>
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="font-semibold text-text">{{ session.tool }}</span>
                  @if (session.change; as change) {
                    <a class="font-mono text-xs text-text no-underline hover:underline" [routerLink]="['/changes', change]">{{ change }}</a>
                  } @else {
                    <span class="font-mono text-xs break-all text-text-muted">{{ session.folder === '' ? t()('carpeta principal', 'main folder') : session.folder }}</span>
                  }
                  @if (session.live) {
                    <span class="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium" style="color: var(--color-phase-done); background: var(--color-phase-done-bg)">{{ t()('viva', 'live') }}</span>
                  }
                </span>
                <span class="text-xs text-text-muted">{{ line(session) }}</span>
              </div>
              <span class="text-xs text-text-muted tabular-nums">{{ spent(session) }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class SessionsPage {
  private readonly data = inject(SpectyData);
  private readonly preferences = inject(Preferences);

  protected readonly t = this.preferences.t;
  protected readonly read = resource({ loader: () => this.data.sessions() });
  protected readonly page = PAGE;
  protected readonly list = LIST;
  protected readonly row = ROW;

  protected readonly sessions = computed(
    () => (this.read.hasValue() ? this.read.value() : []) ?? [],
  );

  protected readonly summary = computed(() => {
    if (!this.read.hasValue()) return undefined;
    const all = this.sessions();
    const live = all.filter((session) => session.live).length;
    return this.t()(
      `${all.length} ${all.length === 1 ? "sesión" : "sesiones"} · ${live} ${live === 1 ? "viva" : "vivas"}`,
      `${all.length} ${all.length === 1 ? "session" : "sessions"} · ${live} live`,
    );
  });

  constructor() {
    const stop = this.data.subscribe(() => this.read.reload());
    inject(DestroyRef).onDestroy(stop);
  }

  /** Under a session: when it started, its last step, or that it has not stepped lately. */
  protected line(session: SessionView): string {
    const t = this.t();
    const now = Date.now();
    const minutes = (at: string) => Math.max(0, (now - Date.parse(at)) / 60_000);
    return [
      t(`empezó ${ago(minutes(session.first), t)}`, `started ${ago(minutes(session.first), t)}`),
      t(
        `último paso ${ago(minutes(session.last), t)}`,
        `last step ${ago(minutes(session.last), t)}`,
      ),
      ...(session.live ? [] : [t("sin actividad reciente", "no recent activity")]),
    ].join(" · ");
  }

  /** What the session spent, in tokens and US dollars in the page's language; nothing unknown. */
  protected spent(session: SessionView): string {
    const { usage } = session;
    if (usage === undefined) return "";
    const lang = this.preferences.lang();
    const tokens = new Intl.NumberFormat(lang, { notation: "compact" }).format(usage.tokens);
    const cost = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(
      usage.cost,
    );
    return `${tokens} tokens · ${cost}`;
  }

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }
}
