// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Finding,
  globBase,
  type LayerViolation,
  layerOf,
  layerViolations,
  packageName,
  type ResolvedConfig,
  type ResolvedImport,
  translator,
} from "@baquia-dev/specty-core";
import { execute, tail } from "../io/exec";
import { exists, isRecord, parseJson, readText } from "../io/files";
import { scannedImports } from "./layer-scanners";
import type { CheckContext, CheckDefinition, Provider } from "./provider";

/**
 * The layers of `checks.layers` (ADR 0012). In TypeScript and JavaScript, the project's
 * dependency-cruiser resolves each import, the `tsconfig` aliases too; in Dart, the core's own
 * scanner reads them. Either way, the core decides which layer may import which.
 */

const SCRIPTS = /\.(?:[cm]?[jt]sx?)$/;
const LANGUAGES: ReadonlySet<string> = new Set([
  "typescript",
  "javascript",
  "dart",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "php",
]);

export function layersProvider(config: ResolvedConfig): Provider {
  const configured = Object.keys(config.checks.layers).length > 0;
  return {
    id: "layers",
    applies: (stacks) => configured && stacks.some((stack) => LANGUAGES.has(stack.language)),
    checks: [layers],
  };
}

const layers: CheckDefinition = {
  id: "layers",
  async run(context) {
    const { session } = context;
    const t = translator(session.lang);
    const { layers: rules } = session.config.checks;
    const inLayers = (path: string) => layerOf(path, rules) !== undefined;
    const scripts = await scriptImports(
      context,
      context.files.filter((path) => SCRIPTS.test(path) && inLayers(path)),
    );
    if ("skipped" in scripts) return scripts;
    const scanned = await scannedImports(context, context.files.filter(inLayers));
    const violations = layerViolations([...scripts.imports, ...scanned], rules);
    const findings = await Promise.all(
      violations.map(async (violation): Promise<Finding[]> => {
        const line =
          violation.line ?? lineOf((await context.read(violation.from)) ?? "", violation);
        if (line !== undefined && context.added(violation.from)?.has(line) === false) return [];
        return [
          {
            path: violation.from,
            ...(line !== undefined ? { line } : {}),
            message: messageOf(violation, t),
          },
        ];
      }),
    );
    // In the order of the files and their lines, not in the order dependency-cruiser found them.
    const ordered = findings
      .flat()
      .toSorted(
        (a, b) => (a.path ?? "").localeCompare(b.path ?? "") || (a.line ?? 0) - (b.line ?? 0),
      );
    return { findings: ordered };
  },
};

/**
 * The imports of the run's TypeScript and JavaScript files in the layers, by dependency-cruiser:
 * the files themselves, or the folders of the layers with `--all`. Without such files, it is not
 * needed at all.
 */
async function scriptImports(
  context: CheckContext,
  files: readonly string[],
): Promise<{ readonly imports: readonly ResolvedImport[] } | { readonly skipped: string }> {
  if (files.length === 0) return { imports: [] };
  const { session } = context;
  const bin = join(session.root, "node_modules", ".bin", "depcruise");
  if (!(await exists(bin))) {
    return {
      skipped: translator(session.lang)(
        "dependency-cruiser no está instalado: añádelo como devDependency del proyecto para vigilar las capas",
        "dependency-cruiser is not installed: add it as a devDependency of the project to watch the layers",
      ),
    };
  }
  const { layers: rules } = session.config.checks;
  const sources =
    context.mode === "all"
      ? [...new Set(Object.values(rules).flatMap((layer) => layer.paths.map(globBase)))]
      : files;
  const ours = new Set(files);
  return { imports: (await cruise(context, bin, sources)).filter((edge) => ours.has(edge.from)) };
}

/** The imports dependency-cruiser resolves from `sources`; its report goes to a file. */
async function cruise(
  context: CheckContext,
  bin: string,
  sources: readonly string[],
): Promise<ResolvedImport[]> {
  const { session } = context;
  const folder = await mkdtemp(join(tmpdir(), "specty-depcruise-"));
  try {
    const report = join(folder, "deps.json");
    const tsconfig = (await exists(join(session.root, "tsconfig.json")))
      ? ["--ts-config", "tsconfig.json"]
      : [];
    const result = await execute(
      bin,
      [
        "--no-config",
        // Without it, the imports TypeScript drops for being unused would not show.
        "--ts-pre-compilation-deps",
        ...tsconfig,
        "--do-not-follow",
        "node_modules",
        "--output-type",
        "json",
        "--output-to",
        report,
        ...sources,
      ],
      {
        cwd: session.root,
        env: session.environment.env,
        timeoutMs: session.config.verify.timeoutSec * 1000,
      },
    );
    if (result.code !== 0) {
      throw new Error(`dependency-cruiser: ${tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`}`);
    }
    return importsIn(parseJson(await readText(report)));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Each resolved import of the report: to a file, to a package or to Node's own modules. */
function importsIn(report: unknown): ResolvedImport[] {
  if (!isRecord(report) || !Array.isArray(report.modules)) {
    throw new Error("dependency-cruiser: unreadable report");
  }
  return report.modules.flatMap((module: unknown): ResolvedImport[] => {
    if (!isRecord(module) || typeof module.source !== "string") return [];
    const from = module.source;
    const dependencies: unknown[] = Array.isArray(module.dependencies) ? module.dependencies : [];
    return dependencies.flatMap((dependency): ResolvedImport[] => {
      if (!isRecord(dependency) || typeof dependency.module !== "string") return [];
      const specifier = dependency.module;
      const types: unknown[] = Array.isArray(dependency.dependencyTypes)
        ? dependency.dependencyTypes
        : [];
      if (dependency.coreModule === true) {
        return [
          { from, specifier, package: packageName(`node:${specifier.replace(/^node:/, "")}`) },
        ];
      }
      if (types.some((type) => typeof type === "string" && type.startsWith("npm"))) {
        return [{ from, specifier, package: packageName(specifier) }];
      }
      if (dependency.couldNotResolve === true || typeof dependency.resolved !== "string") return [];
      return [{ from, specifier, target: dependency.resolved }];
    });
  });
}

/**
 * The first line that holds the specifier between quotes; dependency-cruiser names `node:fs`
 * as `fs`, so a module of Node is looked for both ways.
 */
function lineOf(text: string, violation: LayerViolation): number | undefined {
  const { specifier, target } = violation;
  const written =
    "package" in target && target.package.startsWith("node:")
      ? [specifier, `node:${specifier}`]
      : [specifier];
  const quoted = written.flatMap((form) =>
    ['"', "'", "`"].map((quote) => `${quote}${form}${quote}`),
  );
  const index = text
    .split(/\r?\n/)
    .findIndex((line) => quoted.some((candidate) => line.includes(candidate)));
  return index === -1 ? undefined : index + 1;
}

function messageOf(violation: LayerViolation, t: ReturnType<typeof translator>): string {
  const layer = `\`${violation.layer}\``;
  if ("package" in violation.target) {
    const name = `\`${violation.target.package}\``;
    return t(
      `${layer} no puede importar el paquete ${name}`,
      `${layer} may not import the package ${name}`,
    );
  }
  const other = `\`${violation.target.layer}\``;
  return t(
    `${layer} no puede importar ${other} (${violation.target.path})`,
    `${layer} may not import ${other} (${violation.target.path})`,
  );
}
