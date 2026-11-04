// SPDX-License-Identifier: Apache-2.0
import { fold, type Lang } from "../i18n";
import type { TestsPolicy } from "../schema/config";
import { isTestFile } from "../scope/tests";
import { computeSize } from "../sizing/size";
import type { Diagnostic } from "../spec/diagnostics";
import type { CommitType, Spec, Task } from "../spec/model";
import { fileLine, itemLine, type Rule, report, type ValidationContext } from "./context";
import { formatBreach, splitBreaches } from "./limits";

const VAGUE_TERMS: readonly string[] = [
  "rapido",
  "rapidamente",
  "correctamente",
  "adecuado",
  "adecuada",
  "adecuadamente",
  "intuitivo",
  "intuitiva",
  "facil",
  "facilmente",
  "amigable",
  "optimo",
  "optima",
  "eficiente",
  "eficientemente",
  "robusto",
  "robusta",
  "escalable",
  "bonito",
  "bonita",
  "se ve bien",
  "funciona bien",
  "lo antes posible",
  "fast",
  "quickly",
  "correctly",
  "properly",
  "appropriate",
  "appropriately",
  "intuitive",
  "easy",
  "easily",
  "user-friendly",
  "user friendly",
  "optimal",
  "efficient",
  "efficiently",
  "robust",
  "scalable",
  "nice",
  "looks good",
  "works well",
  "seamless",
  "seamlessly",
  "as soon as possible",
];

/** Types expected to come with tests. */
const CODE_TYPES: ReadonlySet<CommitType> = new Set(["feat", "fix", "refactor", "perf"]);

/** What the task card asks about tests: write them first, or keep the existing ones as they are. */
export type TestRules = "first" | "keep";

/** New behaviour (`feat`, `fix`) starts from a failing test; `refactor` and `perf` keep theirs. */
export function testRules(task: Pick<Task, "type">, policy: TestsPolicy): TestRules | undefined {
  const type = task.type ?? "feat";
  if (policy === "off" || !CODE_TYPES.has(type)) return undefined;
  return type === "feat" || type === "fix" ? "first" : "keep";
}

/** How a change's tests come before its code (ADR 0014): a feature's wait for the person; a bug's red test locks by itself. */
export type TestCycle = "feature" | "bug";

/**
 * The cycle of tests a change follows under `policy.tests: contract`, by its tasks not `done`
 * yet: a standard change with a `feat` task, the default type, is a feature; one with `fix`
 * tasks and no `feat`, also a quick one, is a bug; any other has no testing phase.
 */
export function testCycle(
  spec: Spec,
  policy: TestsPolicy,
  done: ReadonlySet<string> = new Set(),
): TestCycle | undefined {
  const { kind } = spec.frontmatter;
  if (policy !== "contract" || (kind !== "standard" && kind !== "quick")) return undefined;
  const pending = (spec.sections.tasks?.items ?? []).filter((task) => !done.has(task.id));
  const types = new Set(pending.map((task) => task.type ?? "feat"));
  if (kind === "standard" && types.has("feat")) return "feature";
  return types.has("fix") ? "bug" : undefined;
}

/** Criteria name an observable outcome, in WHEN … THEN … form. */
export const checkCriteria: Rule = (spec, ctx, lang) =>
  (spec.sections.criteria?.items ?? []).flatMap((criterion): Diagnostic[] => {
    const at = { line: itemLine(ctx, criterion.id), target: criterion.id };
    const padded = ` ${fold(criterion.text).replace(/[^a-z0-9-]+/g, " ")} `;
    const terms = VAGUE_TERMS.filter((term) => padded.includes(` ${term} `));
    const structured = /\b(?:cuando|when)\b/.test(padded) && /\b(?:entonces|then)\b/.test(padded);
    return [
      ...(terms.length > 0
        ? [
            report(lang, {
              code: "criterion-vague",
              params: { id: criterion.id, terms: terms.join(", ") },
              ...at,
            }),
          ]
        : []),
      ...(structured
        ? []
        : [report(lang, { code: "criterion-unstructured", params: { id: criterion.id }, ...at })]),
    ];
  });

/** Task size and the tests policy. Only standard changes carry the tests policy. */
export const checkTaskQuality: Rule = (spec, ctx, lang) => {
  const { policy, split } = ctx.config;
  const testsApply = spec.frontmatter.kind === "standard" && policy.tests !== "off";
  return (spec.sections.tasks?.items ?? []).flatMap((task): Diagnostic[] => {
    const at = { line: itemLine(ctx, task.id), target: task.id };
    const large =
      task.files.length > split.taskMaxFiles
        ? [
            report(lang, {
              code: "task-too-large",
              params: { id: task.id, count: task.files.length, max: split.taskMaxFiles },
              ...at,
            }),
          ]
        : [];
    const untested =
      testsApply && needsTests(task, policy.tests) && !task.files.some(isTestFile)
        ? [
            report(lang, {
              code: "task-no-tests",
              params: { id: task.id, policy: policy.tests },
              severity:
                policy.tests === "required" || policy.tests === "contract" ? "error" : "warning",
              ...at,
            }),
          ]
        : [];
    return [...large, ...untested];
  });
};

/**
 * Whether a code task must list a test. Under `contract`, a `refactor` or a `perf` need not: its
 * contract is the existing tests, and `task done` refuses one that removes their assertions.
 */
function needsTests(task: Pick<Task, "type">, policy: TestsPolicy): boolean {
  const rules = testRules(task, policy);
  return rules === "first" || (rules === "keep" && policy !== "contract");
}

/**
 * Under `contract`, the last code task checks the project's types: `task done` does not run the
 * project's commands for a task with its own verification, so a type error would only show up
 * at acceptance. Earlier tasks need not, as every test is written before them. Its verification
 * counts as `task done` runs it, `verify.quick` first; running `verify.full` counts too. A done
 * task is left alone: an adjustment without new code tasks adds no code to check.
 */
export const checkTypecheck: Rule = (spec, ctx, lang) => {
  const typecheck = ctx.typecheck?.trim();
  if (typecheck === undefined || typecheck === "" || !typesApply(spec, ctx)) return [];
  const last = (spec.sections.tasks?.items ?? [])
    .filter((task) => CODE_TYPES.has(task.type ?? "feat"))
    .at(-1);
  if (last === undefined || ctx.doneTasks?.has(last.id) === true) return [];
  if (checksTypes(last, ctx.config, typecheck)) return [];
  return [
    report(lang, {
      code: "task-no-typecheck",
      params: { id: last.id, value: typecheck },
      line: itemLine(ctx, last.id),
      target: last.id,
    }),
  ];
};

/** The type check is asked of a standard or quick change under `contract`, until its closing. */
function typesApply(spec: Spec, ctx: ValidationContext): boolean {
  const { kind } = spec.frontmatter;
  return (
    ctx.config.policy.tests === "contract" &&
    ctx.phase !== "closing" &&
    (kind === "standard" || kind === "quick")
  );
}

/**
 * Whether `task`'s verification, as `task done` runs it, runs `typecheck` or `verify.full`; an
 * empty command runs nothing, though every text contains it.
 */
function checksTypes(
  task: Pick<Task, "verify">,
  config: ValidationContext["config"],
  typecheck: string,
): boolean {
  const { quick, full } = config.verify;
  const runs = [quick, task.verify ?? config.verify.default]
    .filter((part) => part !== undefined)
    .join(" && ");
  return [typecheck, full?.trim()].some(
    (command) => command !== undefined && command !== "" && runs.includes(command),
  );
}

/** Every file says why it changes; retros are written from the diff, so they are exempt. */
export const checkFileReasons: Rule = (spec, ctx, lang) => {
  if (spec.frontmatter.kind === "retro") return [];
  return (spec.sections.files?.items ?? [])
    .filter((entry) => entry.reason === undefined)
    .map((entry) =>
      report(lang, {
        code: "file-reason-missing",
        params: { path: entry.path },
        line: fileLine(ctx, entry.path),
        target: `file:${entry.path}`,
      }),
    );
};

const HORIZONTAL_LAYERS: readonly { readonly pattern: RegExp; readonly layer: string }[] = [
  { pattern: /\b(database(\s+schema)?|base\s+de\s+datos|bd)\b/i, layer: "database" },
  { pattern: /\b(migrations?|migraci[oó]n(?:es)?)\b/i, layer: "migrations" },
  { pattern: /\b(backend|back-end)\b/i, layer: "backend" },
  { pattern: /\b(frontend|front-end)\b/i, layer: "frontend" },
  { pattern: /\b(infra(?:structure)?|infraestructura)\b/i, layer: "infrastructure" },
];

function checkVerticalSlices(spec: Spec, ctx: ValidationContext, lang: Lang): Diagnostic[] {
  const slices = spec.sections.slices?.items ?? [];
  return slices.flatMap((slice) => {
    const matched = HORIZONTAL_LAYERS.find((entry) => entry.pattern.test(slice.title));
    if (matched === undefined) return [];
    return [
      report(lang, {
        code: "slice-horizontal",
        params: { id: slice.id, layer: matched.layer },
        line: itemLine(ctx, slice.id),
        target: slice.id,
      }),
    ];
  });
}

/** Changes too large for one spec must be split; close ones get a warning. Epics require vertical slices. */
export const checkSplit: Rule = (spec, ctx, lang) => {
  const { kind } = spec.frontmatter;
  if (kind === "epic") return checkVerticalSlices(spec, ctx, lang);
  if (kind === "retro" || kind === "quick") return [];
  // The size was decided at the approval, and the closing cannot touch Files to split anything.
  if (ctx.phase === "closing") return [];
  const { exceeded, near } = splitBreaches(computeSize(spec, ctx.config, ctx.repo), ctx.config);
  if (exceeded.length > 0) {
    const detail = exceeded.map((breach) => formatBreach(breach, lang)).join("; ");
    return [report(lang, { code: "split-required", params: { detail } })];
  }
  if (near.length === 0) return [];
  const detail = near.map((breach) => formatBreach(breach, lang)).join("; ");
  return [report(lang, { code: "size-near-split", params: { detail } })];
};
