---
kind: standard
follows:
  - 20261025-capas-en-dart-con-un-escaner-de-imports
---

# specty check en el pre-commit

## Objetivo

Con `checks.preCommit: true`, el hook `pre-commit` que Specty ya instala (en husky, lefthook, simple-git-hooks o nativo) ejecuta también `specty check --staged` sobre los cambios manuales, y bloquea el commit si alguna verificación de nivel error falla. Se integra en el gestor de hooks que el repositorio ya usa sin escribir hooks nuevos, y no añade ninguna dependencia.

## Fuera de alcance

- Activar `checks.preCommit` por la persona con un comando: es de `specty check --install`, con diff y confirmación (cambio siguiente).
- Los commits que hace el propio Specty (`task done`, `close`…): ya llevan su recibo, y el corte 8 decidirá cómo usa `task done` las verificaciones.
- La plantilla de CI: es del cambio siguiente.

## Supuestos

- A1: El hook de `pre-commit` instalado por `init` ya llama a `specty hook pre-commit` en cualquier gestor, así que basta con que esa orden ejecute las verificaciones; los archivos de hooks no cambian.
  - impacto: alto
- A2: Las verificaciones corren solo cuando el hook va a permitir un cambio manual dentro del alcance del cambio activo; un commit con recibo, una operación de git en curso, un commit sin rutas gobernadas o uno que el hook ya bloquea no las ejecutan.
  - impacto: alto
- A3: `checks.preCommit` es `false` por defecto, para que un repositorio que ya usa Specty no empiece a ejecutar sus tests en cada commit sin decidirlo.

## Criterios de aceptación

- AC1: CUANDO `checks.preCommit` es `true` y un cambio manual dentro del alcance trae un fallo (un TODO sin referencia preparado) ENTONCES `specty hook pre-commit` sale con 1 y muestra en stderr que el commit no pasa `specty check --staged`, con el informe de las verificaciones.
- AC2: CUANDO las verificaciones pasan o solo avisan ENTONCES el hook permite el commit y prepara sus trailers como siempre.
- AC3: CUANDO `checks.preCommit` es `false` o no está ENTONCES el hook no ejecuta las verificaciones; tampoco con un recibo de Specty ni con lo preparado fuera de las rutas gobernadas.
- AC4: CUANDO el idioma es inglés ENTONCES el mensaje del hook está en inglés.

## Diseño

- `core/src/schema/checks.ts`: `checks.preCommit`, booleano, `false` por defecto.
- `cli/src/enforce/hook.ts`: en la rama que permite un cambio manual, antes de dejar su marca, ejecuta `check` en modo `staged` y, si sale con 1, escribe el informe en stderr y bloquea.

## Archivos

- modificar packages/core/src/schema/checks.ts — `checks.preCommit`
- modificar packages/cli/src/enforce/hook.ts — ejecutar `specty check --staged` en el pre-commit
- crear packages/cli/test/check-pre-commit.test.ts — el pre-commit con y sin las verificaciones
- modificar docs/formats.md — `checks.preCommit`
- modificar docs/ARCHITECTURE.md — el orden de `pre-commit`

## Tareas

- [ ] T1: `specty check --staged` en el pre-commit
  - files: packages/core/src/schema/checks.ts, packages/cli/src/enforce/hook.ts, packages/cli/test/check-pre-commit.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-pre-commit.test.ts test/install.test.ts
- [ ] T2: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm check

## Riesgos

- R1: Los tests del proyecto hacen lento cada commit manual — `checks.levels.tests` los apaga solo si se quiere, y `checks.preCommit` entero se desactiva; el corte 6 lo activa con confirmación.
