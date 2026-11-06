// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { detectProject } from "../src/detect/project";
import { cargoWorkspace } from "../src/detect/units-cargo";
import { proposedUnits } from "../src/detect/workspace-units";
import { tempRepo } from "./support";

/** A member's `Cargo.toml`: its `[package]` named `name`, then `rest`. */
const member = (name: string, rest = "") =>
  `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n${rest}`;

/** A workspace's members: core, cli on core, http on a renamed core, gen on cli, and two that are not members. */
const MEMBERS = {
  "crates/core/Cargo.toml": member("demo-core", "\n[dependencies]\nserde = { workspace = true }\n"),
  "crates/cli/Cargo.toml": member(
    "demo-cli",
    '\n[dependencies]\ndemo-core = { workspace = true }\nclap = "4"\n\n[dev-dependencies]\ndemo-core = { workspace = true }\n',
  ),
  "crates/http/Cargo.toml": member(
    "demo-http",
    '\n[build-dependencies.core]\npath = "../core"\npackage = "demo-core"\n',
  ),
  "tools/gen/Cargo.toml": member(
    "demo-gen",
    '\n[target.\'cfg(unix)\'.dev-dependencies]\ncli = { path = "../../crates/cli", package = "demo-cli" }\n',
  ),
  "crates/legacy/Cargo.toml": member(
    "demo-legacy",
    '\n[dependencies]\ndemo-core = { path = "../core" }\n',
  ),
  "crates/docs/README.md": "# docs\n",
};

/** The root `Cargo.toml` of a virtual workspace with `MEMBERS`. */
const ROOT = [
  "[workspace]",
  'members = ["crates/*", "./tools/gen/"]',
  'exclude = ["crates/legacy"]',
  'resolver = "2"',
  "",
  "[workspace.dependencies]",
  'demo-core = { path = "crates/core" }',
  'serde = "1"',
  "",
].join("\n");

describe("the Cargo workspace detector", () => {
  it("AC2: reads each member with `cargo test -p` and the members it depends on", async () => {
    const root = await tempRepo({
      "Cargo.toml": ROOT,
      "Cargo.lock": "version = 4\n",
      "rust-toolchain.toml": '[toolchain]\nchannel = "stable"\n',
      ...MEMBERS,
    });
    expect(await cargoWorkspace(root)).toEqual({
      packages: [
        {
          dir: "crates/cli",
          name: "demo-cli",
          tests: true,
          uses: ["demo-core"],
          command: "cargo test -p demo-cli",
        },
        {
          dir: "crates/core",
          name: "demo-core",
          tests: true,
          uses: [],
          command: "cargo test -p demo-core",
        },
        {
          dir: "crates/http",
          name: "demo-http",
          tests: true,
          uses: ["demo-core"],
          command: "cargo test -p demo-http",
        },
        {
          dir: "tools/gen",
          name: "demo-gen",
          tests: true,
          uses: ["demo-cli"],
          command: "cargo test -p demo-gen",
        },
      ],
      shared: ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml"],
    });
  });

  it("AC2: finds no workspace without a `[workspace]`, with a root package, or with a manifest it cannot read", async () => {
    const roots = await Promise.all([
      tempRepo({ "README.md": "# demo\n" }),
      tempRepo({ "Cargo.toml": member("demo"), ...MEMBERS }),
      tempRepo({ "Cargo.toml": "[workspace\nmembers = [", ...MEMBERS }),
    ]);
    const found = await Promise.all(roots.map((root) => cargoWorkspace(root)));
    expect(found).toEqual([undefined, undefined, undefined]);
  });

  it("AC2: skips the members whose manifest has no package name", async () => {
    const root = await tempRepo({
      "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n',
      "crates/core/Cargo.toml": member("demo-core"),
      "crates/broken/Cargo.toml": "[package\n",
      "crates/unnamed/Cargo.toml": '[package]\nversion = "0.1.0"\n',
    });
    const facts = await cargoWorkspace(root);
    expect(facts?.packages.map((pkg) => pkg.dir)).toEqual(["crates/core"]);
    expect(facts?.shared).toEqual(["Cargo.toml"]);
  });
});

/** The files of a workspace whose root `Cargo.toml` is a package on core, besides `[workspace]`. */
const ROOTED = {
  "Cargo.toml": `${member("demo", "\n[dependencies]\ndemo-core = { workspace = true }\n")}\n${ROOT}`,
  "Cargo.lock": "version = 4\n",
  "build.rs": "fn main() {}\n",
  "src/main.rs": "fn main() {}\n",
  "tests/it.rs": "#[test]\nfn it() {}\n",
  "docs/guide.md": "# guía\n",
  ".github/workflows/ci.yml": "on: push\n",
  ...MEMBERS,
};

/** What the root package reads of its own: the root outside the members' folders and hidden ones. */
const ROOT_PATHS = [
  "Cargo.lock",
  "Cargo.toml",
  "build.rs",
  "crates/docs/**",
  "crates/legacy/**",
  "docs/**",
  "src/**",
  "tests/**",
];

describe("a Cargo workspace whose root is a package too", () => {
  it("AC2: reads the root as one more package, with `cargo test -p` and the root outside the members' folders", async () => {
    const root = await tempRepo(ROOTED);
    const facts = await cargoWorkspace(root);
    expect(facts?.packages.map((pkg) => pkg.dir)).toEqual([
      ".",
      "crates/cli",
      "crates/core",
      "crates/http",
      "tools/gen",
    ]);
    expect(facts?.packages[0]).toEqual({
      dir: ".",
      name: "demo",
      tests: true,
      uses: ["demo-core"],
      command: "cargo test -p demo",
      paths: ROOT_PATHS,
    });
    expect(facts?.shared).toEqual(["Cargo.toml", "Cargo.lock"]);
  });

  it("AC2: `init` proposes the root's unit, named as its package, besides one per member", async () => {
    const root = await tempRepo(ROOTED);
    const lines = (await proposedUnits(root, await detectProject(root, "demo"), "en")) ?? [];
    const at = lines.indexOf('    - name: "demo"');
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at + 1, at + 3)).toEqual([
      '      command: "cargo test -p demo"',
      `      paths: ${JSON.stringify([...ROOT_PATHS, "crates/core/**"])}`,
    ]);
    for (const name of ["cli", "core", "http", "gen"]) {
      expect(lines).toContain(`    - name: ${JSON.stringify(name)}`);
    }
  });
});
