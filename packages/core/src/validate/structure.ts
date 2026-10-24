// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import { fold } from "../i18n";
import { collectSignals } from "../sizing/size";
import { SECTION_ORDER, type SectionKey, type Spec } from "../spec/model";
import { KIND_RULES, SECTION_TITLES } from "../spec/vocabulary";
import { type Rule, report, sectionLine } from "./context";
import { formatQuickProblem, type QuickProblem } from "./limits";

/** Required, allowed and non-empty sections for the kind and phase. */
export const checkSections: Rule = (spec, ctx, lang) => {
  const { kind } = spec.frontmatter;
  const rules = KIND_RULES[kind];
  const closing = ctx.phase === "closing";
  const required = [
    ...rules.required,
    ...(closing && rules.closingRequired ? ["closing" as const] : []),
  ];
  const allowed = new Set<SectionKey>([
    ...required,
    ...rules.optional,
    ...(closing ? ["closing" as const] : []),
  ]);
  const present = SECTION_ORDER.filter((key) => spec.sections[key] !== undefined);
  const name = (key: SectionKey): string => SECTION_TITLES[lang][key];
  const missing = required
    .filter((key) => spec.sections[key] === undefined)
    .map((key) =>
      report(lang, {
        code: "section-required",
        params: { section: name(key), kind },
        target: `section:${key}`,
      }),
    );
  const extra = present
    .filter((key) => !allowed.has(key))
    .map((key) =>
      key === "closing"
        ? report(lang, {
            code: "closing-premature",
            line: sectionLine(ctx, key),
            target: "section:closing",
          })
        : report(lang, {
            code: "section-not-allowed",
            params: { section: name(key), kind },
            line: sectionLine(ctx, key),
            target: `section:${key}`,
          }),
    );
  const empty = present
    .filter((key) => allowed.has(key) && isEmpty(spec, key))
    .map((key) =>
      report(lang, {
        code: "section-empty",
        params: { section: name(key), optional: rules.optional.includes(key) ? "yes" : "no" },
        line: sectionLine(ctx, key),
        target: `section:${key}`,
      }),
    );
  return [...missing, ...extra, ...empty];
};

/** A spike closes with its findings and decision. */
export const checkSpikeClosing: Rule = (spec, ctx, lang) => {
  const closing = spec.sections.closing;
  if (spec.frontmatter.kind !== "spike" || ctx.phase !== "closing" || closing === undefined)
    return [];
  const headings = closing
    .split("\n")
    .filter((line) => line.startsWith("### "))
    .map((line) => fold(line.slice(4)));
  const findings = headings.some((heading) => heading === "hallazgos" || heading === "findings");
  const decision = headings.some((heading) => heading === "decision");
  return findings && decision
    ? []
    : [
        report(lang, {
          code: "closing-incomplete",
          line: sectionLine(ctx, "closing"),
          target: "section:closing",
        }),
      ];
};

/** The quick lane: one task, few code files, no sensitive paths. */
export const checkQuickLane: Rule = (spec, ctx, lang) => {
  if (spec.frontmatter.kind !== "quick") return [];
  const files = spec.sections.files?.items ?? [];
  const tasks = spec.sections.tasks?.items.length ?? 0;
  const limit = ctx.config.lanes.quick.maxFiles;
  // Tests and documentation ride along; a glob counts its matches, as in the split limit.
  const { codeFiles } = collectSignals(spec, ctx.config, ctx.repo);
  const sensitive = files.some((entry) => matchesAny(entry.path, ctx.config.sensitive));
  const problems: QuickProblem[] = [
    ...(tasks > 1 ? [{ kind: "tasks", value: tasks } as const] : []),
    ...(codeFiles > limit ? [{ kind: "files", value: codeFiles, max: limit } as const] : []),
    ...(sensitive ? [{ kind: "sensitive" } as const] : []),
  ];
  if (problems.length === 0) return [];
  const detail = problems.map((problem) => formatQuickProblem(problem, lang)).join("; ");
  return [report(lang, { code: "quick-limits", params: { detail } })];
};

function isEmpty(spec: Spec, key: SectionKey): boolean {
  const value = spec.sections[key];
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim().length === 0;
  return !value.none && value.items.length === 0;
}
