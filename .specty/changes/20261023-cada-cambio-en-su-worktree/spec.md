---
kind: standard
---

# Cada cambio en su worktree

## Objetivo

`specty new` crea siempre el cambio en su propia worktree, sin `--worktree`, y la deja con las dependencias instaladas. Así nadie trabaja en la carpeta principal y cada cambio puede avanzar en paralelo. Hoy, `new` sin `--worktree` cambia la rama de la carpeta actual, y la persona o el agente instalan las dependencias a mano en cada worktree nueva.

## Fuera de alcance

- Fijar la rama a la que van los cambios terminados y de la que parten (`git.target`): es el siguiente cambio, pequeño. Hasta entonces sigue siendo la rama principal detectada.
- Ejecutar `approve`, `accept` y `close` desde cualquier carpeta, y un `status` con las worktrees de todos los cambios.
- Que `init` escriba `git.setup` en el `config.yaml`: sin la clave se usa el comando del stack detectado, así que no hace falta.
- Mover a una worktree los cambios que ya están en curso.

## Supuestos

- A1: `specty new` crea siempre el cambio en una worktree nueva, como `--worktree`, y la carpeta actual nunca cambia de rama. `git.worktrees: false` vuelve al comportamiento anterior. El valor por defecto es `true`, también en los repos que ya usan Specty, como este.
  - impacto: alto
- A2: Specty prepara la worktree nueva ejecutando en ella `git.setup`. Sin esa clave, usa el comando de instalación del stack detectado en la carpeta (pnpm: `pnpm install --prefer-offline`; npm: `npm install`; yarn: `yarn install`; bun: `bun install`; Flutter o Dart: `flutter pub get` o `dart pub get`; uv, Poetry, PDM y Pipenv: su comando de instalación; Bundler: `bundle install`; Composer: `composer install`; Mix: `mix deps.get`; Go: `go mod download`). Para los demás stacks no hay comando, y `git.setup: false` no ejecuta nada. Si la preparación falla, el cambio se crea igual, y la salida muestra la cola y pide ejecutarla allí.
  - impacto: alto
- A3: El SIGUIENTE de `new` y el bloque de flujo de AGENTS.md le dicen al agente que trabaje en la carpeta del cambio: que cambie allí la carpeta de trabajo de su sesión o abra allí un agente. El guard ya le bloquea escribir en otra worktree.
- A4: La configuración de los tests existentes fija `git.worktrees: false`, porque prueban el flujo dentro de una carpeta. Los tests de worktrees prueban el comportamiento por defecto.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty new "<título>"` sin `--worktree` y `git.worktrees` no es `false` ENTONCES el cambio se crea en `<carpeta principal>.worktrees/<id>`, desde la rama principal (o desde `--from`), y la carpeta actual sigue en su rama y con sus archivos.
- AC2: CUANDO se crea la worktree ENTONCES Specty ejecuta en ella `git.setup` (o, sin la clave, el comando del stack detectado) y la salida lo nombra; con `git.setup: false` o sin comando para el stack, no ejecuta nada; si falla, el cambio existe y la salida muestra la cola de la preparación y pide ejecutarla allí.
- AC3: CUANDO `git.worktrees` es `false` ENTONCES `new` sin `--worktree` cambia la rama de la carpeta actual, como antes, y `--from` sigue pidiendo `--worktree`.
- AC4: CUANDO se crea el cambio en una worktree ENTONCES el SIGUIENTE pide continuar en esa carpeta (cambiar allí la carpeta de trabajo de la sesión o abrir allí un agente) y ejecutar `specty next`; el bloque de flujo de AGENTS.md lo explica en una línea.
- AC5: CUANDO se pide el comando de preparación de un stack ENTONCES es el de A2 para cada herramienta, y ninguno para los stacks sin comando.

## Diseño

- `schema/config.ts` (core): `git.worktrees` (por defecto `true`) y `git.setup` (texto o `false`, opcional).
- `agents-md.ts` (core): una línea más en el bloque de flujo, que sigue dentro del máximo de 8.
- `detect/project.ts`: `setupCommand(stack)` según A2.
- `flow/worktree.ts`: `prepareWorktree(session, folder)` resuelve el comando (`git.setup`, o el del primer stack detectado en la carpeta que tenga uno), lo ejecuta con `verify.timeoutSec` y devuelve las líneas para la salida.
- `commands/new.ts`: va a `newInWorktree` cuando `--worktree` está puesto o `git.worktrees` es verdadero, siempre que haya una rama por cambio. Prepara la carpeta y escribe el SIGUIENTE nuevo. `--from` solo pide `--worktree` cuando el cambio no va a una worktree.
- `test/support.ts`: `CONFIG` incluye `git.worktrees: false`, delante de `verify` para que los tests que añaden claves a `verify` sigan funcionando.

## Archivos

- modificar packages/core/src/schema/config.ts — `git.worktrees` y `git.setup`
- modificar packages/core/src/agents-md.ts — el bloque de flujo dice que cada cambio vive en su carpeta
- modificar packages/core/test/schema/schema.test.ts — las claves nuevas de `git`
- modificar packages/core/test/cards.test.ts — la línea nueva del bloque de flujo
- modificar packages/cli/src/detect/project.ts — comando de preparación por stack
- modificar packages/cli/test/setup.test.ts — los comandos de preparación
- modificar packages/cli/src/flow/worktree.ts — preparación de la carpeta
- modificar packages/cli/src/commands/new.ts — siempre en una worktree, preparada, con el SIGUIENTE nuevo
- modificar packages/cli/test/support.ts — `git.worktrees: false` en la configuración de los tests
- modificar packages/cli/test/worktrees.test.ts — `new` por defecto y la preparación
- modificar docs/formats.md — §6: las claves nuevas de `git`
- modificar docs/ARCHITECTURE.md — §6 y §9: `new` siempre en una worktree y su preparación
- modificar AGENTS.md — el bloque de flujo de este repo, como lo escribiría `init`

## Tareas

- [x] T1: Configuración y bloque de flujo
  - files: packages/core/src/schema/config.ts, packages/core/src/agents-md.ts, packages/core/test/schema/schema.test.ts, packages/core/test/cards.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/cards.test.ts
- [ ] T2: Comando de preparación por stack
  - files: packages/cli/src/detect/project.ts, packages/cli/test/setup.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/setup.test.ts
- [ ] T3: `new` siempre en una worktree preparada
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/commands/new.ts, packages/cli/test/support.ts, packages/cli/test/worktrees.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts test/flow.test.ts
- [ ] T4: Documentar las worktrees por defecto
  - files: docs/formats.md, docs/ARCHITECTURE.md, AGENTS.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Instalar dependencias en cada worktree tarda, y en algunos stacks mucho — la salida dice qué se ejecuta, `git.setup` lo cambia y `git.setup: false` lo apaga. En este repo, `pnpm install` desde la caché tarda unos segundos.
- R2: Un agente que no puede cambiar su carpeta de trabajo (por ejemplo, un editor abierto en la carpeta principal) no puede escribir en la worktree, porque el guard se lo bloquea — el SIGUIENTE le pide abrir allí un agente.
- R3: Cambiar el valor por defecto afecta a quien ya usa Specty sin worktrees — A1 se confirma al aprobar, y `git.worktrees: false` lo deja como antes.
