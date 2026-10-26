// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
  type Finding,
  type GeneratorConfig,
  matchesAny,
  translator,
} from "@baquia-dev/specty-core";
import { parse as parseYaml } from "yaml";
import type { Stack } from "../detect/stack";
import { execute, tail } from "../io/exec";
import { isRecord, readText } from "../io/files";
import type { Session } from "../session";
import type { CheckContext, CheckDefinition, Provider } from "./provider";

/**
 * Generated code that matches its generator (ADR 0012): like `git diff --exit-code` after
 * regenerating, but without leaving the regenerated files behind. The check keeps what the
 * outputs hold, runs the generator, compares, and puts every output back as it was.
 */

/** A generator of the run: its command, the files it writes, and whether the run calls for it. */
export interface Generator {
  readonly command: string;
  readonly outputs: readonly string[];
  readonly runsFor: (context: CheckContext) => Promise<boolean>;
}

const DART_GENERATED = ["**/*.g.dart", "**/*.freezed.dart", "**/*.gr.dart", "**/*.mocks.dart"];
const PRISMA_SCHEMAS = ["prisma/schema.prisma", "schema.prisma"];
const PRISMA_COMMANDS: Readonly<Record<string, string>> = {
  pnpm: "pnpm exec prisma generate",
  yarn: "yarn prisma generate",
  bun: "bunx prisma generate",
};

/** The generators of `checks.generators` and the ones Specty detects in the stacks. */
export async function detectGenerators(
  session: Session,
  stacks: readonly Stack[],
): Promise<Generator[]> {
  const found = await Promise.all([prisma(session, stacks), buildRunner(session, stacks)]);
  return [...session.config.checks.generators.map(configured), ...found.flat()];
}

export function generatedProvider(generators: readonly Generator[]): Provider {
  return {
    id: "generated",
    applies: () => generators.length > 0,
    checks: [
      {
        id: "generated",
        exclusive: true,
        async run(context) {
          const findings: Finding[] = [];
          // One after another: two generators may write the same files.
          for (const generator of generators) {
            if (context.mode === "all" || (await generator.runsFor(context))) {
              findings.push(...(await regenerate(context, generator)));
            }
          }
          return {
            findings: findings.toSorted((a, b) => (a.path ?? "").localeCompare(b.path ?? "")),
          };
        },
      } satisfies CheckDefinition,
    ],
  };
}

function configured(generator: GeneratorConfig): Generator {
  const { command, outputs, inputs } = generator;
  return {
    command,
    outputs,
    runsFor: async ({ files }) =>
      inputs === undefined
        ? files.length > 0
        : files.some((path) => matchesAny(path, inputs) || matchesAny(path, outputs)),
  };
}

/** Prisma's client, when a `generator` of its schema writes it into the repository (`output`). */
async function prisma(session: Session, stacks: readonly Stack[]): Promise<Generator[]> {
  const stack = stacks.find(
    (candidate) =>
      (candidate.language === "typescript" || candidate.language === "javascript") &&
      candidate.frameworks.includes("prisma"),
  );
  if (stack === undefined) return [];
  const folder = await readdir(join(session.root, "prisma", "schema")).catch(() => []);
  const schemas = [
    ...PRISMA_SCHEMAS,
    ...folder.filter((name) => name.endsWith(".prisma")).map((name) => `prisma/schema/${name}`),
  ];
  const outputs = (
    await Promise.all(
      schemas.map(async (schema) => {
        const text = await readText(join(session.root, schema));
        return text === undefined ? [] : outputsOf(text, posix.dirname(schema));
      }),
    )
  ).flat();
  if (outputs.length === 0) return [];
  const tool = stack.tool ?? "npm";
  const command = Object.hasOwn(PRISMA_COMMANDS, tool)
    ? (PRISMA_COMMANDS[tool] ?? "npx prisma generate")
    : "npx prisma generate";
  return [
    {
      command,
      outputs,
      runsFor: async ({ files }) =>
        files.some((path) => schemas.includes(path) || matchesAny(path, outputs)),
    },
  ];
}

/** The folders where the `generator` blocks of a schema write, inside the repository. */
function outputsOf(schema: string, folder: string): string[] {
  return [...schema.matchAll(/generator\s+\w+\s*\{([^}]*)\}/g)].flatMap((block) => {
    const output = /\boutput\s*=\s*"([^"]+)"/.exec(block[1] ?? "")?.[1];
    if (output === undefined) return [];
    const path = posix.normalize(posix.join(folder, output));
    return path.startsWith("..") || path.startsWith("node_modules") ? [] : [`${path}/**`];
  });
}

/** build_runner, when the pubspec has it; it runs for a file that declares a generated `part`. */
async function buildRunner(session: Session, stacks: readonly Stack[]): Promise<Generator[]> {
  if (!stacks.some((stack) => stack.language === "dart")) return [];
  const pubspec = safeYaml(await readText(join(session.root, "pubspec.yaml")));
  const declared = [pubspec?.dependencies, pubspec?.dev_dependencies].some(
    (deps) => isRecord(deps) && "build_runner" in deps,
  );
  if (!declared) return [];
  const { generated } = session.config.scope;
  const outputs = generated.length > 0 ? generated : DART_GENERATED;
  return [
    {
      command: "dart run build_runner build --delete-conflicting-outputs",
      outputs,
      async runsFor(context) {
        for (const path of context.files) {
          if (path === "pubspec.yaml" || posix.basename(path) === "build.yaml") return true;
          if (matchesAny(path, outputs)) return true;
          if (path.endsWith(".dart") && declaresPart(await context.read(path), path, outputs)) {
            return true;
          }
        }
        return false;
      },
    },
  ];
}

/** A `part 'x.g.dart';` whose file is one of the generator's outputs. */
function declaresPart(text: string | undefined, path: string, outputs: readonly string[]): boolean {
  if (text === undefined) return false;
  return [...text.matchAll(/^\s*part\s+['"]([^'"]+)['"]\s*;/gm)].some((part) =>
    matchesAny(posix.join(posix.dirname(path), part[1] ?? ""), outputs),
  );
}

function safeYaml(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = parseYaml(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function regenerate(context: CheckContext, generator: Generator): Promise<Finding[]> {
  const { session } = context;
  const before = await snapshot(session, generator.outputs);
  try {
    const result = await execute(generator.command, [], {
      cwd: session.root,
      env: session.environment.env,
      shell: true,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
    if (result.code !== 0) {
      throw new Error(
        `${generator.command}: ${tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`}`,
      );
    }
    return differences(
      before,
      await snapshot(session, generator.outputs),
      generator.command,
      session,
    );
  } finally {
    await restore(session, before, generator.outputs);
  }
}

/** The outputs git sees, tracked or new and not ignored, with what each one holds. */
async function snapshot(
  session: Session,
  outputs: readonly string[],
): Promise<ReadonlyMap<string, Buffer>> {
  const paths = (await session.git.files()).filter((path) => matchesAny(path, outputs));
  const read = await Promise.all(
    paths.map(async (path) => {
      const content = await readFile(join(session.root, path)).catch(() => undefined);
      return content === undefined ? [] : [[path, content] as const];
    }),
  );
  return new Map(read.flat());
}

function differences(
  before: ReadonlyMap<string, Buffer>,
  after: ReadonlyMap<string, Buffer>,
  command: string,
  session: Session,
): Finding[] {
  const t = translator(session.lang);
  const name = `\`${command}\``;
  const changed = [...after]
    .filter(([path, content]) => {
      const was = before.get(path);
      return was !== undefined && !was.equals(content);
    })
    .map(([path]) => ({
      path,
      message: t(
        `no coincide con lo que genera ${name}: regenéralo`,
        `does not match what ${name} generates: regenerate it`,
      ),
    }));
  const created = [...after.keys()]
    .filter((path) => !before.has(path))
    .map((path) => ({
      path,
      message: t(
        `lo genera ${name} y no está en el repositorio`,
        `${name} generates it, and it is not in the repository`,
      ),
    }));
  const deleted = [...before.keys()]
    .filter((path) => !after.has(path))
    .map((path) => ({
      path,
      message: t(`ya no lo genera ${name}`, `${name} no longer generates it`),
    }));
  return [...changed, ...created, ...deleted];
}

/** Every output back as it was: what changed or went away is written again, what is new goes. */
async function restore(
  session: Session,
  before: ReadonlyMap<string, Buffer>,
  outputs: readonly string[],
): Promise<void> {
  const now = await snapshot(session, outputs);
  await Promise.all([
    ...[...now.keys()]
      .filter((path) => !before.has(path))
      .map((path) => rm(join(session.root, path), { force: true })),
    ...[...before]
      .filter(([path, content]) => !(now.get(path)?.equals(content) ?? false))
      .map(async ([path, content]) => {
        await mkdir(dirname(join(session.root, path)), { recursive: true });
        await writeFile(join(session.root, path), content);
      }),
  ]);
}
