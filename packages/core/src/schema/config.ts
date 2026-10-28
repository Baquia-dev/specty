// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";
import { defaultGlossary } from "../glossary";
import type { Lang } from "../i18n";
import { type ChecksConfig, ChecksSchema, DEFAULT_CHECKS, resolveChecks } from "./checks";
import { DEFAULT_GIT, type GitConfig, GitSchema, resolveGit } from "./git";

/** `contract`, above `required`: a feature's tests are written and approved before its code (ADR 0014). */
export type TestsPolicy = "contract" | "required" | "recommended" | "off";

/** `.specty/config.yaml` with every default applied. */
/** Lines of code: a warning past `warn`, a block past `fail`, or never with `false`. */
export interface LineLimits {
  readonly warn: number;
  readonly fail: number | false;
}

export interface ResolvedConfig {
  readonly version: 1;
  readonly language: Lang;
  readonly mode: "individual" | "team";
  readonly governed: readonly string[];
  readonly ignored: readonly string[];
  readonly sensitive: readonly string[];
  readonly verify: {
    readonly default?: string;
    readonly full?: string;
    /** A fast check of the whole repository that runs before each task's verification. */
    readonly quick?: string;
    readonly timeoutSec: number;
  };
  readonly scope: {
    readonly implicitTests: boolean;
    readonly generated: readonly string[];
    readonly autoApprove: "none" | "tests-and-generated";
  };
  readonly lanes: { readonly quick: { readonly maxFiles: number } };
  readonly split: {
    readonly maxTasks: number;
    readonly maxFiles: number;
    readonly maxModules: number;
    readonly taskMaxFiles: number;
  };
  /** Highest score of each size level; anything above `L` is `XL`. */
  readonly size: { readonly S: number; readonly M: number; readonly L: number };
  /**
   * Lines of code of the files a task touches: a warning past `warn`, a block past `fail` (or
   * never, with `false`). Tests have their own; `exclude` lists paths not sized, the person's
   * added to the default ones.
   */
  readonly lines: LineLimits & {
    readonly tests: LineLimits;
    readonly exclude: readonly string[];
  };
  /** What `specty check` runs and how much it prints (ADR 0012). */
  readonly checks: ChecksConfig;
  readonly policy: { readonly tests: TestsPolicy };
  /** The project's glossary (formats.md §6); unset, the default of its language. */
  readonly glossary: string;
  readonly retro: { readonly mode: "agent" | "minimal" };
  readonly git: GitConfig;
  readonly team: { readonly approvers: readonly string[]; readonly requirePrReview: boolean };
  readonly ui: { readonly port: "auto" | number; readonly requireUserPresence: boolean };
  /**
   * The independent review (ADR 0011): a command the person sets up, which reads the text to
   * review on its standard input. Unset, Specty neither recommends nor runs a review.
   */
  readonly review?: { readonly command: string; readonly timeoutSec: number };
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  version: 1,
  language: "en",
  mode: "individual",
  governed: ["**"],
  ignored: ["**/*.md", "docs/**"],
  sensitive: ["**/migrations/**", "**/auth/**", ".github/**", "**/.env*", "**/infra/**"],
  verify: { timeoutSec: 600 },
  scope: { implicitTests: true, generated: [], autoApprove: "tests-and-generated" },
  lanes: { quick: { maxFiles: 3 } },
  split: { maxTasks: 8, maxFiles: 15, maxModules: 2, taskMaxFiles: 5 },
  size: { S: 4, M: 10, L: 18 },
  lines: {
    warn: 300,
    fail: 500,
    tests: { warn: 400, fail: 600 },
    // Folders of data rather than logic, common to every ecosystem.
    exclude: [
      "**/fixtures/**",
      "**/__fixtures__/**",
      "**/mocks/**",
      "**/__mocks__/**",
      "**/testdata/**",
      "**/migrations/**",
      "**/i18n/**",
      "**/l10n/**",
      "**/locales/**",
      "**/translations/**",
    ],
  },
  checks: DEFAULT_CHECKS,
  policy: { tests: "recommended" },
  glossary: defaultGlossary("en"),
  retro: { mode: "agent" },
  git: DEFAULT_GIT,
  team: { approvers: [], requirePrReview: true },
  ui: { port: "auto", requireUserPresence: false },
};

const Globs = z.array(z.string().min(1));
const Positive = z.number().int().positive();
const LineLimitsSchema = z.strictObject({
  warn: Positive.optional(),
  fail: z.union([Positive, z.literal(false)]).optional(),
});

export const ConfigSchema = z.strictObject({
  version: z.literal(1),
  language: z.enum(["es", "en"]).optional(),
  mode: z.enum(["individual", "team"]).optional(),
  governed: Globs.optional(),
  ignored: Globs.optional(),
  sensitive: Globs.optional(),
  verify: z
    .strictObject({
      default: z.string().min(1).optional(),
      full: z.string().min(1).optional(),
      quick: z.string().min(1).optional(),
      timeoutSec: Positive.optional(),
    })
    .optional(),
  scope: z
    .strictObject({
      implicitTests: z.boolean().optional(),
      generated: Globs.optional(),
      autoApprove: z.enum(["none", "tests-and-generated"]).optional(),
    })
    .optional(),
  lanes: z
    .strictObject({ quick: z.strictObject({ maxFiles: Positive.optional() }).optional() })
    .optional(),
  split: z
    .strictObject({
      maxTasks: Positive.optional(),
      maxFiles: Positive.optional(),
      maxModules: Positive.optional(),
      taskMaxFiles: Positive.optional(),
    })
    .optional(),
  size: z
    .strictObject({ S: Positive.optional(), M: Positive.optional(), L: Positive.optional() })
    .optional(),
  lines: z
    .strictObject({
      ...LineLimitsSchema.shape,
      tests: LineLimitsSchema.optional(),
      exclude: Globs.optional(),
    })
    .optional(),
  checks: ChecksSchema.optional(),
  policy: z
    .strictObject({ tests: z.enum(["contract", "required", "recommended", "off"]).optional() })
    .optional(),
  glossary: z.string().min(1).optional(),
  retro: z.strictObject({ mode: z.enum(["agent", "minimal"]).optional() }).optional(),
  git: GitSchema.optional(),
  team: z
    .strictObject({
      approvers: z.array(z.string().min(1)).optional(),
      requirePrReview: z.boolean().optional(),
    })
    .optional(),
  ui: z
    .strictObject({
      port: z.union([z.literal("auto"), z.number().int().min(1).max(65535)]).optional(),
      requireUserPresence: z.boolean().optional(),
    })
    .optional(),
  review: z
    .strictObject({ command: z.string().min(1), timeoutSec: Positive.optional() })
    .optional(),
  /** Per-tool effort table overrides; interpreted by the CLI. */
  effort: z.record(z.string(), z.unknown()).optional(),
});

export type ConfigInput = z.infer<typeof ConfigSchema>;

export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: ResolvedConfig }
  | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

/** Validates a parsed `config.yaml` and fills in the defaults. */
export function resolveConfig(input: unknown): ConfigResult {
  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    return { ok: false, issues };
  }
  const config = withDefaults(parsed.data);
  const { S, M, L } = config.size;
  if (!(S < M && M < L)) {
    return { ok: false, issues: [{ path: "size", message: "Thresholds must grow: S < M < L." }] };
  }
  return { ok: true, config };
}

function withDefaults(input: ConfigInput): ResolvedConfig {
  const base = DEFAULT_CONFIG;
  const review = reviewOf(input);
  return {
    version: 1,
    language: input.language ?? base.language,
    mode: input.mode ?? base.mode,
    governed: input.governed ?? base.governed,
    ignored: input.ignored ?? base.ignored,
    sensitive: input.sensitive ?? base.sensitive,
    verify: verifyOf(input),
    scope: scopeOf(input),
    ...limitsOf(input),
    lines: linesOf(input),
    checks: resolveChecks(input.checks),
    policy: { tests: input.policy?.tests ?? base.policy.tests },
    glossary: glossaryOf(input),
    retro: { mode: input.retro?.mode ?? base.retro.mode },
    git: resolveGit(input.git),
    team: teamOf(input),
    ui: uiOf(input),
    ...(review !== undefined ? { review } : {}),
  };
}

function glossaryOf(input: ConfigInput): string {
  return input.glossary ?? defaultGlossary(input.language ?? DEFAULT_CONFIG.language);
}

function verifyOf(input: ConfigInput): ResolvedConfig["verify"] {
  const { verify } = input;
  return {
    ...(verify?.default !== undefined ? { default: verify.default } : {}),
    ...(verify?.full !== undefined ? { full: verify.full } : {}),
    ...(verify?.quick !== undefined ? { quick: verify.quick } : {}),
    timeoutSec: verify?.timeoutSec ?? DEFAULT_CONFIG.verify.timeoutSec,
  };
}

function scopeOf(input: ConfigInput): ResolvedConfig["scope"] {
  const base = DEFAULT_CONFIG.scope;
  return {
    implicitTests: input.scope?.implicitTests ?? base.implicitTests,
    generated: input.scope?.generated ?? base.generated,
    autoApprove: input.scope?.autoApprove ?? base.autoApprove,
  };
}

/** The limits of a change: the quick lane's, when it must be split, and its size levels. */
function limitsOf(input: ConfigInput): Pick<ResolvedConfig, "lanes" | "split" | "size"> {
  const base = DEFAULT_CONFIG;
  return {
    lanes: { quick: { maxFiles: input.lanes?.quick?.maxFiles ?? base.lanes.quick.maxFiles } },
    split: {
      maxTasks: input.split?.maxTasks ?? base.split.maxTasks,
      maxFiles: input.split?.maxFiles ?? base.split.maxFiles,
      maxModules: input.split?.maxModules ?? base.split.maxModules,
      taskMaxFiles: input.split?.taskMaxFiles ?? base.split.taskMaxFiles,
    },
    size: {
      S: input.size?.S ?? base.size.S,
      M: input.size?.M ?? base.size.M,
      L: input.size?.L ?? base.size.L,
    },
  };
}

function linesOf(input: ConfigInput): ResolvedConfig["lines"] {
  const base = DEFAULT_CONFIG.lines;
  return {
    warn: input.lines?.warn ?? base.warn,
    fail: input.lines?.fail ?? base.fail,
    tests: {
      warn: input.lines?.tests?.warn ?? base.tests.warn,
      fail: input.lines?.tests?.fail ?? base.tests.fail,
    },
    // The person's paths add to the data folders, which stay out.
    exclude: [...new Set([...base.exclude, ...(input.lines?.exclude ?? [])])],
  };
}

function teamOf(input: ConfigInput): ResolvedConfig["team"] {
  return {
    approvers: input.team?.approvers ?? DEFAULT_CONFIG.team.approvers,
    requirePrReview: input.team?.requirePrReview ?? DEFAULT_CONFIG.team.requirePrReview,
  };
}

function uiOf(input: ConfigInput): ResolvedConfig["ui"] {
  return {
    port: input.ui?.port ?? DEFAULT_CONFIG.ui.port,
    requireUserPresence: input.ui?.requireUserPresence ?? DEFAULT_CONFIG.ui.requireUserPresence,
  };
}

/** The independent review, when configured; without its own time limit, verification's. */
function reviewOf(input: ConfigInput): ResolvedConfig["review"] {
  if (input.review === undefined) return undefined;
  return {
    command: input.review.command,
    timeoutSec:
      input.review.timeoutSec ?? input.verify?.timeoutSec ?? DEFAULT_CONFIG.verify.timeoutSec,
  };
}
