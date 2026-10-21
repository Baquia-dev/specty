// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { ItemPrefix } from "../ids";
import type { ResolvedConfig } from "../schema/config";
import type { RepoSignals } from "../sizing/size";
import { type Diagnostic, type DiagnosticInput, diagnostic } from "../spec/diagnostics";
import type { SectionKey, Spec, SpecLocations } from "../spec/model";

/** Phases in which `propose` is allowed, and therefore validation runs. */
export type ProposePhase = "draft" | "review" | "adjusting" | "closing";

export interface ValidationContext {
  readonly phase: ProposePhase;
  readonly config: ResolvedConfig;
  readonly locations?: SpecLocations;
  /** Last approved revision; required to validate adjustments and closings. */
  readonly approved?: Spec;
  /** Last proposed revision; with `maxIds`, detects reused ids. */
  readonly previous?: Spec;
  readonly doneTasks?: ReadonlySet<string>;
  readonly maxIds?: Readonly<Partial<Record<ItemPrefix, number>>>;
  readonly repo?: RepoSignals;
}

export type Rule = (spec: Spec, ctx: ValidationContext, lang: Lang) => readonly Diagnostic[];

export function report(lang: Lang, input: DiagnosticInput): Diagnostic {
  return diagnostic(lang, input);
}

export function itemLine(ctx: ValidationContext, id: string): number | undefined {
  return ctx.locations?.items[id];
}

export function sectionLine(ctx: ValidationContext, key: SectionKey): number | undefined {
  return ctx.locations?.sections[key];
}

export function fileLine(ctx: ValidationContext, path: string): number | undefined {
  return ctx.locations?.files[path];
}
