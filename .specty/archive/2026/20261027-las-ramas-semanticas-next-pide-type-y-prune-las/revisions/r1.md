---
kind: standard
---

# Las ramas semánticas: next pide --type y prune las limpia

## Objetivo

Con `git.flow`, la rama de un cambio lleva su tipo, pero el agente no sabe que debe pasarlo y `specty prune` solo limpia las ramas `specty/*` y `spike/*`. Con este cambio, el SIGUIENTE de `next` pide `--type` cuando el flujo nombra las ramas por tipo, y `prune` borra también las ramas semánticas que creó Specty y ya están incorporadas, sin tocar nunca las de la persona.

## Fuera de alcance

- El patrón de rama propio (`git.branchPattern`), que va en el cambio siguiente.
- Pedir `--type` en los demás textos que proponen otro cambio («para otro cambio, `specty new "<título>"`»), en los cortes de una épica y en el esqueleto del proyecto.
- Borrar ramas semánticas sin marca, como las que llegaron de otro clon.
- Que `init` detecte o pregunte el flujo.

## Supuestos

- A1: Basta con que pida `--type` el SIGUIENTE de `next` sin cambio activo: es el que sigue el agente antes de crear un cambio, y los demás textos lo mandan a `next` o a `new` con el tipo por defecto.
- A2: `prune` reconoce una rama semántica de Specty solo por su marca (`branch.<rama>.specty`); git la borra con la rama, así que no queda ninguna marca suelta.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO `git.flow` es `github`, `trunk` o `gitflow` y no hay cambio activo ENTONCES el SIGUIENTE de `next` propone `new "<título>" --type <tipo> --request "…"` y nombra los tipos válidos; sin `git.flow`, o con `specty`, el SIGUIENTE no cambia.
- AC2: CUANDO se ejecuta `specty prune` ENTONCES borra, además de las `specty/*` y `spike/*`, las ramas que `new` marcó y que ya están en la rama destino y en ninguna worktree, y las nombra en «RAMAS BORRADAS».
- AC3: CUANDO hay una rama que Specty no creó, aunque siga el flujo (`feat/…`), ENTONCES `prune` no la borra ni la nombra.
- AC4: CUANDO una rama marcada no está en la rama destino ENTONCES `prune` la deja y dice que no está en ella, como con las `specty/*`.
- AC5: CUANDO se leen `docs/formats.md` §6 y ARCHITECTURE §9 ENTONCES dicen que `next` pide `--type` con esos flujos y qué ramas borra `prune`.

## Diseño

- Core, `cards/view.ts`: `CardContext.branchTypes` (opcional), si el tipo cambia el nombre de la rama.
- Core, `cards/next.ts`: con `branchTypes`, el SIGUIENTE sin cambio activo añade `--type <tipo>` y la lista de `COMMIT_TYPES`; sin él, el texto de hoy.
- CLI, `session.ts`: `branchTypes` es cierto si `git.flow` existe y no es `specty`.
- CLI, `flow/branches.ts`: `markedBranches(git)` lee las marcas con `git config --get-regexp`.
- CLI, `flow/prune.ts`: `deleteMerged` lista con `git branch --merged` y `--no-merged` los patrones `specty/*` y `spike/*` más los nombres marcados.

## Archivos

- modificar packages/core/src/cards/view.ts — `CardContext.branchTypes`
- modificar packages/core/src/cards/next.ts — `--type` en el SIGUIENTE
- modificar packages/core/test/cards.test.ts — el SIGUIENTE con y sin `--type`
- modificar packages/cli/src/session.ts — `branchTypes` en el contexto de las tarjetas
- modificar packages/cli/test/branch-names.test.ts — `next` pide `--type` según el flujo
- modificar packages/cli/src/flow/branches.ts — las ramas marcadas
- modificar packages/cli/src/flow/prune.ts — borra también las marcadas
- modificar packages/cli/test/prune.test.ts — ramas semánticas y ajenas
- modificar docs/formats.md — §6
- modificar docs/ARCHITECTURE.md — §9, ramas y limpieza

## Tareas

- [ ] T1: next pide --type cuando el flujo nombra las ramas por tipo
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/next.ts, packages/core/test/cards.test.ts, packages/cli/src/session.ts, packages/cli/test/branch-names.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/branch-names.test.ts
- [ ] T2: prune borra las ramas semánticas que creó Specty
  - files: packages/cli/src/flow/branches.ts, packages/cli/src/flow/prune.ts, packages/cli/test/prune.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune.test.ts
- [ ] T3: formats y ARCHITECTURE dicen qué pide next y qué borra prune
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC5
  - type: docs

## Riesgos

- R1: `git config --get-regexp` sale con 1 cuando no hay ninguna marca. Mitigación: se lee con `git.run` y una salida distinta de 0 cuenta como ninguna.
- R2: Un nombre marcado con caracteres de patrón (`*`, `?`, `[`) en `git branch --list`. Mitigación: los nombres de `new` salen de `slugify` y de los prefijos fijos, sin esos caracteres.
