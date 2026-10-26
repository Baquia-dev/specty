// SPDX-License-Identifier: Apache-2.0
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzerIgnores, type Finding, translator } from "@baquia-dev/specty-core";
import { parse as parseYaml } from "yaml";
import { isRecord, parseJson, readText } from "../io/files";
import type { CheckContext, CheckDefinition, Provider } from "./provider";

/**
 * The Dart provider (ADR 0012). `dart-strict` keeps the analyzer in strict mode: its three modes
 * on in `analysis_options.yaml`, by its own options or by what it includes, and no comment that
 * switches it off added by the change.
 */

const STRICT_MODES = ["strict-casts", "strict-inference", "strict-raw-types"] as const;
type StrictMode = (typeof STRICT_MODES)[number];

/** Includes followed at most, so that a cycle or a long chain ends. */
const MAX_DEPTH = 5;

interface Options {
  readonly modes: Readonly<Partial<Record<StrictMode, boolean>>>;
  /** Includes that could not be read. */
  readonly unresolved: readonly string[];
}

const dartStrict: CheckDefinition = {
  id: "dart-strict",
  async run(context) {
    const t = translator(context.session.lang);
    const file = join(context.session.root, "analysis_options.yaml");
    const options = await optionsOf(context.session.root, file, 0, new Set());
    return { findings: [...modeFindings(options, t), ...(await ignoreFindings(context, t))] };
  },
};

export const dartProvider: Provider = {
  id: "dart",
  applies: (stacks) => stacks.some((stack) => stack.language === "dart"),
  checks: [dartStrict],
};

function modeFindings(options: Options, t: ReturnType<typeof translator>): Finding[] {
  const missing = STRICT_MODES.filter((mode) => options.modes[mode] !== true);
  if (missing.length === 0) return [];
  const path = "analysis_options.yaml";
  // An include that could not be read may bring the modes: only a warning, until `pub get`.
  if (options.unresolved.length > 0) {
    return options.unresolved.map(
      (uri): Finding => ({
        path,
        severity: "warning",
        message: t(
          `no encuentro \`${uri}\` (¿falta \`dart pub get\`?): no sé si trae el modo estricto`,
          `cannot find \`${uri}\` (is \`dart pub get\` missing?): cannot tell whether it brings the strict mode`,
        ),
      }),
    );
  }
  return [
    {
      path,
      message: t(
        `el analizador no está en modo estricto: pon a true ${listed(missing, "y")} en \`analyzer.language\``,
        `the analyzer is not in strict mode: set ${listed(missing, "and")} to true in \`analyzer.language\``,
      ),
    },
  ];
}

async function ignoreFindings(
  context: CheckContext,
  t: ReturnType<typeof translator>,
): Promise<Finding[]> {
  const found = await Promise.all(
    context.files
      .filter((path) => path.endsWith(".dart"))
      .map(async (path): Promise<Finding[]> => {
        const text = await context.read(path);
        if (text === undefined) return [];
        return analyzerIgnores(text)
          .filter(({ line }) => context.added(path)?.has(line) ?? true)
          .map(({ line, scope }) => ({
            path,
            line,
            message:
              scope === "file"
                ? t(
                    "`// ignore_for_file:` apaga el analizador en todo el archivo",
                    "`// ignore_for_file:` switches the analyzer off for the whole file",
                  )
                : t(
                    "`// ignore:` apaga el analizador en esa línea",
                    "`// ignore:` switches the analyzer off for that line",
                  ),
          }));
      }),
  );
  return found.flat();
}

/** The modes of `file` and of what it includes; its own options win over the included ones. */
async function optionsOf(
  root: string,
  file: string,
  depth: number,
  seen: Set<string>,
): Promise<Options> {
  const parsed = safeYaml(await readText(file));
  if (parsed === undefined) return { modes: {}, unresolved: [] };
  seen.add(file);
  let modes: Partial<Record<StrictMode, boolean>> = {};
  const unresolved: string[] = [];
  for (const uri of includesOf(parsed)) {
    const target = await locate(root, file, uri);
    const text = target === undefined ? undefined : await readText(target);
    if (target === undefined || text === undefined) {
      unresolved.push(uri);
    } else if (!seen.has(target) && depth < MAX_DEPTH) {
      const included = await optionsOf(root, target, depth + 1, seen);
      modes = { ...modes, ...included.modes };
      unresolved.push(...included.unresolved);
    }
  }
  return { modes: { ...modes, ...ownModes(parsed) }, unresolved };
}

function includesOf(options: Record<string, unknown>): string[] {
  const { include } = options;
  const all = Array.isArray(include) ? include : [include];
  return all.filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
}

function ownModes(options: Record<string, unknown>): Partial<Record<StrictMode, boolean>> {
  const analyzer = isRecord(options.analyzer) ? options.analyzer : {};
  const language = isRecord(analyzer.language) ? analyzer.language : {};
  return Object.fromEntries(
    STRICT_MODES.flatMap((mode) => {
      const value = language[mode];
      return typeof value === "boolean" ? [[mode, value]] : [];
    }),
  );
}

/** Where an include lives: `package:` through `.dart_tool/package_config.json`, else relative. */
async function locate(root: string, from: string, uri: string): Promise<string | undefined> {
  if (!uri.startsWith("package:")) return resolve(dirname(from), uri);
  const [name, ...rest] = uri.slice("package:".length).split("/");
  const config = parseJson(await readText(join(root, ".dart_tool", "package_config.json")));
  const packages: unknown[] =
    isRecord(config) && Array.isArray(config.packages) ? config.packages : [];
  const entry = packages.find((candidate) => isRecord(candidate) && candidate.name === name);
  if (!isRecord(entry) || typeof entry.rootUri !== "string") return undefined;
  const base = entry.rootUri.startsWith("file:")
    ? fileURLToPath(entry.rootUri)
    : resolve(root, ".dart_tool", entry.rootUri);
  const inside = typeof entry.packageUri === "string" ? entry.packageUri : "lib/";
  return join(base, inside, ...rest);
}

function safeYaml(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = parseYaml(text);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

/** `a, b y c` or `a, b and c`. */
function listed(items: readonly string[], and: string): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1) ?? ""}`;
}
