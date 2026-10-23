// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { Lang } from "../i18n";

export type TestsPolicy = "required" | "recommended" | "off";

/** `.specty/config.yaml` with every default applied. */
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
  readonly policy: { readonly tests: TestsPolicy };
  readonly retro: { readonly mode: "agent" | "minimal" };
  readonly git: {
    readonly branchPerChange: boolean;
    /** `new` creates each change in a worktree of its own (needs `branchPerChange`). */
    readonly worktrees: boolean;
    /**
     * What prepares a new worktree, such as installing dependencies; `false` runs nothing.
     * Unset: the install command of the stack detected there.
     */
    readonly setup?: string | false;
  };
  readonly team: { readonly approvers: readonly string[]; readonly requirePrReview: boolean };
  readonly ui: { readonly port: "auto" | number; readonly requireUserPresence: boolean };
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
  policy: { tests: "recommended" },
  retro: { mode: "agent" },
  git: { branchPerChange: true, worktrees: true },
  team: { approvers: [], requirePrReview: true },
  ui: { port: "auto", requireUserPresence: false },
};

const Globs = z.array(z.string().min(1));
const Positive = z.number().int().positive();

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
  policy: z
    .strictObject({ tests: z.enum(["required", "recommended", "off"]).optional() })
    .optional(),
  retro: z.strictObject({ mode: z.enum(["agent", "minimal"]).optional() }).optional(),
  git: z
    .strictObject({
      branchPerChange: z.boolean().optional(),
      worktrees: z.boolean().optional(),
      setup: z.union([z.string().min(1), z.literal(false)]).optional(),
    })
    .optional(),
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
  const verifyDefault = input.verify?.default;
  const verifyFull = input.verify?.full;
  return {
    version: 1,
    language: input.language ?? base.language,
    mode: input.mode ?? base.mode,
    governed: input.governed ?? base.governed,
    ignored: input.ignored ?? base.ignored,
    sensitive: input.sensitive ?? base.sensitive,
    verify: {
      ...(verifyDefault !== undefined ? { default: verifyDefault } : {}),
      ...(verifyFull !== undefined ? { full: verifyFull } : {}),
      timeoutSec: input.verify?.timeoutSec ?? base.verify.timeoutSec,
    },
    scope: {
      implicitTests: input.scope?.implicitTests ?? base.scope.implicitTests,
      generated: input.scope?.generated ?? base.scope.generated,
      autoApprove: input.scope?.autoApprove ?? base.scope.autoApprove,
    },
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
    policy: { tests: input.policy?.tests ?? base.policy.tests },
    retro: { mode: input.retro?.mode ?? base.retro.mode },
    git: {
      branchPerChange: input.git?.branchPerChange ?? base.git.branchPerChange,
      worktrees: input.git?.worktrees ?? base.git.worktrees,
      ...(input.git?.setup !== undefined ? { setup: input.git.setup } : {}),
    },
    team: {
      approvers: input.team?.approvers ?? base.team.approvers,
      requirePrReview: input.team?.requirePrReview ?? base.team.requirePrReview,
    },
    ui: {
      port: input.ui?.port ?? base.ui.port,
      requireUserPresence: input.ui?.requireUserPresence ?? base.ui.requireUserPresence,
    },
  };
}
