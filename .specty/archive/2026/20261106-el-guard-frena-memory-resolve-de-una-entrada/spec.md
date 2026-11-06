---
kind: standard
---

# El guard frena memory resolve de una entrada del frente de otra conversación

## Objetivo

Hoy el guard rechaza `specty new --resolves <id>` cuando la entrada está en un frente cuyo dueño vivo es otra conversación, pero deja pasar `specty memory resolve <id>`, así que una conversación puede tomar con él una entrada del frente de otra (P194). Con este cambio, el guard frena también `memory resolve` con esas entradas, y su negativa propone el siguiente paso propio de ese comando: volver a ejecutarlo sin la entrada, o pedirle a la persona que libere el frente.

## Fuera de alcance

- Las reglas de `memory resolve` en sí (qué entradas puede tomar y sus negativas): siguen igual.
- El freno sin el guard (la terminal de la persona): sigue sin haberlo, como con `new --resolves`.
- Los demás subcomandos de `memory` (`add`, `done`, `drop`, `keep`): no toman entradas para un cambio.

## Supuestos

- A1: Los ids de `memory resolve` son las palabras que siguen a `resolve` que no son opciones, en orden, en cada segmento del comando que ejecuta Specty (también con `npx -y @baquia-dev/specty`). El análisis del shell los da en un campo propio, `memoryResolves`, y `resolves` sigue siendo solo de `new --resolves`, para que la negativa sepa qué comando la pidió.
  - impacto: alto
- A2: La negativa de `memory resolve` dice lo mismo que la de `new --resolves` (de qué frente es la entrada, quién lo lleva y desde cuándo), y como siguiente paso: «vuelve a ejecutar `specty memory resolve` sin `<id>`: la resolverá la conversación de ese frente; o pídele a la persona que libere el frente `<frente>` en su terminal con `specty front free <frente>`».
  - impacto: medio
- A3: Se compara como en `new --resolves`, sin distinguir mayúsculas: una entrada sin frente, de un frente sin dueño vivo o del de la misma conversación pasa.

## Criterios de aceptación

- AC1: CUANDO la conversación de un agente ejecuta `specty memory resolve` con una entrada que está en un frente cuyo dueño vivo es otra conversación ENTONCES el guard lo rechaza antes de que corra, y la negativa dice de qué frente es la entrada y quién lo lleva, y propone volver a ejecutar `specty memory resolve` sin esa entrada o que la persona libere el frente con `specty front free <frente>`.
- AC2: CUANDO la entrada que nombra `memory resolve` no está en ningún frente, está en un frente sin dueño vivo o en el de la misma conversación ENTONCES el guard lo deja pasar.
- AC3: CUANDO el guard analiza un comando de shell ENTONCES da los ids de cada `specty memory resolve`, en orden y en cualquier segmento, y ninguno para otros subcomandos de `memory`, para `new --resolves` ni para un `echo` que lo nombra.
- AC4: CUANDO sale la negativa de `memory resolve` ENTONCES sale en español y en inglés.

## Diseño

- Core, `guard/specty-calls.ts`: `SpectyCalls` gana `memoryResolves`, los ids de `specty memory resolve <ids…>` (`memoryResolvedIds`); `guard/shell.ts` lo junta entre segmentos como los demás campos y lo pone vacío en el análisis sin Specty.
- Core, `cards/front-owners.ts`: `frontResolvesDenial(owner, id, lang, command, via = "new")`; con `via: "memory"`, el siguiente paso de A2.
- CLI, `enforce/fronts.ts`: `judgeFronts` mira también `memoryResolves`; `takenDenial` recibe los ids con el comando que los pide y pasa `via` a la negativa.

## Archivos

- modificar packages/core/src/guard/specty-calls.ts — los ids de `specty memory resolve`
- modificar packages/core/src/guard/shell.ts — junta `memoryResolves` entre segmentos
- modificar packages/core/test/guard/shell.test.ts — los ids de `memory resolve` y los comandos que no los dan
- modificar packages/core/src/cards/front-owners.ts — el siguiente paso de la negativa para `memory resolve`
- modificar packages/core/test/cards/front-brakes.test.ts — la negativa de `memory resolve`, en español y en inglés
- modificar packages/cli/src/enforce/fronts.ts — el guard frena `memory resolve` como `new --resolves`
- modificar packages/cli/test/front-brakes.test.ts — el freno de `memory resolve` de punta a punta
- modificar docs/formats.md — los frenos de los frentes cuentan `memory resolve`
- modificar docs/ARCHITECTURE.md — el guard rechaza también `memory resolve` de una entrada de un frente ajeno

## Tareas

- [x] T1: El análisis del shell da los ids de `memory resolve`
  - files: packages/core/src/guard/specty-calls.ts, packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts
  - type: feat
- [x] T2: La negativa del frente para `memory resolve`, en español y en inglés
  - files: packages/core/src/cards/front-owners.ts, packages/core/test/cards/front-brakes.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/front-brakes.test.ts
  - type: feat
- [x] T3: El guard frena `memory resolve` de una entrada del frente de otra conversación
  - files: packages/cli/src/enforce/fronts.ts, packages/cli/test/front-brakes.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-brakes.test.ts test/front-owners.test.ts test/front-guard.test.ts test/memory-resolve.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T4: La documentación cuenta el freno de `memory resolve`
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Una palabra `resolve` que no es el subcomando (`specty memory add "resolve X"`) daría ids — solo cuenta cuando `resolve` es la primera palabra sin opción tras `memory`; el texto entre comillas de `add` es otra palabra.

## Cierre

### Resumen

El guard frena ahora `specty memory resolve <id>…` como ya frenaba `specty new --resolves`: si la conversación de un agente nombra una entrada de un frente cuyo dueño vivo es otra conversación, lo rechaza antes de que corra (P194). La negativa dice de qué frente es la entrada, quién lo lleva y desde cuándo, y propone volver a ejecutar `memory resolve` sin esa entrada, que resolverá la conversación de ese frente, o que la persona libere el frente con `specty front free <frente>`. El análisis del shell da los ids de `memory resolve` en un campo propio, `memoryResolves` (`guard/specty-calls.ts`, juntado entre segmentos en `guard/shell.ts`), y `frontResolvesDenial` recibe con `via` qué comando los pidió. `judgeFronts` (`enforce/fronts.ts`) mira los dos. Los tests de AC1 y AC2 están en `packages/cli/test/front-brakes.test.ts`, los de AC3 en `packages/core/test/guard/shell.test.ts` y el de AC4 en `packages/core/test/cards/front-brakes.test.ts`. La verificación completa falló solo en los e2e de OpenCode (P197), como en main desde que Homebrew actualizó OpenCode a 2.2.5, y la persona aceptó de todos modos.

### Desviaciones

- Ninguna respecto al plan aprobado.

### Decisiones

- Los ids de `memory resolve` van en un campo propio y no en `resolves`, para que la negativa sepa qué comando la pidió y proponga su propio siguiente paso, sin cambiar lo que ya daba `resolves`.

### Pendientes

- Ninguno.
