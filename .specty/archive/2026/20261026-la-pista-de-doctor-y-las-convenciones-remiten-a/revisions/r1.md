---
kind: standard
---

# La pista de doctor y las convenciones remiten a specty check

## Objetivo

La pista de `specty doctor` sobre las secciones de AGENTS.md sin completar pide escribir las reglas que no verifica `specty check`, en vez de «las que no aplica ningún linter», y ARCHITECTURE lo describe igual. En la sección «Convenciones» del AGENTS.md de este repositorio quedan solo las reglas que ninguna herramienta verifica, con una línea que remite a las herramientas para lo demás; «Terminado» deja de repetir los umbrales de cobertura, que ya exige la configuración de Vitest.

## Fuera de alcance

- Las secciones «Mapa» y «Comandos» y el bloque de Specty de AGENTS.md.
- El hueco del flujo por el que un cambio quick no se puede ajustar cuando su verificación completa falla: va en un cambio aparte.

## Supuestos

- A1: La pista de `doctor` nombra `specty check` literalmente, como la de «Convenciones» que escribe `init`.

## Criterios de aceptación

- AC1: CUANDO AGENTS.md tiene «Mapa» o «Convenciones» sin completar ENTONCES `specty doctor` pide escribir ahí las reglas que no verifica `specty check`, en español y en inglés, y ARCHITECTURE lo describe igual.
- AC2: CUANDO se lee «Convenciones» del AGENTS.md de este repositorio ENTONCES solo trae reglas que ninguna herramienta verifica, y una línea que remite a las herramientas para lo demás.

## Archivos

- modificar packages/core/src/cards/doctor.ts — la pista remite a specty check
- modificar packages/core/test/cards/doctor.test.ts — la pista en los dos idiomas
- modificar AGENTS.md — Convenciones y Terminado sin lo que verifica una herramienta
- modificar docs/ARCHITECTURE.md — la misma pista en la descripción de AGENTS.md

## Tareas

- [ ] T1: La pista de doctor
  - files: packages/core/src/cards/doctor.ts, packages/core/test/cards/doctor.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor.test.ts
- [ ] T2: Las convenciones de este repositorio y ARCHITECTURE
  - files: AGENTS.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm check
  - type: docs
