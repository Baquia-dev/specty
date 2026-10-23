---
kind: standard
---

# Limpieza de worktrees y ramas incorporadas

## Objetivo

Las carpetas y las ramas de los cambios terminados no se acumulan. `specty new` borra, antes de crear la suya, las worktrees de cambios ya cerrados que están en su rama destino, o cancelados. Y `specty prune` hace lo mismo y además borra las ramas de cambio que ya están en la rama destino. Hoy, cuando el agente cierra desde dentro, su carpeta queda (ya hay dos), y cada cambio deja su rama `specty/<id>`: son decenas.

## Fuera de alcance

- Borrar ramas que no están en la rama destino, como las de un cambio cancelado, que guardan su registro, o las de un spike.
- Borrar a la fuerza (`--force`) una worktree con archivos sin seguimiento o cambios sin commit: queda, con el motivo.
- Que `new` borre ramas: solo lo hace `prune`.

## Supuestos

- A1: Una worktree sobra cuando su cambio está cerrado y su rama ya está en la rama destino, o cuando está cancelado. Nunca se borra la carpeta en la que corre el proceso, por si es la sesión de un agente, ni la de un cambio abierto. Se borra con `git worktree remove` sin `--force`, y la rama queda.
  - impacto: alto
- A2: `specty prune` borra además las ramas `specty/*` y `spike/*` que ya están en la rama destino (`git branch --merged`) y no están en ninguna worktree. Su contenido ya está en esa rama, así que no se pierde nada. Las demás ramas quedan.
  - impacto: alto
- A3: `prune` no es un comando de la persona: lo puede ejecutar el agente, porque solo borra lo que ya está incorporado.

## Criterios de aceptación

- AC1: CUANDO `specty new` crea un cambio y hay worktrees de cambios cerrados e incorporados (o cancelados) ENTONCES las borra antes, la salida las nombra, y sus ramas quedan.
- AC2: CUANDO se ejecuta `specty prune` ENTONCES borra esas worktrees y las ramas de cambio ya incorporadas a la rama destino que no están en ninguna worktree, y la salida nombra lo borrado y lo que queda, con el motivo.
- AC3: CUANDO una worktree es de un cambio abierto, de un cambio cerrado que aún no está en su destino, o es la carpeta donde corre el proceso ENTONCES no se borra; y una rama sin incorporar, como la de un cambio cancelado, tampoco.
- AC4: CUANDO no hay nada que limpiar ENTONCES `prune` lo dice, y `new` no añade nada a su salida.

## Diseño

- `flow/prune.ts` (nuevo):
  - `removeFinished(session)` recorre `locateChanges` y borra con `git -C <principal> worktree remove` las carpetas de A1. Para un cambio cerrado, comprueba que esté en su destino con `integrationOf` e `isIncorporated`. Devuelve lo borrado y lo que queda, con el motivo.
  - `deleteMerged(session)` toma `git branch --merged <destino>` de las ramas de cambio, quita las que están en alguna worktree y las borra (A2).
- `commands/prune.ts` (nuevo): `specty prune` y su salida.
- `commands/new.ts`: llama a `removeFinished` antes de crear la worktree y añade lo borrado a su salida.
- `flow/land.ts`: exporta `within`, que ya comprueba si una ruta está dentro de una carpeta.
- `program.ts`: registra `prune`. Para no pasar de 300 líneas, la lectura de las opciones de `init` pasa a `commands/init.ts`.

## Archivos

- crear packages/cli/src/flow/prune.ts — worktrees que sobran y ramas ya incorporadas
- crear packages/cli/src/commands/prune.ts — `specty prune`
- modificar packages/cli/src/commands/new.ts — borrar las worktrees que sobran antes de crear la nueva
- modificar packages/cli/src/flow/land.ts — exportar `within`
- modificar packages/cli/src/program.ts — registrar `prune`
- modificar packages/cli/src/commands/init.ts — leer sus propias opciones, para que `program.ts` no pase de 300 líneas
- crear packages/cli/test/prune.test.ts — pruebas de punta a punta con worktrees y ramas reales
- modificar docs/ARCHITECTURE.md — §6 y §9: la limpieza

## Tareas

- [x] T1: Las worktrees que sobran se borran al crear un cambio
  - files: packages/cli/src/flow/prune.ts, packages/cli/src/flow/land.ts, packages/cli/src/commands/new.ts, packages/cli/test/prune.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune.test.ts test/worktrees.test.ts
- [x] T2: `specty prune`, con las ramas ya incorporadas
  - files: packages/cli/src/flow/prune.ts, packages/cli/src/commands/prune.ts, packages/cli/src/program.ts, packages/cli/src/commands/init.ts, packages/cli/test/prune.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune.test.ts test/setup.test.ts test/install.test.ts
- [x] T3: Documentar la limpieza
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Borrar la carpeta de un cambio cerrado en la que aún trabaja la sesión de un agente de otra terminal — la salida del cierre le pide salir de ella, y la carpeta del propio proceso nunca se borra.
- R2: Borrar una rama que alguien quería conservar — solo se borran las que ya están en la rama destino, sin perder ningún commit.
