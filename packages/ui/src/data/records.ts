// SPDX-License-Identifier: Apache-2.0
// The data contract of the UI. Only types come from core here: deriving views needs core's parser
// (and zod and yaml), which run in a web worker or a chunk loaded on demand, never in the first load.
import type {
  ChangeKind,
  ChangeState,
  EffortLevel,
  Lang,
  Phase,
  SizeLevel,
} from "@baquia-dev/specty-core";

/** What a data source gives for each change: the files as they are, and when its phase began. */
export interface ChangeRecord {
  readonly spec: string;
  readonly state: ChangeState;
  /** ISO time when the change entered its current phase. */
  readonly phaseSince: string;
}

/**
 * Any data source the UI can run on: fetch + SSE from the local server, `postMessage` in an
 * editor webview, fixtures in the prototype. Screens depend only on this.
 */
export abstract class SpectyData {
  abstract changes(): Promise<readonly ChangeRecord[]>;
  /** Calls `listener` whenever the data may have changed; returns how to stop. */
  abstract subscribe(listener: () => void): () => void;
}

export type Bilingual = Readonly<Record<Lang, string>>;

/** What a change waits for from the person, if anything. */
export type DecisionKind = "review" | "scope" | "acceptance" | "closing";

export type ChangeTab = "spec" | "progress" | "acceptance" | "history";

export interface ScopeRequestView {
  readonly id: string;
  readonly task: string;
  readonly paths: readonly string[];
  readonly reason: string;
}

/** A change as the screens show it. Plain data: it crosses from the worker by structured clone. */
export interface ChangeView {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly revision: number;
  readonly branch?: string;
  readonly phaseSince: string;
  readonly goal: string;
  readonly size?: { readonly level: SizeLevel; readonly reasons: readonly Bilingual[] };
  readonly effort?: { readonly plan: EffortLevel; readonly implement: EffortLevel };
  readonly decision?: DecisionKind;
  /** High-impact assumptions still undecided: approving waits for them. */
  readonly highImpactPending: number;
  readonly scopeRequests: readonly ScopeRequestView[];
  readonly tasks: { readonly done: number; readonly total: number };
  /** The tab a change opens on, by phase. */
  readonly tab: ChangeTab;
  /** Why the record could not be read in full (invalid state or spec errors). */
  readonly problems: readonly string[];
}

/** Messages to and from the derivation worker. */
export interface DeriveRequest {
  readonly id: number;
  readonly records: readonly ChangeRecord[];
}

export interface DeriveResponse {
  readonly id: number;
  readonly views: readonly ChangeView[];
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "hace 12 min" / "12 min ago"; "ahora" under a minute. */
export function relativeTime(iso: string, now: number, lang: Lang): string {
  const elapsed = now - Date.parse(iso);
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return format.format(-Math.round(elapsed / size), unit);
  }
  return format.format(0, "minute");
}
