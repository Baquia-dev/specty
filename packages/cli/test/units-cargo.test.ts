// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cargoWorkspace } from "../src/detect/units-cargo";
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
      tempRepo({ "Cargo.toml": `${member("demo")}\n${ROOT}`, ...MEMBERS }),
      tempRepo({ "Cargo.toml": "[workspace\nmembers = [", ...MEMBERS }),
    ]);
    const found = await Promise.all(roots.map((root) => cargoWorkspace(root)));
    expect(found).toEqual([undefined, undefined, undefined, undefined]);
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
