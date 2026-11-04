// SPDX-License-Identifier: Apache-2.0
import { rename } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo, writeFiles } from "./support";

/**
 * What `doctor` asks each one to add. Vite and Metro compare absolute paths, so theirs is anchored
 * to the config's folder: an unanchored pattern would also exclude their own files inside a worktree.
 * Neither puts the folder's path in a glob or a regular expression as it is: Vite's compares the
 * start of the path, and Metro's escapes it and takes either separator.
 */
const VITE = `(file) => file.startsWith(\`\${import.meta.dirname.replaceAll("\\\\", "/")}/.worktrees/\`)`;
const METRO = `new RegExp(\`^\${__dirname.replace(/[\\\\^$.*+?()[\\]{}|]/g, "\\\\$&")}[/\\\\\\\\]\\\\.worktrees[/\\\\\\\\]\`)`;
const VITEST = '"**/.worktrees/**"';
/** Rsbuild's native watcher may hand its function `\` on Windows: the file's path goes to `/` too. */
const RSBUILD = `(file) => file.replaceAll("\\\\", "/").startsWith(\`\${import.meta.dirname.replaceAll("\\\\", "/")}/.worktrees/\`)`;
const FORK_TS_CHECKER = "fork-ts-checker-webpack-plugin";
const RSBUILD_CHECKER = "@rsbuild/plugin-type-check";
/** The forms asked before, with the folder's path as it is: they only work without special characters. */
const VITE_BEFORE = `\`\${import.meta.dirname}/.worktrees/**\``;
const METRO_BEFORE = `new RegExp(\`^\${__dirname}/\\\\.worktrees/\`)`;

const seen = (name: string, add: string, file: string) =>
  `${name} también revisa .worktrees/, que escribe Specty: añade ${add} en ${file}.`;

/**
 * The doctor of a project where `new` already made a change in `.worktrees/`; with `suffix`, the
 * project's folder gets it added to its name first.
 */
async function doctorWith(files: Readonly<Record<string, string>>, suffix?: string) {
  const made = await tempRepo({ ...APP, ...files });
  const root = suffix === undefined ? made : `${made} ${suffix}`;
  if (root !== made) await rename(made, root);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return { root, doctor: await cli(root, ["doctor"]) };
}

/**
 * The same, with `files` written once the change exists: a `package.json` with dependencies in the
 * commit would make `new` install them in the worktree.
 */
async function doctorAfter(files: Readonly<Record<string, string>>) {
  const { root } = await doctorWith({});
  await writeFiles(root, files);
  return { root, doctor: await cli(root, ["doctor"]) };
}

const viteConfig = (ignored: string) =>
  `export default { server: { watch: { ignored: [${ignored}] } } };\n`;
const metroConfig = (blocked: string) =>
  `module.exports = { resolver: { blockList: [${blocked}] } };\n`;

describe("doctor and the dev servers that would watch the changes' worktrees", () => {
  it("AC1: asks Astro for Vite's exclusion in its config, and says it excludes it once there", async () => {
    const { root, doctor } = await doctorWith({
      "astro.config.mjs": "export default { vite: {} };\n",
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen("Astro", VITE, "astro.config.mjs (vite.server.watch.ignored)"),
    );

    await writeFiles(root, {
      "astro.config.mjs": `export default { vite: { server: { watch: { ignored: [${VITE}] } } } };\n`,
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain("Astro excluye .worktrees/.");
    expect(fixed.out).not.toContain("también revisa .worktrees/");
  });

  it("AC2: asks fork-ts-checker for .worktrees in tsconfig.json's exclude, or takes it from webpack.config", async () => {
    const { root, doctor } = await doctorAfter({
      "package.json": `{ "name": "x", "devDependencies": { "${FORK_TS_CHECKER}": "^9.1.0" } }\n`,
      "tsconfig.json": '{ "compilerOptions": { "strict": true } }\n',
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen(FORK_TS_CHECKER, '"node_modules", ".worktrees"', "tsconfig.json (exclude)"),
    );

    await writeFiles(root, {
      "tsconfig.json":
        '{ "compilerOptions": { "strict": true }, "exclude": ["node_modules", ".worktrees"] }\n',
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain(`${FORK_TS_CHECKER} excluye .worktrees/.`);
    expect(fixed.out).not.toContain("también revisa .worktrees/");

    // Or in the plugin's own options, in webpack's config.
    await writeFiles(root, {
      "tsconfig.json": '{ "compilerOptions": { "strict": true } }\n',
      "webpack.config.mjs":
        'export default { plugins: [new ForkTsCheckerWebpackPlugin({ typescript: { configOverwrite: { exclude: ["node_modules", ".worktrees"] } } })] };\n',
    });
    const plugin = await cli(root, ["doctor"]);
    expect(plugin.out).toContain(`${FORK_TS_CHECKER} excluye .worktrees/.`);
  });

  it("AC3: asks Rsbuild's type checker for the function in rsbuild.config's watchOptions", async () => {
    const { root, doctor } = await doctorAfter({
      "package.json": `{ "name": "x", "devDependencies": { "@rsbuild/core": "^2.3.1", "${RSBUILD_CHECKER}": "^1.6.1" } }\n`,
      "rsbuild.config.mjs": "export default { plugins: [pluginTypeCheck()] };\n",
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      seen(RSBUILD_CHECKER, RSBUILD, "rsbuild.config.mjs (tools.rspack.watchOptions.ignored)"),
    );

    await writeFiles(root, {
      "rsbuild.config.mjs": [
        "export default {",
        "  plugins: [pluginTypeCheck()],",
        `  tools: { rspack: { watchOptions: { ignored: ${RSBUILD} } } },`,
        "};",
        "",
      ].join("\n"),
    });
    const fixed = await cli(root, ["doctor"]);
    expect(fixed.out).toContain(`${RSBUILD_CHECKER} excluye .worktrees/.`);
    expect(fixed.out).not.toContain("también revisa .worktrees/");
  });

  it("AC4: asks Vite for the anchored exclusion, and Vitest configured in vite.config for its own", async () => {
    const { doctor } = await doctorWith({
      "vite.config.ts":
        'export default { server: { port: 3000 }, test: { include: ["src/**/*.test.ts"] } };\n',
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(seen("Vite", VITE, "vite.config.ts (server.watch.ignored)"));
    expect(doctor.out).toContain(seen("Vitest", VITEST, "vite.config.ts (test.exclude)"));

    // With a vitest.config of its own, Vitest is asked there, not in vite.config.
    const { doctor: apart } = await doctorWith({
      "vite.config.ts": "export default { server: { port: 3000 } };\n",
      "vitest.config.ts": "export default { test: {} };\n",
    });
    expect(apart.out).toContain(seen("Vite", VITE, "vite.config.ts (server.watch.ignored)"));
    expect(apart.out).toContain(seen("Vitest", VITEST, "vitest.config.ts (test.exclude)"));
    expect(apart.out).not.toContain("vite.config.ts (test.exclude)");
  });

  it("AC5: asks Metro for the anchored exclusion in its config, or in metro.config.js when it has none", async () => {
    const { doctor } = await doctorWith({
      "metro.config.js": "module.exports = { resolver: {} };\n",
    });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(seen("Metro", METRO, "metro.config.js (resolver.blockList)"));

    // An Expo app without a Metro config of its own, written once the change exists: in the
    // commit, `new` would install Expo and React Native from the network.
    const { doctor: expo } = await doctorAfter({
      "package.json":
        '{ "name": "x", "dependencies": { "expo": "^55.0.0", "react-native": "0.85.0" } }\n',
    });
    expect(expo.code).toBe(1);
    expect(expo.out).toContain(seen("Metro", METRO, "metro.config.js (resolver.blockList)"));
  });

  it("AC6: says each excludes it once anchored, and keeps asking Vite for the anchored form", async () => {
    const { root } = await doctorWith({
      "vite.config.ts": "export default { test: {} };\n",
      "metro.config.js": "module.exports = {};\n",
    });
    await writeFiles(root, {
      "vite.config.ts": [
        "export default {",
        `  server: { watch: { ignored: [${VITE}] } },`,
        '  test: { exclude: ["**/node_modules/**", "**/.worktrees/**"] },',
        "};",
        "",
      ].join("\n"),
      "metro.config.js": metroConfig(METRO),
    });
    const doctor = await cli(root, ["doctor"]);
    for (const name of ["Vite", "Vitest", "Metro"]) {
      expect(doctor.out).toContain(`${name} excluye .worktrees/.`);
    }
    expect(doctor.out).not.toContain("también revisa .worktrees/");

    // Unanchored, the pattern would exclude Vite's own files inside a worktree: not enough.
    await writeFiles(root, {
      "vite.config.ts":
        'export default { server: { watch: { ignored: ["**/.worktrees/**"] } } };\n',
    });
    const naive = await cli(root, ["doctor"]);
    expect(naive.out).toContain(seen("Vite", VITE, "vite.config.ts (server.watch.ignored)"));

    // Without special characters in the project's path, the forms asked before work too.
    await writeFiles(root, {
      "vite.config.ts": viteConfig(VITE_BEFORE),
      "metro.config.js": metroConfig(METRO_BEFORE),
    });
    const before = await cli(root, ["doctor"]);
    for (const name of ["Vite", "Metro"]) {
      expect(before.out).toContain(`${name} excluye .worktrees/.`);
    }
  });

  it("AC7: in a folder with parentheses and brackets, only takes the forms that don't put its path in a pattern", async () => {
    const { root, doctor } = await doctorWith(
      { "vite.config.ts": viteConfig(VITE_BEFORE), "metro.config.js": metroConfig(METRO_BEFORE) },
      "(copia) [1]",
    );
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(seen("Vite", VITE, "vite.config.ts (server.watch.ignored)"));
    expect(doctor.out).toContain(seen("Metro", METRO, "metro.config.js (resolver.blockList)"));

    await writeFiles(root, {
      "vite.config.ts": viteConfig(VITE),
      "metro.config.js": metroConfig(METRO),
    });
    const fixed = await cli(root, ["doctor"]);
    for (const name of ["Vite", "Metro"]) {
      expect(fixed.out).toContain(`${name} excluye .worktrees/.`);
    }
    expect(fixed.out).not.toContain("también revisa .worktrees/");
  });
});
