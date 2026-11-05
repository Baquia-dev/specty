---
kind: standard
---

# Una épica en implementación se ajusta para dividir un corte que sale XL

## Objetivo

Un corte que al redactarse sale demasiado grande no tiene salida hoy: `propose` pide dividirlo en una épica, un corte no puede ser una épica, y su épica, en `implementing`, no admite ajustes (solo desde `acceptance`), así que no se le pueden añadir cortes. Con este cambio, una épica en `implementing` se ajusta con `specty adjust` para estrechar ese corte y añadir los cortes nuevos, la persona vuelve a aprobarla, y el error de tamaño de un corte dice cómo hacerlo en vez de pedir una épica.

## Fuera de alcance

- Épicas anidadas: un corte sigue sin poder ser una épica.
- Ajustar en `implementing` un cambio que no es una épica: su plan cambia con `scope add` y sus ajustes siguen en aceptación.
- Validar que un ajuste no cambie ni borre un corte cerrado: la tarjeta lo pide, como hoy en aceptación.
- Pedir el ajuste de una épica en implementación desde la UI, que solo los pide en aceptación.

## Supuestos

- A1: Solo una épica se ajusta en `implementing`; cualquier otro cambio que lo pida recibe el rechazo de hoy, sin cambiar de fase.
  - impacto: alto
- A2: Mientras la épica está en `adjusting` o `review`, no empieza ningún corte nuevo (`new --epic` sigue exigiendo la épica en `implementing`), pero los cortes en curso siguen y se cierran como siempre.
  - impacto: alto
- A3: Si todos los cortes se cierran mientras la épica se ajusta, la épica no pasa a aceptación hasta que la persona la aprueba de nuevo: `childrenDone` sigue solo desde `implementing`, y el `specty next` que sigue a la aprobación lo comprueba, como hoy.
- A4: El corte que ya empezó se estrecha en su propia spec, en su carpeta, y en «Cortes» de la épica (su título y su `ac`); el resto va en cortes nuevos con ids nuevos y su `depends`. La spec de una épica en `adjusting` ya admite añadir y cambiar cortes: la regla de append-only solo protege las tareas hechas, que una épica no tiene.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty adjust "<petición>"` con una épica en `implementing` ENTONCES la épica pasa a `adjusting` con la petición anotada, y su tarjeta dice cómo dividir un corte: estrecharlo y añadir cortes nuevos con ids nuevos, su `ac` y su `depends`, sin cambiar los cortes cerrados.
- AC2: CUANDO la persona aprueba la épica ajustada ENTONCES vuelve a `implementing`, y un corte nuevo empieza con `specty new --epic <épica> --slice <corte>` en cuanto se cierran los cortes de su `depends`.
- AC3: CUANDO se ejecuta `specty adjust` con un cambio que no es una épica en `implementing` ENTONCES Specty lo rechaza sin cambiar su fase y dice que los ajustes se piden con el resultado en aceptación.
- AC4: CUANDO se ejecuta `specty adjust` con una épica que no está en `implementing` ni en `acceptance` ENTONCES Specty lo rechaza y dice que los ajustes de una épica se piden mientras se implementan sus cortes o con el resultado en aceptación.
- AC5: CUANDO todos los cortes de una épica se cierran mientras ella está en `adjusting` ENTONCES la épica sigue en `adjusting`, y tras aprobarla la persona `specty next` la pasa a aceptación.
- AC6: CUANDO `specty propose` valida el corte de una épica que supera los umbrales de división ENTONCES el error nombra la épica y dice que un corte no puede ser una épica: se estrecha y el resto va en cortes nuevos de su épica, que se ajusta en su carpeta, sin pedir dividirlo en una épica.

## Diseño

- `core/flow/machine.ts`: `EVENT_RULES.adjust` admite `implementing` además de `acceptance`; `endOutcome` recibe la fase y rechaza con `kind-not-allowed` el `adjust` de un cambio que no es una épica en `implementing`.
- `core/cards/work.ts`: `adjustingCard` de una épica lista cómo ajustarla (dividir un corte, cubrir lo que falta con un corte nuevo, alcance nuevo como seguimiento, los cortes cerrados no se tocan) en lugar de la clasificación por tareas.
- `core/cards/adjust.ts`: el rechazo `not-in-acceptance` lleva `epic?: boolean`, y el de una épica nombra sus dos fases.
- `core/validate/quality.ts`: `checkSplit` da `slice-split-required` (con `detail` y `epic`) en lugar de `split-required` cuando el frontmatter nombra una épica; mensajes en `spec/messages.es.ts` y `spec/messages.en.ts`.
- `cli/commands/adjust.ts`: pasa `epic: state.kind === "epic"` al rechazo.

## Archivos

- modificar packages/core/src/flow/machine.ts — `adjust` desde `implementing`, solo para una épica
- modificar packages/core/test/flow/machine.test.ts — AC1 y AC3
- modificar packages/core/src/cards/work.ts — la tarjeta de `adjusting` de una épica
- modificar packages/core/src/cards/adjust.ts — el rechazo de una épica fuera de sus fases
- modificar packages/core/test/cards/adjusting.test.ts — AC1
- modificar packages/core/test/cards/adjust.test.ts — AC4
- modificar packages/core/src/validate/quality.ts — el error de tamaño de un corte
- modificar packages/core/src/spec/diagnostics.ts — el código `slice-split-required`
- modificar packages/core/src/spec/messages.es.ts — su mensaje en español
- modificar packages/core/src/spec/messages.en.ts — su mensaje en inglés
- crear packages/core/test/validate/split-slice.test.ts — AC6
- modificar packages/cli/src/commands/adjust.ts — el rechazo sabe si el cambio es una épica
- crear packages/cli/test/epic-adjust.test.ts — AC1 a AC5, de punta a punta
- modificar docs/ARCHITECTURE.md — el ajuste de una épica en implementación y el tamaño de un corte
- modificar docs/formats.md — el error de tamaño de un corte

## Tareas

- [x] T1: La máquina de estados deja ajustar una épica en implementación
  - files: packages/core/src/flow/machine.ts, packages/core/test/flow/machine.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow/machine.test.ts
- [ ] T2: La tarjeta del ajuste de una épica y su rechazo fuera de sus fases
  - files: packages/core/src/cards/work.ts, packages/core/src/cards/adjust.ts, packages/core/test/cards/adjusting.test.ts, packages/core/test/cards/adjust.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/adjusting.test.ts test/cards/adjust.test.ts
- [ ] T3: El error de tamaño de un corte lleva a ajustar su épica
  - files: packages/core/src/validate/quality.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/validate/split-slice.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/split-slice.test.ts test/validate/quality.test.ts test/validate/split-closing.test.ts
- [ ] T4: `specty adjust` en una épica en implementación, de punta a punta
  - files: packages/cli/src/commands/adjust.ts, packages/cli/test/epic-adjust.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-adjust.test.ts test/epic.test.ts test/commands.test.ts && pnpm typecheck && pnpm lint
- [ ] T5: La documentación del ajuste de una épica en implementación
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un ajuste de la épica deja sin empezar los cortes listos mientras la persona no la aprueba — los cortes en curso siguen, y la aprobación de un ajuste que solo añade cortes es corta.
- R2: Un ajuste estrecha un corte cerrado y deja un criterio sin cubrir — la tarjeta pide no tocar los cortes cerrados, y la persona revisa el delta antes de aprobar.
