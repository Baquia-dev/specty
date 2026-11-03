---
kind: standard
---

# Specty no manda a Antigravity a un cambio cuya carpeta no alcanza

## Objetivo

Antigravity solo deja trabajar a su agente dentro de las carpetas de su espacio de trabajo: la de la sesión y las que le pasa el editor. En Frecu, tras `specty new` el agente ejecutó `specty enter`, Antigravity le negó la carpeta del cambio y el guard le negó todo lo de fuera, así que quedó atrapado. Con este cambio, el guard no deja entrar a una conversación en un cambio cuya carpeta su herramienta no alcanza, y le dice cómo seguir: abrir esa carpeta en el editor y continuar allí en una conversación nueva.

## Fuera de alcance

- Soltar una conversación que ya quedó ligada a una carpeta que no alcanza (la de Frecu): la persona abre una conversación nueva.
- Las herramientas que no dicen en sus eventos en qué carpetas pueden trabajar: siguen entrando como hasta ahora.
- Añadir por la persona la carpeta de las worktrees al proyecto del editor: Specty solo lo sugiere.

## Supuestos

- A1: Antigravity manda en cada evento de sus hooks las carpetas donde deja trabajar a su agente (`workspacePaths`), y fuera de ellas niega sus herramientas aunque el guard le dé permisos (`permissionOverrides`). Está comprobado en el editor (ACP, con cuenta personal) por el registro de las conversaciones de Frecu; en Antigravity CLI se supone lo mismo, porque comparten el arnés.
  - impacto: alto
- A2: Una carpeta está al alcance si está dentro de alguna de esas carpetas, comparando las rutas reales (sin enlaces simbólicos). Si la persona añade la carpeta de las worktrees al proyecto y el editor se la pasa a Antigravity, `specty enter` entra como hasta ahora.
- A3: Los tests de Antigravity suponían, sin comprobarlo con la herramienta real, que los permisos de Specty abrían la carpeta de las worktrees. Su ayudante `entered()` pasa ahora esa carpeta en `workspacePaths`, como la tendría Antigravity si el editor se la pasa; lo que comprueban después no cambia.
- A4: La negativa usa la regla `session`, como la que pide `EnterWorktree` a Claude Code, y no liga la conversación: después sigue trabajando en su propia carpeta sin que el guard la mande a la del cambio.

## Criterios de aceptación

- AC1: CUANDO una conversación de Antigravity ejecuta `specty enter <id>` y la carpeta del cambio no está dentro de ninguna de las de su espacio de trabajo ENTONCES el guard deniega el comando: el motivo nombra esas carpetas y la del cambio, y el SIGUIENTE pide decirle al usuario que abra esa carpeta en su editor y siga allí en una conversación nueva, o que añada la carpeta de las worktrees al proyecto, y terminar el turno.
- AC2: CUANDO el guard le negó la entrada ENTONCES la conversación no queda ligada al cambio: lo siguiente que hace en su propia carpeta no se le deniega por estar fuera de la del cambio.
- AC3: CUANDO la carpeta del cambio está dentro de una de las de su espacio de trabajo ENTONCES `specty enter` la deja entrar como hasta ahora.

## Diseño

- `AgentAdapter.workspace?(event)`: las carpetas donde la herramienta deja trabajar a su agente, cuando lo dice en sus eventos. Antigravity las lee de `workspacePaths`.
- `enforce/place.ts`: `outOfReach(folder, workspace)` compara las rutas reales.
- `enforce/guard.ts`: `enterCommand`, tras encontrar la carpeta del cambio, deniega con `unreachableEnterDenial` si la herramienta dice su espacio de trabajo y la carpeta no está en él; sin `target`, no se liga nada.
- Core: `unreachableEnterDenial({ id, folder, workspace, home, tool }, lang, command)` en `guard/worktrees.ts`, exportada en `index.ts`; el texto de `worktreeByName` de Antigravity en `capabilities.ts` dice el límite.

## Archivos

- modificar packages/cli/src/agents/adapter.ts — `workspace` en el contrato de cada agente
- modificar packages/cli/src/agents/antigravity.ts — su espacio de trabajo, de `workspacePaths`
- modificar packages/cli/src/enforce/place.ts — si una carpeta queda fuera del espacio de trabajo
- modificar packages/cli/src/enforce/guard.ts — `specty enter` no entra en una carpeta fuera de su alcance
- modificar packages/core/src/guard/worktrees.ts — el motivo y el SIGUIENTE de la negativa
- modificar packages/core/src/index.ts — exporta la negativa
- modificar packages/core/src/capabilities.ts — el límite de Antigravity al entrar en un cambio
- modificar packages/cli/test/antigravity.test.ts — la entrada negada y la permitida, y el ayudante `entered()`
- crear packages/core/test/guard/worktrees.test.ts — el motivo y el SIGUIENTE de la negativa, en español y en inglés
- modificar docs/ARCHITECTURE.md — «Entrar con `specty enter`» y la herramienta que no alcanza la carpeta

## Tareas

- [ ] T1: La negativa y el límite de Antigravity en core, y la documentación
  - files: packages/core/src/guard/worktrees.ts, packages/core/src/index.ts, packages/core/src/capabilities.ts, packages/core/test/guard/worktrees.test.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/worktrees.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: `specty enter` no lleva a Antigravity a una carpeta que no alcanza
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/enforce/place.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/antigravity.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/enter.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: En Antigravity CLI los permisos de Specty sí abrían la carpeta de las worktrees (A1 falso allí), y ahora el agente pide abrir una conversación nueva en vez de entrar — es más lento pero no se bloquea; el registro de sus conversaciones lo diría.
- R2: Las rutas que manda Antigravity y las de git difieren por enlaces simbólicos (`/var` y `/private/var` en macOS) — se comparan las rutas reales.
