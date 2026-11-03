// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo, writeFiles } from "./support";

/**
 * What `doctor` asks each one to add. Vite and Metro compare absolute paths, so theirs is anchored
 * to the config's folder: an unanchored pattern would also exclude their own files inside a worktree.
 */
const VITE = `\`\${import.meta.dirname}/.worktrees/**\``;
const METRO = `new RegExp(\`^\${__dirname}/\\\\.worktrees/\`)`;
const VITEST = '"**/.worktrees/**"';

const seen = (name: string, add: string, file: string) =>
  `${name} también revisa .worktrees/, que escribe Specty: añade ${add} en ${file}.`;

/** The doctor of a project where `new` already made a change in `.worktrees/`. */
async function doctorWith(files: Readonly<Record<string, string>>) {
  const root = await tempRepo({ ...APP, ...files });
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return { root, doctor: await cli(root, ["doctor"]) };
}

describe("doctor and the dev servers that would watch the changes' worktrees", () => {
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

    // An Expo app without a Metro config of its own.
    const { doctor: expo } = await doctorWith({
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
        `  server: { watch: { ignored: [\`\${import.meta.dirname}/.worktrees/**\`] } },`,
        '  test: { exclude: ["**/node_modules/**", "**/.worktrees/**"] },',
        "};",
        "",
      ].join("\n"),
      "metro.config.js": [
        "module.exports = {",
        `  resolver: { blockList: [new RegExp(\`^\${__dirname}/\\\\.worktrees/\`)] },`,
        "};",
        "",
      ].join("\n"),
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
  });
});
