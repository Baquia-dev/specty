// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  goImports,
  pythonImports,
  pythonProject,
  type ResolvedImport,
  rustImports,
} from "../../src";

/** `line specifier → target or package` for each import. */
const shown = (imports: readonly ResolvedImport[]) =>
  imports.map((edge) => {
    const to = "target" in edge ? edge.target : `pkg:${edge.package}`;
    return `${edge.line ?? "?"} ${edge.specifier} → ${to}`;
  });

describe("the import scanners of layers", () => {
  it("read Python's imports, resolved in the project or to their package", () => {
    const project = pythonProject([
      "src/app/__init__.py",
      "src/app/domain/user.py",
      "src/app/infra/db.py",
      "src/app/infra/models/order.py",
      "src/app/services/billing.py",
      "scripts/seed.py",
    ]);
    const text = [
      "import os, json as j",
      "from app.domain.user import User",
      "import app.infra.db",
      "from app.infra.models import order",
      "from . import billing",
      "from ..domain import user",
      "from fastapi import FastAPI  # the web framework",
      "x = 'import fake'",
    ].join("\n");
    expect(shown(pythonImports("src/app/services/api.py", text, project))).toEqual([
      "1 os → pkg:os",
      "1 json → pkg:json",
      "2 app.domain.user → src/app/domain/user.py",
      "3 app.infra.db → src/app/infra/db.py",
      "4 app.infra.models → src/app/infra/models/__init__.py",
      "5 . → src/app/services/__init__.py",
      "6 ..domain → src/app/domain/__init__.py",
      "7 fastapi → pkg:fastapi",
    ]);
  });

  it("read Go's imports, in a line and in a block, against the module of go.mod", () => {
    const text = [
      "package api",
      "",
      'import "fmt"',
      "import (",
      '\tdomain "example.com/shop/internal/domain"',
      '\t"github.com/gin-gonic/gin"',
      '\t// "example.com/shop/internal/old"',
      '\t_ "example.com/shop"',
      ")",
    ].join("\n");
    expect(
      shown(
        goImports("services/api/handler.go", text, { path: "example.com/shop", dir: "services" }),
      ),
    ).toEqual([
      "3 fmt → pkg:fmt",
      "5 example.com/shop/internal/domain → services/internal/domain/*.go",
      "6 github.com/gin-gonic/gin → pkg:github.com/gin-gonic/gin",
      "8 example.com/shop → services/*.go",
    ]);
  });

  it("read Rust's use statements and extern crates, from the crate's src or the file's module", () => {
    const text = [
      "use std::collections::HashMap;",
      "use crate::domain::{user::User, order};",
      "pub use crate::infra::db::Pool as DbPool;",
      "use super::config::Settings;",
      "use self::helpers::format;",
      "use serde::{",
      "    Deserialize,",
      "    Serialize,",
      "};",
      "extern crate log;",
      'let s = "use crate::fake;";',
    ].join("\n");
    expect(shown(rustImports("crates/shop/src/api/handlers.rs", text))).toEqual([
      "1 std::collections::HashMap → pkg:std",
      "2 crate::domain → crates/shop/src/domain.rs",
      "3 crate::infra::db::Pool → crates/shop/src/infra/db/Pool.rs",
      "4 super::config::Settings → crates/shop/src/api/config/Settings.rs",
      "5 self::helpers::format → crates/shop/src/api/handlers/helpers/format.rs",
      "6 serde → pkg:serde",
      "10 log → pkg:log",
    ]);
    expect(shown(rustImports("src/api/mod.rs", "use super::domain::User;"))).toEqual([
      "1 super::domain::User → src/domain/User.rs",
    ]);
  });
});
