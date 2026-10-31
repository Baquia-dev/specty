---
kind: quick
---

# Scaffolding con comandos del framework en proyectos nuevos

## Objetivo

Establecer como regla inquebrantable que en proyectos nuevos el andamiaje inicial se genere con comandos de scaffolding del framework seleccionado (para ahorrar tiempo y tokens), con una excepción estricta y acotada en los alcances de la spec del esqueleto (`bootstrap`) que permite globs y no se propaga a cambios posteriores.

## Archivos

- modificar packages/core/src/agents-md.ts — regla inquebrantable en AGENTS.md sobre scaffolding con comandos del framework y alcance acotado
- modificar packages/core/src/templates.ts — pistas de bootstrap y especificaciones estándar aclarando el uso de comandos de scaffolding y la excepción estricta de globs
- modificar packages/core/test/agents-md.test.ts — comprobación de la regla de scaffolding y excepción de alcance en el bloque de flujo
- modificar docs/ARCHITECTURE.md — documentación de la regla de scaffolding y no dispersión de la excepción de alcance

## Tareas

- [x] T1: Incorporar regla de scaffolding con framework y excepción única de alcance
  - files: packages/core/src/agents-md.ts, packages/core/src/templates.ts, packages/core/test/agents-md.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core test
