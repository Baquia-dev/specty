---
kind: standard
---

# Rama destino configurable

## Objetivo

`git.target`, en `config.yaml`, fija la rama a la que se incorporan los cambios terminados y de la que parten los nuevos. Así un repo que integra en `develop`, o en otra rama que no es la principal, no depende de que Specty la adivine. Hoy esa rama es siempre la principal detectada (`origin/HEAD`, `init.defaultBranch`, `main` o `master`).

## Fuera de alcance

- Una rama destino distinta por cambio. `--from` sigue fijando solo la base.
- Crear la rama destino si no existe.
- Ejecutar los comandos de la persona desde cualquier carpeta: es el último cambio de la serie.

## Supuestos

- A1: `git.target` nombra una rama local, que es a la vez la base de `specty new` y el destino de `close` (y del `accept` de un quick). Sin la clave, todo sigue como hoy con la rama principal detectada.
  - impacto: alto
- A2: Si `git.target` está definida pero esa rama no existe en local, Specty no recurre a la principal, porque podría incorporar el cambio a la rama equivocada. `new` se bloquea sin crear nada, y `close` cierra sin incorporar, con el SIGUIENTE que pide fusionar la rama.
- A3: `--from` sigue mandando sobre la base de un cambio concreto, pero no cambia su destino.

## Criterios de aceptación

- AC1: CUANDO `git.target` es una rama que existe ENTONCES `specty new` parte de ella (la salida dice «desde <rama>»), y `close` incorpora el cambio a ella y no a la principal.
- AC2: CUANDO `git.target` nombra una rama que no existe ENTONCES `new` se bloquea sin crear carpeta ni rama, y `close` cierra sin incorporar, con el SIGUIENTE que pide fusionar la rama del cambio.
- AC3: CUANDO no hay `git.target` ENTONCES `new` y `close` usan la rama principal detectada, como antes.
- AC4: CUANDO se pasa `--from <rama>` con `git.target` definida ENTONCES el cambio parte de `--from`, y al cerrar se incorpora a `git.target`.

## Diseño

- `schema/config.ts` (core): `git.target` opcional, un texto no vacío.
- `flow/worktree.ts`: `targetBranch(git, configured)` devuelve `configured` si existe en local, nada si está definida pero no existe, y la rama principal detectada si no está definida. `parallelBase(git, from, configured)` la usa como base por defecto. Si la rama configurada no existe, la base queda sin commit, con su nombre, para el mensaje de siempre («no es una rama ni un commit»).
- `commands/new.ts`: pasa `git.target` a `parallelBase`.
- `flow/integrate.ts`: `integrationOf` usa `targetBranch`.

## Archivos

- modificar packages/core/src/schema/config.ts — `git.target`
- modificar packages/core/test/schema/schema.test.ts — la clave nueva
- modificar packages/cli/src/flow/worktree.ts — rama destino y base por defecto
- modificar packages/cli/src/commands/new.ts — `new` parte de `git.target`
- modificar packages/cli/src/flow/integrate.ts — `close` incorpora a `git.target`
- modificar packages/cli/test/worktrees.test.ts — `new` con `git.target`
- modificar packages/cli/test/integrate.test.ts — `close` con `git.target`
- modificar docs/formats.md — §6: `git.target`
- modificar docs/ARCHITECTURE.md — §9: base y destino de los cambios

## Tareas

- [ ] T1: `git.target` en la configuración
  - files: packages/core/src/schema/config.ts, packages/core/test/schema/schema.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema
- [ ] T2: Base y destino desde `git.target`
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/commands/new.ts, packages/cli/src/flow/integrate.ts, packages/cli/test/worktrees.test.ts, packages/cli/test/integrate.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts test/integrate.test.ts
- [ ] T3: Documentar la rama destino
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Un `git.target` con una errata bloquea `new` en todo el repo — el bloqueo nombra la rama, y al quitar la clave se vuelve a la principal.
- R2: Esta rama parte de «Cada cambio en su worktree», aún sin incorporar — al cerrar se incorpora `main` con ella dentro.
