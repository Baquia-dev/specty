---
kind: standard
follows:
  - 20261026-las-funciones-de-python-y-ruby
---

# Las capas en Python, Go y Rust

## Objetivo

La verificación `layers` vigila también los imports de Python, Go y Rust, con escáneres propios del core y sin herramientas externas, como ya hace en Dart. La regla de capas de `checks.layers` vale igual para todos. Es la primera parte del quinto corte del plan para los stacks más populares.

## Fuera de alcance

- Java, Kotlin y PHP (segunda parte) y C# (tercera parte).
- Los imports dinámicos (`importlib.import_module`, `__import__`) y las rutas completas de Rust escritas en el código sin `use`.
- Los módulos de Python fuera de la raíz del repositorio y de `src/`.

## Supuestos

- A1: En Python, cuentan `import a.b` (también varios separados por comas) y `from a.b import c`. Un módulo es del proyecto si existe como `a/b.py`, `a/b/__init__.py` o la carpeta `a/b`, en la raíz o bajo `src/`; si no, es el paquete `a`. Los imports relativos (`from .m import x`, `from .. import y`) se resuelven desde la carpeta del archivo y siempre son del proyecto.
  - impacto: alto
- A2: En Go, cuentan los `import "ruta"`, con o sin alias, en una línea y en bloque. Una ruta que empieza por el `module` de `go.mod` es una carpeta del proyecto, y su destino es `<carpeta>/*.go`; cualquier otra ruta es su paquete (`fmt`, `github.com/gin-gonic/gin`).
  - impacto: alto
- A3: En Rust, cuentan los `use` (también `pub use` y los que ocupan varias líneas, con su prefijo común hasta `{`) y `extern crate`. `crate::a::b` es la ruta `a/b` bajo el `src` del crate del archivo; `super::` y `self::` se resuelven desde el módulo del archivo; cualquier otro primer tramo es su crate (`std`, `serde`).
  - impacto: alto
- A4: Cada import resuelto lleva su línea, que `layerViolations` conserva, para que con `--changed` y `--staged` solo cuenten los imports de líneas añadidas también donde el especificador no va entre comillas.

## Criterios de aceptación

- AC1: CUANDO un archivo de Python, Go o Rust de una capa importa otra capa que no está en su `may`, o un paquete de sus `forbiddenPackages` ENTONCES `layers` falla con su ruta y la línea del import.
- AC2: CUANDO el import va a la misma capa, a un archivo sin capa o a un paquete permitido, o ya estaba antes del cambio ENTONCES no falla.
- AC3: CUANDO el repositorio es de Python, Go o Rust y tiene `checks.layers` ENTONCES la verificación aparece.
- AC4: CUANDO se leen las guías ENTONCES `layers` dice cómo se leen los imports en estos lenguajes y cómo se nombran sus paquetes.

## Archivos

- modificar packages/core/src/checks/layers.ts — la línea de cada import y de cada violación
- crear packages/core/src/checks/imports-python.ts — el escáner de Python
- crear packages/core/src/checks/imports-go.ts — el escáner de Go
- crear packages/core/src/checks/imports-rust.ts — el escáner de Rust
- modificar packages/core/src/index.ts — exportarlos
- crear packages/core/test/checks/imports.test.ts — un caso por escáner
- crear packages/cli/src/check/layer-scanners.ts — los escáneres de cada lenguaje, con lo que necesitan del proyecto
- modificar packages/cli/src/check/layers.ts — usar los escáneres y la línea de cada import
- crear packages/cli/test/check-layers-scanned.test.ts — la verificación en Python, Go y Rust
- modificar docs/checks.md — `layers` en estos lenguajes
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/formats.md — los escáneres

## Tareas

- [ ] T1: Los escáneres de Python, Go y Rust en el core
  - files: packages/core/src/checks/layers.ts, packages/core/src/checks/imports-python.ts, packages/core/src/checks/imports-go.ts, packages/core/src/checks/imports-rust.ts, packages/core/src/index.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/imports.test.ts test/checks/layers.test.ts
- [ ] T2: La verificación con los escáneres
  - files: packages/cli/src/check/layer-scanners.ts, packages/cli/src/check/layers.ts, packages/cli/test/check-layers-scanned.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-layers-scanned.test.ts test/check-layers.test.ts test/check-layers-dart.test.ts
- [ ] T3: Las capas en las guías y en formats
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
