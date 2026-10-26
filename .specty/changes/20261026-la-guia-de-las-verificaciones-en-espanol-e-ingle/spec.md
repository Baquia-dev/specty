---
kind: standard
follows:
  - 20261026-task-done-ejecuta-specty-check-y-el-archivo-de-r
---

# La guía de las verificaciones en español e inglés

## Objetivo

Una guía en español y otra en inglés explican cada verificación de `specty check`: qué comprueba, en qué stacks, cómo se configura y cómo se desactiva. Explican también dónde se ejecuta y cómo añadir un proveedor para otro stack (Java, Kotlin, PHP, Ruby, .NET). Un test comprueba que las dos documentan exactamente las verificaciones que existen.

## Fuera de alcance

- Los repositorios de ejemplo por stack (Angular, NestJS, Flutter) con un caso positivo y uno negativo de cada verificación: van en el cambio siguiente.
- Traducir al inglés `docs/formats.md` o `docs/ARCHITECTURE.md`.
- Proveedores nuevos.

## Supuestos

- A1: Las guías son `docs/checks.md` (español) y `docs/checks.en.md` (inglés), enlazadas entre sí y desde `docs/formats.md` §6; el resto de `docs/` sigue en español. `formats.md` sigue siendo la referencia del formato, y las guías remiten a él para el detalle.
  - impacto: alto
- A2: Cada verificación tiene en las dos guías una sección cuyo título es su id entre comillas invertidas. El test toma los ids de una ejecución real de `specty check --spec --verbose --json` en un repositorio donde aplican todos los proveedores (TypeScript y Dart, capas, un generador, los cuatro comandos y un cambio aprobado) y los compara con esos títulos.

## Criterios de aceptación

- AC1: CUANDO se lee `docs/checks.md` o `docs/checks.en.md` ENTONCES cada verificación dice qué comprueba, en qué stacks, cómo se configura y cómo se desactiva.
- AC2: CUANDO una verificación existe y una de las guías no la documenta, o la guía documenta una que no existe, ENTONCES un test falla.
- AC3: CUANDO alguien quiere añadir un stack (Java, Kotlin, PHP, Ruby, .NET) ENTONCES la guía explica la interfaz, los pasos y lo que ya funciona sin un proveedor propio, con un ejemplo.

## Archivos

- crear docs/checks.md — la guía en español
- crear docs/checks.en.md — la guía en inglés
- modificar docs/formats.md — el enlace a las guías
- crear packages/cli/test/check-docs.test.ts — las guías documentan las verificaciones que existen

## Tareas

- [x] T1: Las guías de las verificaciones y su test
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md, packages/cli/test/check-docs.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
