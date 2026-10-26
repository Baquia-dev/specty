// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Two layers, `domain` and `infra`, where the domain may import neither infra nor `forbidden`. */
const layers = (domain: string, infra: string, forbidden: string) =>
  [
    "checks:",
    "  levels: { secrets: off, tests: off, lint: off }",
    "  layers:",
    `    domain: { paths: ["${domain}"], forbiddenPackages: ["${forbidden}"] }`,
    `    infra: { paths: ["${infra}"], may: [domain] }`,
    "",
  ].join("\n");

/** The block of `layers` in the report of `specty check` (`--changed`). */
async function layersBlock(root: string): Promise<string> {
  const out = (await cli(root, ["check"])).out.split("\n");
  const start = out.indexOf("FALLA layers");
  if (start === -1) return "";
  const end = out.findIndex((line, index) => index > start && !line.startsWith("  "));
  return out.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("layers in Python, Go and Rust (AC1, AC2, AC3)", () => {
  it("reads Python's imports, and leaves out the ones that were already there", async () => {
    const root = await tempRepo({
      "pyproject.toml": '[project]\nname = "app"\n',
      "src/app/__init__.py": "",
      "src/app/domain/user.py": "class User:\n    pass\n",
      "src/app/domain/old.py": "from app.infra.db import legacy\n",
      "src/app/infra/db.py": "def connect():\n    pass\n",
      ".specty/config.yaml": `${CONFIG()}${layers("src/app/domain/**", "src/app/infra/**", "requests")}`,
    });
    await writeFiles(root, {
      "src/app/domain/user.py":
        "from app.infra.db import connect\nimport requests\nfrom . import old\n\nclass User:\n    pass\n",
      "src/app/domain/old.py": "from app.infra.db import legacy\n\nLEGACY = 1\n",
    });
    expect(await layersBlock(root)).toBe(
      [
        "FALLA layers",
        "  src/app/domain/user.py:1 `domain` no puede importar `infra` (src/app/infra/db.py)",
        "  src/app/domain/user.py:2 `domain` no puede importar el paquete `requests`",
      ].join("\n"),
    );
  });

  it("reads Go's imports against the module of go.mod", async () => {
    const root = await tempRepo({
      "go.mod": "module example.com/shop\n\ngo 1.23\n",
      "internal/domain/user.go": "package domain\n",
      "internal/infra/db.go": "package infra\n",
      ".specty/config.yaml": `${CONFIG()}${layers("internal/domain/**", "internal/infra/**", "github.com/jackc/*")}`,
    });
    await writeFiles(root, {
      "internal/domain/user.go": [
        "package domain",
        "",
        "import (",
        '\t"fmt"',
        '\t"example.com/shop/internal/infra"',
        '\t"github.com/jackc/pgx"',
        ")",
        "",
      ].join("\n"),
    });
    expect(await layersBlock(root)).toBe(
      [
        "FALLA layers",
        "  internal/domain/user.go:5 `domain` no puede importar `infra` (internal/infra/*.go)",
        "  internal/domain/user.go:6 `domain` no puede importar el paquete `github.com/jackc/pgx`",
      ].join("\n"),
    );
  });

  it("reads Rust's use statements from the crate's src", async () => {
    const root = await tempRepo({
      "Cargo.toml": '[package]\nname = "shop"\n',
      "src/domain/user.rs": "pub struct User;\n",
      "src/infra/db.rs": "pub struct Pool;\n",
      ".specty/config.yaml": `${CONFIG()}${layers("src/domain/**", "src/infra/**", "sqlx")}`,
    });
    await writeFiles(root, {
      "src/domain/user.rs": [
        "use std::fmt;",
        "use crate::infra::db::Pool;",
        "use sqlx::{PgPool, Row};",
        "use super::order::Order;",
        "pub struct User;",
        "",
      ].join("\n"),
    });
    expect(await layersBlock(root)).toBe(
      [
        "FALLA layers",
        "  src/domain/user.rs:2 `domain` no puede importar `infra` (src/infra/db/Pool.rs)",
        "  src/domain/user.rs:3 `domain` no puede importar el paquete `sqlx`",
      ].join("\n"),
    );
  });
});
