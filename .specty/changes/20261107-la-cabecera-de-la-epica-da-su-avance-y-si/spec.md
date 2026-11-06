---
kind: standard
epic: 20261106-epica-en-la-bandeja-con-lineas-por-corte
slice: C4
---

# La cabecera de la épica da su avance y si ningún corte está en marcha

## Objetivo

En la Bandeja, la cabecera de la tarjeta de una épica en implementación dice cómo avanzan sus cortes en lugar de su fase: «1/5 cortes» con un anillo y una línea como «1 de 5 terminados · 1 te espera · 2 en marcha · 1 listo para empezar · 1 espera a otro corte», sin tamaño ni carpeta. Deja de decir «Ninguna conversación lo lleva» de la épica, en la que nadie trabaja directamente, y avisa en cambio cuando ningún corte está en marcha y alguno podría empezar.

## Fuera de alcance

- Quién lleva cada corte, «Sin conversación» y los avisos de cada línea (corte C3).
- Las líneas de los cortes, su pista y su botón no cambian (corte C2).
- La cabecera de una épica en cualquier otra fase, también en ajustes, sigue como hoy: su fase, lo que espera con su botón, sus tiempos y su tamaño.
- Las secciones, el número de cada sección, el resumen de la Bandeja y `j`/`k` no cambian.

## Supuestos

- A1: El recuento sale de las líneas de la tarjeta (las de su sección Cortes y las de un cambio de la épica que esa sección no nombra): terminados; te esperan, con un cambio abierto que espera una decisión de la persona; en marcha, con un cambio abierto sin decisión; listos para empezar, sin cambio y sin cortes que esperar; y esperan a otro corte, sin cambio y con alguno de su `depends` sin terminar. Un corte sin estado (la fuente aún no responde) no entra en ninguna parte, pero sí en el total.
  - impacto: medio
- A2: La línea empieza siempre por «X de N terminados», también con 0, como en la maqueta elegida; las demás partes solo salen si tienen algún corte, en ese orden.
- A3: El avance va en el sitio de la insignia de fase, con la forma de una insignia: «1/5 cortes» y un anillo cuyo arco, en el verde de `done`, es la parte terminada. El repo no tiene un anillo ni un indicador de avance reutilizable (solo la barra de tareas de la fila), así que es un SVG de la fila, con los tokens del sistema de diseño. Sus tiempos («Empezó hace…», «En esta fase…») siguen debajo.
- A4: En implementación, la cabecera tampoco dice que la conversación de la épica salió de su carpeta: como el de huérfano, ese aviso habla de quien trabaja en la épica, y en esa fase nadie lo hace. Los demás avisos de la fila (sin carpeta, configuración, supuestos de alto impacto) siguen.
- A5: «Ningún corte en marcha» sale cuando ningún corte tiene un cambio abierto y alguno está listo para empezar, y nombra los listos, en el orden de la spec, unidos con «ni» («C1, C2 ni C5»; en inglés, «C1, C2 or C5»). Mientras la fuente no responde, ningún corte está listo, así que no lo dice.
- A6: Los textos van, como los demás de la UI, en español y en inglés junto a su componente (`t()` de `Preferences`); `core/src/cards/` es la salida de la CLI y la UI no la usa para sus filas.

## Criterios de aceptación

- AC6: CUANDO la épica está en implementación ENTONCES su cabecera muestra su avance («1/5 cortes», con un anillo) en lugar de la fase, y una línea con solo las partes que tienen cortes: «1 de 5 terminados · 1 te espera · 2 en marcha · 1 listo para empezar · 1 espera a otro corte», sin tamaño, archivos ni carpeta. En cualquier otra fase, la cabecera muestra la fase, lo que espera con su botón y, si terminó, cuándo empezó y cuánto tardó.
- AC7: CUANDO la épica está en implementación ENTONCES su cabecera no dice «Ninguna conversación lo lleva» por la épica; si ninguno de sus cortes tiene un cambio abierto y alguno está listo, dice «Ningún corte en marcha: nadie empezó C1, C2 ni C5».

## Diseño

- `ui/src/inbox/epic-lanes.ts` (puro): `epicTally(epic, lanes)` da, solo con la épica en implementación, el total de líneas y cuántas están terminadas, te esperan, en marcha, listas para empezar o esperan a otro corte (A1), y `idle`, los cortes listos cuando ninguno tiene un cambio abierto (A5).
- `sp-inbox-epic` (`ui/src/inbox/inbox-epic.ts`) expone `tally`, el recuento de sus líneas.
- `sp-inbox` (`ui/src/inbox/inbox.ts`) se lo pasa a la fila que encabeza la tarjeta (`[tally]="card.tally()"`, con una referencia a la tarjeta en la plantilla), así la cabecera sigue siendo la fila de la épica, con su foco y su lugar en `j`/`k`.
- `sp-inbox-row` (`ui/src/inbox/inbox-row.ts`), con `tally`: el avance con su anillo en lugar de la insignia de fase (`data-epic-progress`), la línea del recuento en lugar de lo que hace y su tamaño, sin carpeta, sin los avisos de quién la lleva (A4) y, si hay `idle`, «Ningún corte en marcha: nadie empezó …» con el estilo de esos avisos (`data-idle`).
- Docs: `docs/ui.md`, la cabecera de la tarjeta de la épica.

## Archivos

- modificar packages/ui/src/inbox/epic-lanes.ts — `epicTally`: el recuento de una épica en implementación y sus cortes listos cuando ninguno está en marcha
- modificar packages/ui/src/inbox/epic-lanes.test.ts — AC6 y AC7 sobre el recuento
- modificar packages/ui/src/inbox/inbox-epic.ts — la tarjeta da el recuento de sus líneas
- modificar packages/ui/src/inbox/inbox.ts — pasa a la fila de la épica el recuento de su tarjeta
- modificar packages/ui/src/inbox/inbox-row.ts — con el recuento, el avance con su anillo, la línea del recuento y «Ningún corte en marcha», sin tamaño, carpeta ni aviso de quién la lleva
- crear packages/ui/src/inbox/inbox-epic-head.test.ts — AC6 y AC7 en la Bandeja entera
- modificar packages/ui/src/inbox/inbox.test.ts — el test de AC1 lee el avance de la épica en implementación en lugar de su fase
- modificar docs/ui.md — la cabecera de la tarjeta de la épica

## Tareas

- [x] T1: El recuento de una épica en implementación sale de sus líneas
  - files: packages/ui/src/inbox/epic-lanes.ts, packages/ui/src/inbox/epic-lanes.test.ts
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/epic-lanes.test.ts
- [ ] T2: La cabecera de la épica en implementación muestra su avance, su recuento y si ningún corte está en marcha
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-epic.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox-epic-head.test.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-epic-head.test.ts --include src/inbox/inbox-epic.test.ts --include src/inbox/inbox.test.ts --include src/inbox/inbox-row.test.ts && pnpm typecheck && pnpm lint && pnpm knip
- [ ] T3: ui.md cuenta la cabecera de la tarjeta de la épica
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "Ningún corte en marcha" docs/ui.md
  - type: docs

## Riesgos

- R1: La fila de la épica pasa a depender de su tarjeta, y C3 cambia en paralelo la línea y los registros. Mitigación: la fila solo recibe un dato puro (`tally`) por una entrada nueva, y los cambios en `epic-lanes.ts` e `inbox-epic.ts` son añadidos al final o de una línea.
