// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { LIST, ROW, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideLayoutList } from "../components/icons";
import { Segmented, type SegmentedOption } from "../components/segmented";
import { Select, type SelectOption } from "../components/select";
import type { HistoryEntry } from "../data/history";
import type { HistoryType } from "../data/history-text";
import { Preferences } from "../theme/preferences";
import { HistoryExport } from "./history-export";
import { TraceView } from "./trace-view";

type Actor = HistoryEntry["actor"];

/** The agent tools by their id, as the agent declares them (context, not proof). */
const TOOLS: Readonly<Record<string, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  "gemini-cli": "Gemini CLI",
  windsurf: "Devin (Windsurf)",
  antigravity: "Antigravity",
};

const TYPES: readonly HistoryType[] = [
  "spec",
  "tasks",
  "verifications",
  "scope",
  "adjustments",
  "closing",
  "other",
];

const TYPE_LABELS: Readonly<Record<HistoryType, { readonly es: string; readonly en: string }>> = {
  spec: { es: "Spec", en: "Spec" },
  tasks: { es: "Tareas", en: "Tasks" },
  verifications: { es: "Verificaciones", en: "Verifications" },
  scope: { es: "Alcance", en: "Scope" },
  adjustments: { es: "Ajustes", en: "Adjustments" },
  closing: { es: "Cierre", en: "Closing" },
  other: { es: "Otros", en: "Other" },
};

/** One day of the timeline: its heading and its events, in time order. */
interface Day {
  readonly key: string;
  readonly heading: string;
  readonly events: readonly HistoryEntry[];
}

/**
 * The History tab (docs/ui.md, Historial): the change's events in time order, by day, each with its
 * time, who made it, its type, its title and its details; filtered by who and by type.
 */
@Component({
  selector: "sp-history-tab",
  imports: [SectionDivider, EmptyState, Segmented, Select, Button, Badge, HistoryExport, TraceView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-6" },
  template: `
    @if (history().length > 0 || change() !== undefined) {
      <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        @if (change() !== undefined) {
          <sp-segmented [label]="t()('Vista', 'View')" [options]="viewOptions()" [(value)]="view" />
        }
        @if (history().length > 0 && view() === 'timeline') {
          <sp-segmented [label]="t()('Quién', 'Who')" [options]="actorOptions()" [(value)]="actor" />
          <sp-select class="w-56" [label]="t()('Tipo', 'Type')" [options]="typeOptions()" [(value)]="type" />
          <p class="m-0 text-sm text-text-muted" data-summary>{{ summary() }}</p>
        }
        @if (change(); as id) {
          <sp-history-export class="ml-auto" [change]="id" />
        }
      </div>
    }
    @if (view() === 'trace' && change(); as id) {
      <sp-trace-view [change]="id" />
    } @else if (history().length === 0) {
      <sp-empty-state [heading]="t()('Aún no hay eventos', 'No events yet')" [icon]="emptyIcon">
        <p class="m-0">{{ t()('Aparecen aquí a medida que el cambio avanza.', 'They show here as the change moves on.') }}</p>
      </sp-empty-state>
    } @else {
      @if (days().length === 0) {
        <div class="flex flex-wrap items-center gap-3 text-sm text-text-muted" data-no-match>
          <p class="m-0">{{ t()('Ningún evento coincide con estos filtros.', 'No event matches these filters.') }}</p>
          <sp-button size="sm" (click)="clear()" data-clear>{{ t()('Quitar los filtros', 'Clear the filters') }}</sp-button>
        </div>
      }
      @for (day of days(); track day.key) {
        <section [attr.aria-labelledby]="'history-' + day.key" data-day>
          <sp-section-divider [heading]="day.heading" [headingId]="'history-' + day.key" [meta]="day.events.length" [level]="2" />
          <ol [class]="list + ' mt-2'">
            @for (event of day.events; track $index) {
              <li [class]="row" data-event>
                <time class="pt-0.5 font-mono text-xs text-text-muted" [attr.datetime]="event.at">{{ timeOf(event.at) }}</time>
                <div class="flex min-w-0 flex-col gap-1">
                  <p class="m-0 text-sm text-text">{{ event.title[lang()] }}</p>
                  <p class="m-0 text-xs text-text-muted">{{ actorOf(event) }}</p>
                  @for (detail of event.details; track $index) {
                    <p class="m-0 text-[13px] text-text-muted">{{ detail[lang()] }}</p>
                  }
                </div>
                <sp-badge>{{ typeOf(event.type) }}</sp-badge>
              </li>
            }
          </ol>
        </section>
      }
    }
  `,
})
export class HistoryTab {
  readonly history = input.required<readonly HistoryEntry[]>();
  /** The change's id: with it, the tab offers its export. */
  readonly change = input<string>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly emptyIcon = LucideLayoutList;
  protected readonly list = LIST;
  protected readonly row = ROW;

  /** Who and which type to show: «all», or one of them. */
  protected readonly actor = signal<string>("all");
  protected readonly type = signal<string>("all");

  /** The timeline, or the traceability of the change's files. */
  protected readonly view = signal<string>("timeline");
  protected readonly viewOptions = computed((): readonly SegmentedOption[] => {
    const t = this.t();
    return [
      { value: "timeline", label: t("Línea de tiempo", "Timeline") },
      { value: "trace", label: t("Trazabilidad", "Traceability") },
    ];
  });

  protected readonly actorOptions = computed((): readonly SegmentedOption[] => {
    const t = this.t();
    return [
      { value: "all", label: t("Todos", "All") },
      { value: "human", label: t("Persona", "Person") },
      { value: "agent", label: t("Agente", "Agent") },
      { value: "specty", label: "Specty" },
    ];
  });

  protected readonly typeOptions = computed((): readonly SelectOption[] => [
    { value: "all", label: this.t()("Todos los tipos", "All types") },
    ...TYPES.map((type) => ({ value: type, label: this.typeOf(type) })),
  ]);

  private readonly shown = computed(() =>
    this.history().filter(
      (event) =>
        (this.actor() === "all" || event.actor === this.actor()) &&
        (this.type() === "all" || event.type === this.type()),
    ),
  );

  protected readonly days = computed((): readonly Day[] => {
    const days: { key: string; heading: string; events: HistoryEntry[] }[] = [];
    for (const event of this.shown()) {
      const key = dayKey(event.at);
      const last = days[days.length - 1];
      if (last?.key === key) last.events.push(event);
      else days.push({ key, heading: this.dayOf(event.at), events: [event] });
    }
    return days;
  });

  /** «5 eventos», or «2 de 5 eventos» with a filter on. */
  protected readonly summary = computed(() => {
    const total = this.history().length;
    const shown = this.shown().length;
    const t = this.t();
    const events = t(total === 1 ? "evento" : "eventos", total === 1 ? "event" : "events");
    return shown === total
      ? `${total} ${events}`
      : t(`${shown} de ${total} ${events}`, `${shown} of ${total} ${events}`);
  });

  protected clear(): void {
    this.actor.set("all");
    this.type.set("all");
  }

  protected actorOf(event: HistoryEntry): string {
    return actorLabel(event.actor, event.tool, this.t());
  }

  protected typeOf(type: HistoryType): string {
    return TYPE_LABELS[type][this.lang()];
  }

  protected timeOf(at: string): string {
    return new Intl.DateTimeFormat(this.lang(), { hour: "2-digit", minute: "2-digit" }).format(
      new Date(at),
    );
  }

  private dayOf(at: string): string {
    return new Intl.DateTimeFormat(this.lang(), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(at));
  }
}

/** The day of a time in the viewer's zone, as `YYYY-MM-DD`. */
function dayKey(at: string): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function actorLabel(
  actor: Actor,
  tool: string | undefined,
  t: (es: string, en: string) => string,
): string {
  switch (actor) {
    case "human":
      return t("Persona", "Person");
    case "specty":
      return "Specty";
    case "agent": {
      const agent = t("Agente", "Agent");
      return tool === undefined ? agent : `${agent} · ${TOOLS[tool] ?? tool}`;
    }
  }
}
