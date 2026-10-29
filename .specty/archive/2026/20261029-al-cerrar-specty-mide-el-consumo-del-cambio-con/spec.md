---
kind: standard
allowedDependencies:
  - ccusage
---

# Al cerrar, Specty mide el consumo del cambio con ccusage

## Objetivo

Primer punto de lo acordado para el consumo de tokens. Hoy nadie sabe lo que costó cada cambio. Medirlo a mano en este repositorio dio unos 6,80 USD de media, con mucha diferencia entre cambios.

[ccusage](https://github.com/ccusage/ccusage) ya lee los logs de los agentes y da, por sesión, cada llamada al modelo con su hora y sus tokens, y el coste de cada sesión por modelo. Specty le pide las sesiones que nombra la auditoría del cambio (`session`, desde el cambio anterior) y se queda con las llamadas hechas desde su creación.

Al cerrar el cambio, o al aceptar uno quick, Specty:
- anota el consumo en la auditoría (`change.usage`);
- lo dice en la salida, con tokens, llamadas y coste.

Specty no instala ccusage ni escribe fuera del proyecto. Usa el de `node_modules/.bin` de la carpeta del cambio o el del PATH, y sin él todo sigue igual.

## Fuera de alcance

- El aviso de empezar una sesión nueva: es el cambio siguiente.
- Mostrar el consumo en el historial de la UI.
- Que `specty doctor` diga si puede medir.
- Las sesiones de otros agentes: hoy solo Claude Code nombra la suya.

## Supuestos

- A1: ccusage 20 no expone el coste de cada llamada, solo el de cada sesión y modelo. Los precios de un modelo se deducen de su informe de sesiones por mínimos cuadrados. Con cuatro sesiones o más se reproduce su coste al céntimo; medido en este repositorio, 0,003 USD de error.
- A2: Las sesiones de una sola fuente se leen en un segundo; las de todas las fuentes, en 34 s. Specty pide solo la fuente del agente.

## Criterios de aceptación

- AC1: CUANDO se cierra un cambio, o se acepta uno quick, y hay ccusage en `node_modules/.bin` de la carpeta del cambio o en el PATH ENTONCES Specty pide a ccusage las sesiones de Claude Code que nombra la auditoría del cambio, suma las llamadas hechas desde que se creó y anota `change.usage` con las llamadas, los tokens de cada tipo y el coste.
- AC2: CUANDO los precios de un modelo, deducidos de al menos cuatro sesiones del informe de ccusage, explican el coste de cada una al céntimo ENTONCES el coste del cambio sale de esos precios; si algún modelo de sus llamadas no los tiene, el consumo va sin coste.
- AC3: CUANDO hay consumo ENTONCES la salida del cierre lo dice con sus tokens, sus llamadas y su coste, si lo hay, y `specty audit` lo muestra en la línea del evento.
- AC4: CUANDO ccusage falta, falla o no da un JSON válido, o la auditoría no nombra ninguna sesión ENTONCES el cierre sigue igual, sin evento y sin línea.

## Diseño

- Core, `usage.ts`, puro:
  - `modelPrices(rows)`: precios por millón de tokens de entrada, salida, escritura y lectura de caché, por modelo. Se calculan con las ecuaciones normales sobre las filas `modelBreakdowns` de ccusage. Se descarta el modelo con menos de cuatro sesiones, con un sistema singular o con alguna sesión que el ajuste no explique al céntimo.
  - `changeUsage(entries, since, prices)`: suma las llamadas desde `since`; sin llamadas devuelve nada.
- Core, `cards/usage.ts`: `usageLine` para el cierre y el texto del evento en `audit.ts`. Formato:
  - tokens en millones con dos decimales, en miles con uno, o enteros;
  - llamadas, y el coste con dos decimales;
  - en español y en inglés.
- CLI, `flow/usage.ts`:
  - Cada herramienta de la auditoría tiene su fuente de ccusage (`claude-code` → `claude`).
  - Para los precios, `ccusage <fuente> session --json --offline`; para las llamadas, `ccusage <fuente> session --id <sesión> --json --offline`.
  - `node_modules/.bin` de la carpeta del cambio va delante del PATH, con un tiempo máximo de 60 s por llamada.
  - Lee los campos que usa y descarta lo que no encaja.
  - `measureUsage` anota el evento y devuelve la línea; `withUsage` la añade a la tarjeta.
- `close` (`commands/finish.ts`) y el cierre del quick (`commands/accept.ts`): miden antes de archivar, para que el evento vaya con el cambio, y añaden la línea.
- Este repositorio:
  - ccusage 20.0.45 como dependencia de desarrollo, con el script `usage`;
  - `formats.md` §4 documenta el evento y ARCHITECTURE §13 la medición.

## Archivos

- crear packages/core/src/usage.ts — precios por modelo y consumo del cambio
- modificar packages/core/src/index.ts — exporta la API de consumo
- crear packages/core/test/usage.test.ts — AC2 y la suma de AC1
- crear packages/core/src/cards/usage.ts — la línea del consumo
- modificar packages/core/src/cards/index.ts — exporta `usageLine`
- modificar packages/core/src/cards/audit.ts — el evento `change.usage`
- crear packages/core/test/cards/usage.test.ts — AC3, el texto
- crear packages/cli/src/flow/usage.ts — pide a ccusage, anota y añade la línea
- modificar packages/cli/src/commands/finish.ts — mide al cerrar
- modificar packages/cli/src/commands/accept.ts — mide al cerrar el quick
- crear packages/cli/test/usage.test.ts — AC1, AC3 y AC4 con un ccusage falso
- modificar package.json — ccusage y el script `usage`
- modificar pnpm-lock.yaml — ccusage
- modificar docs/formats.md — §4, `change.usage`
- modificar docs/ARCHITECTURE.md — §13, la medición del consumo

## Tareas

- [x] T1: El core deduce los precios de ccusage y suma el consumo de un cambio
  - files: packages/core/test/usage.test.ts, packages/core/src/usage.ts, packages/core/src/index.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/usage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: El consumo en palabras, en el cierre y en la auditoría
  - files: packages/core/test/cards/usage.test.ts, packages/core/src/cards/usage.ts, packages/core/src/cards/index.ts, packages/core/src/cards/audit.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/usage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T3: Al cerrar, Specty mide el consumo con ccusage
  - files: packages/cli/test/usage.test.ts, packages/cli/src/flow/usage.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/usage.test.ts test/integrate.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [x] T4: ccusage en este repositorio y la documentación
  - files: package.json, pnpm-lock.yaml, docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm knip && pnpm lint
  - type: chore

## Riesgos

- R1: Otra versión de ccusage cambia su JSON. Mitigación: Specty valida cada campo que usa y, si no encaja, cierra sin consumo (AC4). El repositorio fija la versión.
- R2: Un modelo con precios por tramos, más caro por encima de cierto contexto, no tiene precios lineales. Mitigación: el ajuste debe explicar cada sesión al céntimo; si no, el consumo va sin coste (AC2).
- R3: Un usuario con muchos logs espera al cerrar. Mitigación: solo la fuente del agente (un segundo aquí) y 60 s como máximo por llamada.

## Cierre

### Resumen

Al cerrar un cambio, o al aceptar uno quick, Specty pide a ccusage las sesiones de Claude Code que nombra la auditoría del cambio y suma las llamadas hechas desde su creación. Anota `change.usage` con llamadas, tokens y coste, y lo dicen la salida y `specty audit`.

El coste sale de los precios de cada modelo, deducidos por mínimos cuadrados del informe de sesiones de ccusage y aceptados solo si explican cada sesión al céntimo. Sin ccusage o sin sesiones, el cierre no cambia. ccusage 20.0.45 queda como dependencia de desarrollo de este repositorio, con `pnpm usage`.

### Desviaciones

- T1 tomó con `scope add` los archivos de T2, los textos. El typecheck del core compila el test bloqueado de T2, que importa `usageLine`, así que T1 no pasaba su verificación sin ellos; T2 solo pasó la suya.
- `solve` se dividió en `withPivot`, `eliminate` y `cell` para bajar su complejidad de 16 a menos de 10.

### Decisiones

- ccusage 20 es un binario nativo sin API de JavaScript: Specty lo ejecuta, no lo empaqueta, y nunca lo instala. Usa el de `node_modules/.bin` de la carpeta del cambio o el del PATH; con `npx` escribiría en la carpeta del usuario.
- Solo la fuente del agente (`ccusage claude …`): el informe de todas las fuentes tardaba 34 s y el de Claude, un segundo.
- Precios deducidos en vez de repartir el coste de la sesión con los ratios estándar. El reparto se desviaba un 5 % de mediana y hasta un 25 % por cambio; los precios deducidos reproducen a ccusage al céntimo.
- Sin entrada en el glosario: «consumo del cambio, según ccusage» se explica solo, y una entrada se añadiría a cada tarjeta que lo nombra.

### Pendientes

- El aviso de empezar una sesión nueva al cerrar y `clear` en el hook de inicio de sesión de Claude Code: el cambio siguiente.
- Que el historial de la UI muestre el consumo y que `specty doctor` diga si puede medirlo.
- Las sesiones de otros agentes, cuando su herramienta diga su id; ccusage ya lee Codex, OpenCode y otros.
- `core/src/cards/index.ts` pasa de 300 líneas de código (334). Es la lista de exports de los textos; partirla solo por el número sería peor.
