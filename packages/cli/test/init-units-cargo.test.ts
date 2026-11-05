// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { cargoWorkspace } from "../src/detect/units-cargo";
import { jsWorkspace } from "../src/detect/units-js";
import { DETECTORS } from "../src/detect/workspace-units";
import { cli, tempRepo } from "./support";

const TITLE = "UNIDADES DE VERIFICACIÓN PROPUESTAS";

/** A member's `Cargo.toml`, named `name`, with a path dependency on each of `uses`. */
const member = (name: string, uses: Readonly<Record<string, string>> = {}) =>
  [
    "[package]",
    `name = "${name}"`,
    'version = "0.1.0"',
    "",
    "[dependencies]",
    ...Object.entries(uses).map(([dep, path]) => `${dep} = { path = "${path}" }`),
    "",
  ].join("\n");

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The units of the block in `out`: its lines, without the block's indent, read under `verify:`. */
function proposed(out: string): unknown {
  const after = (out.split(`${TITLE}:\n`)[1] ?? "").split("\n");
  const end = after.findIndex((line) => !line.startsWith("  "));
  const lines = (end < 0 ? after : after.slice(0, end)).map((line) => line.slice(2));
  const yaml = lines.filter((line) => line === "  units:" || line.startsWith("    "));
  const doc: unknown = parse(`verify:\n${yaml.join("\n")}\n`);
  return isRecord(doc) && isRecord(doc.verify) ? doc.verify.units : undefined;
}

describe("specty init in a Cargo workspace", () => {
  it("AC2: proposes the static checks and one unit per member, with `cargo test -p` and the folders it uses", async () => {
    const root = await tempRepo({
      "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n',
      "Cargo.lock": "version = 4\n",
      "crates/core/Cargo.toml": member("demo-core"),
      "crates/cli/Cargo.toml": member("demo-cli", { "demo-core": "../core" }),
    });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(proposed(result.out)).toEqual([
      { name: "estático", command: "cargo clippy -- -D warnings", paths: ["**"] },
      {
        name: "core",
        command: "cargo test -p demo-core",
        paths: ["crates/core/**", "Cargo.toml", "Cargo.lock"],
      },
      {
        name: "cli",
        command: "cargo test -p demo-cli",
        paths: ["crates/cli/**", "crates/core/**", "Cargo.toml", "Cargo.lock"],
      },
    ]);
  });

  it("AC2: proposes nothing with a single member", async () => {
    const root = await tempRepo({
      "Cargo.toml": '[workspace]\nmembers = ["crates/core"]\n',
      "crates/core/Cargo.toml": member("demo-core"),
    });
    expect((await cli(root, ["init", "--language", "es"])).out).not.toContain(TITLE);
  });

  it("AC2: tries the Cargo detector after the pnpm, npm and yarn one", () => {
    expect(DETECTORS[0]).toBe(jsWorkspace);
    expect(DETECTORS.indexOf(cargoWorkspace)).toBeGreaterThan(0);
  });
});
