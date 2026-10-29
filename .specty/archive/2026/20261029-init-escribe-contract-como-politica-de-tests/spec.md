---
kind: quick
---

# init escribe contract como política de tests

## Objetivo

ADR 0014 dejó `policy.tests: contract` como opción hasta probarlo en este repositorio, que lo usa desde el 2026-10-28 con una épica y varios cambios. La persona decidió que pase a ser el valor por defecto: desde este cambio, `init` escribe `tests: contract` en la configuración de un proyecto nuevo. Una configuración que ya existe no cambia, porque `init` no toca su política. Una configuración sin la clave sigue resolviéndose como `recommended`, para no cambiarle el flujo al actualizar Specty a un proyecto que ya existía. El test que fijaba `tests: recommended` en la plantilla pasa a fijar `tests: contract`, porque es justo lo que cambia.

## Archivos

- modificar packages/core/src/templates.ts — la plantilla de `config.yaml` escribe `tests: contract`
- modificar packages/core/test/templates.test.ts — la plantilla con `tests: contract`
- modificar docs/formats.md — §6: lo que escribe `init` y lo que vale sin la clave
- modificar docs/ARCHITECTURE.md — §19, pregunta 5: resuelta
- modificar docs/decisions/0014-los-tests-como-contrato.md — `contract` por defecto en los proyectos nuevos

## Tareas

- [x] T1: init escribe contract como política de tests
  - files: packages/core/src/templates.ts, packages/core/test/templates.test.ts, docs/formats.md, docs/ARCHITECTURE.md, docs/decisions/0014-los-tests-como-contrato.md
  - verify: pnpm typecheck && pnpm lint && pnpm --filter @baquia-dev/specty-core exec vitest run test/templates.test.ts
  - type: feat

## Cierre

### Resumen

La plantilla de config.yaml escribe tests: contract (sin la clave sigue recommended); templates.test.ts visto en rojo; config-fill.test.ts: la tarea del manifiesto pasa a type build, con OK de la persona; formats §6, ARCHITECTURE §19.5, ADR 0014
