// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Lang, translator } from "@baquia-dev/specty-core";
import { setupCommand } from "../detect/project";
import type { Stack } from "../detect/stack";
import { isRecord, parseJson } from "../io/files";

/**
 * The CI templates `specty check --install` writes: one per provider, each with its path and its
 * text for the repository's stack. Adding a provider (GitLab, Bitbucket, Azure) means adding a
 * function that returns its template; GitHub Actions is the first.
 */

export interface CiTemplate {
  readonly provider: string;
  /** Repository-relative. */
  readonly path: string;
  readonly text: string;
}

export interface CiContext {
  readonly stack: Stack | undefined;
  /** Exact version of Specty the template runs. */
  readonly version: string;
  /** The branch whose pushes it checks. */
  readonly branch: string;
  readonly lang: Lang;
}

const PROVIDERS: readonly ((context: CiContext) => CiTemplate)[] = [githubActions];

export function ciTemplates(context: CiContext): CiTemplate[] {
  return PROVIDERS.map((provider) => provider(context));
}

function githubActions({ stack, version, branch, lang }: CiContext): CiTemplate {
  const t = translator(lang);
  const flutter = stack?.language === "dart" && stack.tool === "flutter";
  const setup = stack === undefined ? undefined : setupCommand(stack);
  const steps = [
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    ...(stack?.tool === "pnpm" ? ["      - uses: pnpm/action-setup@v4"] : []),
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    ...(flutter
      ? ["      - uses: subosito/flutter-action@v2", "        with:", "          channel: stable"]
      : []),
    ...(stack?.language === "dart" && !flutter ? ["      - uses: dart-lang/setup-dart@v1"] : []),
    ...(setup === undefined ? [] : [`      - run: ${setup}`]),
    `      # ${t("`secrets` necesita Betterleaks o gitleaks en el runner; sin ellos, no corre.", "`secrets` needs Betterleaks or gitleaks on the runner; without them, it does not run.")}`,
    "      - name: specty check",
    "        shell: bash",
    `        run: npx -y @baquia-dev/specty@${version} check --all --json | tee specty-check.json`,
    "      - if: always()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: specty-check",
    "          path: specty-check.json",
  ];
  const text = [
    `# ${t("Las verificaciones de Specty (`specty check`). Lo creó `specty check --install`; puedes editarlo.", "Specty's checks (`specty check`). Written by `specty check --install`; you may edit it.")}`,
    "name: specty-check",
    "on:",
    "  pull_request:",
    "  push:",
    `    branches: [${branch}]`,
    "jobs:",
    "  check:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    ...steps,
    "",
  ].join("\n");
  return { provider: "github", path: ".github/workflows/specty-check.yml", text };
}

/** The version of this CLI, from the `package.json` of `@baquia-dev/specty` beside its code. */
export async function spectyVersion(): Promise<string> {
  let folder = dirname(fileURLToPath(import.meta.url));
  for (let level = 0; level < 4; level += 1) {
    const manifest = parseJson(
      await readFile(join(folder, "package.json"), "utf8").catch(() => ""),
    );
    if (
      isRecord(manifest) &&
      manifest.name === "@baquia-dev/specty" &&
      typeof manifest.version === "string"
    ) {
      return manifest.version;
    }
    folder = dirname(folder);
  }
  return "latest";
}
