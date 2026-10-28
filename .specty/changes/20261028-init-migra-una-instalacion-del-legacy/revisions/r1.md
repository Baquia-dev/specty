---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C7
---

# `init` migra una instalación del legacy

## Objetivo

Un repositorio con el Specty anterior (`@barcidev/specty`) tiene un `.specty/config.yaml` con otro esquema, y hoy `specty init` lo rechaza como configuración no válida, así que no hay forma de pasar al Specty nuevo (ADR 0005). `specty init` reconoce esa instalación y la migra. La persona ve cada paso y lo confirma: mover el legacy a `.specty/legacy/`, traducir su configuración, quitar sus hooks de git y quitar sus bloques de AGENTS.md. Después sigue el `init` de siempre, y los cambios del legacy se pueden traer con `specty import`.

## Fuera de alcance

- Los archivos que generaron los adaptadores del legacy (reglas, roles, exportaciones por herramienta) fuera de `.specty/`: quedan donde están.
- Los comandos del legacy en `lefthook.yml` o en `simple-git-hooks` de `package.json`, que no llevan marcadores.
- Importar los cambios del legacy en la migración: se importan uno a uno con `specty import`.
- Las métricas, la auditoría y los bypass del legacy: se mueven con lo demás y no se traducen.

## Supuestos

- A1: Una instalación del legacy es un `.specty/config.yaml` con alguna de las claves `spec_engine`, `governance` o `scopes`, que el Specty nuevo no tiene.
  - impacto: alto
- A2: La traducción toma `language`, `governance.source_paths` como `governed`, `governance.exempt_paths` como `ignored`, el `test` de `scopes[0].verify` como `verify.default` y `lint`, `test` y `build`, unidos con `&&`, como `verify.full`; lo demás toma los valores por defecto.
  - impacto: medio
- A3: Migrar es de la persona, en su terminal, porque reescribe `.specty/config.yaml`. Sin terminal, `init` lo rechaza y dice cómo hacerlo, y `init --dry-run` muestra el plan sin tocar nada.
  - impacto: alto
- A4: Son tres pasos, cada uno con lo que cambia y una pregunta. Mover y traducir es obligatorio: si la persona lo rechaza, nada cambia y `init` no sigue. Quitar los hooks y los bloques se puede rechazar y el resto sigue.
  - impacto: medio
- A5: Un bloque del legacy se reconoce por su marcador, que lleva hash (`specty:begin id=… hash=…`); los del Specty nuevo no lo llevan. Un hook del legacy está entre `# >>> specty-hook >>>` y `# <<< specty-hook <<<`, en `.husky/` o en la carpeta de hooks de git.
- A6: Mover es renombrar en disco, que conserva cualquier archivo, también los binarios; el commit de `init` lleva las rutas viejas y las nuevas.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty init` en su terminal en un repositorio con una instalación del legacy y confirma cada paso ENTONCES el contenido de `.specty/` del legacy pasa a `.specty/legacy/`, `.specty/config.yaml` es la configuración nueva con su idioma, sus rutas y su verificación traducidos, los hooks de git y los bloques de AGENTS.md del legacy desaparecen sin tocar lo demás, `init` sigue como siempre, y la salida lo dice y nombra los cambios del legacy que se pueden importar.
- AC2: CUANDO `specty init` corre sin terminal en un repositorio con una instalación del legacy ENTONCES no cambia nada y dice que la migración la hace la persona en su terminal; con `--dry-run`, muestra qué movería y qué quitaría, sin cambiar nada.
- AC3: CUANDO la persona rechaza el primer paso ENTONCES nada cambia y `init` no sigue; si solo rechaza quitar los hooks o los bloques, esos quedan y lo demás se migra.
- AC4: CUANDO se ejecuta `specty import` sin carpeta después de la migración ENTONCES la lista incluye los cambios del legacy de `.specty/legacy/changes/` que tienen `proposal.md`.

## Diseño

- `cli/src/install/legacy.ts`:
  - reconoce la instalación;
  - traduce la configuración;
  - arma el plan (lo que se mueve, la configuración nueva, las líneas que se quitan de cada hook y de AGENTS.md);
  - lo aplica paso a paso, con una nota y una pregunta por paso.
- `init` lo llama antes de leer la configuración. Con la migración hecha, sigue con la configuración nueva, y suma sus líneas a su salida y sus archivos a su commit.
- `configTemplate` acepta `governed` e `ignored`.
- Los textos van en `core/src/cards/legacy.ts`.
- `specty import` también lista `.specty/legacy/changes/`.

## Archivos

- modificar packages/core/src/templates.ts — `governed` e `ignored` en `configTemplate`
- crear packages/core/src/cards/legacy.ts — los textos de la migración
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/legacy.test.ts — los textos y la configuración traducida
- crear packages/cli/src/install/legacy.ts — reconocer, traducir, planear y aplicar la migración
- modificar packages/cli/src/commands/init.ts — la migración antes de leer la configuración
- modificar packages/cli/src/commands/import.ts — los cambios del legacy en la lista
- crear packages/cli/test/legacy.test.ts — la migración en un repositorio con el legacy
- modificar docs/ARCHITECTURE.md — §14: la migración
- modificar docs/formats.md — `.specty/legacy/`

## Tareas

- [ ] T1: Los textos de la migración y la configuración traducida
  - files: packages/core/src/templates.ts, packages/core/src/cards/legacy.ts, packages/core/src/cards/index.ts, packages/core/test/cards/legacy.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/legacy.test.ts
- [ ] T2: La migración en `init` y los cambios del legacy en `import`
  - files: packages/cli/src/install/legacy.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/import.ts, packages/cli/test/legacy.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty typecheck && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/legacy.test.ts test/import.test.ts test/bootstrap.test.ts
- [ ] T3: Documentar la migración
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/legacy.test.ts
  - type: docs

## Riesgos

- R1: La configuración del legacy tiene campos que no se traducen y la persona los pierde de vista. Mitigación: se mueve entera a `.specty/legacy/config.yaml` y la nota del primer paso muestra la configuración nueva antes de confirmar.
- R2: Quitar un bloque o un hook podría llevarse líneas de la persona. Mitigación: solo se quita lo que está entre los marcadores del legacy, y cada paso muestra las líneas antes de preguntar.
