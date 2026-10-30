// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/** How a check counts: its failures fail `specty check`, only warn, or it does not run. */
export type CheckLevel = "error" | "warn" | "off";

/** `checks` in `.specty/config.yaml`: what `specty check` runs and how much it prints. */
export interface ChecksConfig {
  /** Level of each check by its id; a check not listed is `error`. */
  readonly levels: Readonly<Record<string, CheckLevel>>;
  /** Findings shown per check before «… and N more». */
  readonly maxFindings: number;
  /** Paths no check looks at, on top of the ignored and generated ones. */
  readonly exclude: readonly string[];
  readonly todo: TodoConfig;
  /** Limits of each function: its lines of code and its cyclomatic complexity. */
  readonly functions: { readonly maxLines: number; readonly complexity: number };
  /** The layers of the project, by name: their paths and what each one may import. */
  readonly layers: Layers;
  /** Code generators besides the ones Specty detects, whose outputs must match what they make. */
  readonly generators: readonly GeneratorConfig[];
  /** The `pre-commit` hook also runs `specty check --staged` on manual changes. */
  readonly preCommit: boolean;
  /** The project's commands for the command checks, over the ones Specty detects. */
  readonly commands: Readonly<Partial<Record<CommandCheck, string>>>;
  readonly coverage: CoverageConfig;
}

/**
 * Where `diff-coverage` looks for the report the tests leave (paths with `*` inside a segment),
 * and the percentages of added lines run below which it warns and, if set, fails.
 */
interface CoverageConfig {
  readonly reports: readonly string[];
  readonly warn: number;
  readonly error?: number;
}

/** A layer: the files in it, the layers it may import besides itself, and the packages it may not. */
export interface LayerRule {
  readonly paths: readonly string[];
  readonly may: readonly string[];
  readonly forbiddenPackages: readonly string[];
}

export type Layers = Readonly<Record<string, LayerRule>>;

/** A code generator: its command, the files it writes and, if given, the ones it reads. */
export interface GeneratorConfig {
  readonly command: string;
  readonly outputs: readonly string[];
  /** Without them, the generator runs on any change. */
  readonly inputs?: readonly string[];
}

/** The checks that run one of the project's own commands. */
export const COMMAND_CHECKS = ["format", "lint", "typecheck", "tests"] as const;
export type CommandCheck = (typeof COMMAND_CHECKS)[number];

/** What the `todo` check looks for: its markers, and what counts as pointing to an issue. */
export interface TodoConfig {
  /** Words that, first in a comment, mark pending work; case matters. */
  readonly markers: readonly string[];
  /** Regular expression for a reference to an issue, searched after the marker. */
  readonly reference: string;
}

export const DEFAULT_CHECKS: ChecksConfig = {
  levels: {},
  maxFindings: 10,
  // Dependencies and build artifacts, by folder names common to every ecosystem.
  exclude: [
    "**/node_modules/**",
    "**/build/**",
    "**/dist/**",
    "**/out/**",
    "**/target/**",
    "**/coverage/**",
    "**/vendor/**",
    "**/.dart_tool/**",
    "**/.next/**",
    "**/.angular/**",
    "**/.gradle/**",
  ],
  // An issue number (`#12`, `acme/app#12`), a tracker key (`ABC-12`) or a link.
  todo: {
    markers: ["TODO", "FIXME"],
    reference: String.raw`#\d+|\b[A-Z][A-Z0-9]+-\d+\b|https?://\S+`,
  },
  functions: { maxLines: 50, complexity: 10 },
  layers: {},
  generators: [],
  preCommit: false,
  commands: {},
  // Where the usual coverage tools write: LCOV, Cobertura, JaCoCo and Go's profile.
  coverage: {
    reports: [
      "coverage/lcov.info",
      "*/coverage/lcov.info",
      "*/*/coverage/lcov.info",
      "lcov.info",
      "coverage.xml",
      "coverage/cobertura-coverage.xml",
      "target/site/jacoco/jacoco.xml",
      "build/reports/jacoco/test/jacocoTestReport.xml",
      "*/build/reports/jacoco/test/jacocoTestReport.xml",
      "coverage.out",
    ],
    warn: 80,
  },
};

function isRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

export const ChecksSchema = z.strictObject({
  levels: z.record(z.string(), z.enum(["error", "warn", "off"])).optional(),
  maxFindings: z.number().int().positive().optional(),
  exclude: z.array(z.string().min(1)).optional(),
  todo: z
    .strictObject({
      markers: z.array(z.string().min(1)).min(1).optional(),
      reference: z
        .string()
        .min(1)
        .refine(isRegex, { error: "Not a valid regular expression." })
        .optional(),
    })
    .optional(),
  functions: z
    .strictObject({
      maxLines: z.number().int().positive().optional(),
      complexity: z.number().int().positive().optional(),
    })
    .optional(),
  layers: z
    .record(
      z.string().min(1),
      z.strictObject({
        paths: z.array(z.string().min(1)).min(1),
        may: z.array(z.string().min(1)).optional(),
        forbiddenPackages: z.array(z.string().min(1)).optional(),
      }),
    )
    .superRefine((layers, context) => {
      for (const [name, layer] of Object.entries(layers)) {
        for (const other of layer.may ?? []) {
          if (!Object.hasOwn(layers, other)) {
            context.addIssue({
              code: "custom",
              path: [name, "may"],
              message: `Unknown layer «${other}».`,
            });
          }
        }
      }
    })
    .optional(),
  generators: z
    .array(
      z.strictObject({
        command: z.string().min(1),
        outputs: z.array(z.string().min(1)).min(1),
        inputs: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
  preCommit: z.boolean().optional(),
  commands: z
    .strictObject({
      format: z.string().min(1).optional(),
      lint: z.string().min(1).optional(),
      typecheck: z.string().min(1).optional(),
      tests: z.string().min(1).optional(),
    } satisfies Record<CommandCheck, z.ZodType>)
    .optional(),
  coverage: z
    .strictObject({
      reports: z.array(z.string().min(1)).min(1).optional(),
      warn: z.number().min(0).max(100).optional(),
      error: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export function resolveChecks(input: z.infer<typeof ChecksSchema> | undefined): ChecksConfig {
  return {
    levels: input?.levels ?? DEFAULT_CHECKS.levels,
    maxFindings: input?.maxFindings ?? DEFAULT_CHECKS.maxFindings,
    // The person's paths add to the dependency and build folders, which stay out.
    exclude: [...new Set([...DEFAULT_CHECKS.exclude, ...(input?.exclude ?? [])])],
    todo: {
      markers: input?.todo?.markers ?? DEFAULT_CHECKS.todo.markers,
      reference: input?.todo?.reference ?? DEFAULT_CHECKS.todo.reference,
    },
    functions: {
      maxLines: input?.functions?.maxLines ?? DEFAULT_CHECKS.functions.maxLines,
      complexity: input?.functions?.complexity ?? DEFAULT_CHECKS.functions.complexity,
    },
    layers: layersOf(input),
    generators: generatorsOf(input),
    preCommit: input?.preCommit ?? DEFAULT_CHECKS.preCommit,
    commands: commandsOf(input),
    coverage: coverageOf(input),
  };
}

/** Where to look for the coverage report and its thresholds, with the defaults it leaves out. */
function coverageOf(input: z.infer<typeof ChecksSchema> | undefined): CoverageConfig {
  const coverage = input?.coverage;
  return {
    reports: coverage?.reports ?? DEFAULT_CHECKS.coverage.reports,
    warn: coverage?.warn ?? DEFAULT_CHECKS.coverage.warn,
    ...(coverage?.error === undefined ? {} : { error: coverage.error }),
  };
}

/** Each layer, with no allowed layer and no forbidden package unless it names them. */
function layersOf(input: z.infer<typeof ChecksSchema> | undefined): ChecksConfig["layers"] {
  return Object.fromEntries(
    Object.entries(input?.layers ?? {}).map(([name, layer]) => [
      name,
      {
        paths: layer.paths,
        may: layer.may ?? [],
        forbiddenPackages: layer.forbiddenPackages ?? [],
      },
    ]),
  );
}

function generatorsOf(input: z.infer<typeof ChecksSchema> | undefined): ChecksConfig["generators"] {
  return (input?.generators ?? []).map((generator) => ({
    command: generator.command,
    outputs: generator.outputs,
    ...(generator.inputs !== undefined ? { inputs: generator.inputs } : {}),
  }));
}

/** The project's commands it names, without the ones it leaves out. */
function commandsOf(input: z.infer<typeof ChecksSchema> | undefined): ChecksConfig["commands"] {
  return Object.fromEntries(
    COMMAND_CHECKS.flatMap((id) => {
      const command = input?.commands?.[id];
      return command === undefined ? [] : [[id, command]];
    }),
  );
}

/** The level of the check `id`: what the configuration says, or `error`. */
export function checkLevel(config: { readonly checks: ChecksConfig }, id: string): CheckLevel {
  return config.checks.levels[id] ?? "error";
}
