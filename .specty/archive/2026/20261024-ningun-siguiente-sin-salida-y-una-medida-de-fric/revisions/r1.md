---
kind: standard
---

# Ningún SIGUIENTE sin salida, y una medida de fricción

## Objetivo

Dos comprobaciones de que ninguna salida de Specty deja al agente sin camino. Una, estática: cada comando `specty …` que nombran los textos de core y de la CLI existe, con sus opciones. Otra, dinámica: un recorrido que sigue el SIGUIENTE de cada salida, como un agente, por un cambio quick, uno standard y uno standard en modo delegado, tropezando a propósito con los bloqueos típicos, y que clasifica cada bloqueo como resuelto, sin continuación o callejón sin salida. El mismo recorrido mide la fricción, en comandos del agente y de la persona hasta la spec aprobada y hasta el final, y fija esas cifras. gentle-ai midió en su flujo 6 bloqueos y ninguno nombraba cómo seguir; la fricción es el riesgo principal de una herramienta así.

## Fuera de alcance

- Agentes reales o un modelo guionizado: es el punto siguiente de la lista.
- Medir el tiempo del modelo: se cuentan comandos, no segundos.
- Los mensajes de los hooks de git: el recorrido usa el guard del agente, que bloquea antes.
- El carril retro y los ajustes en aceptación.

## Supuestos

- A1: Un comando nombrado en un texto es válido si su verbo, su subcomando y todas sus opciones existen; los argumentos posicionales que falten no cuentan, porque los textos también mencionan comandos sin ellos («tras `specty new`»). Los comentarios del código no cuentan, y un verbo calculado (`${action}`) no se puede comprobar.
  - impacto: medio
- A2: El recorrido usa la CLI en el mismo proceso, como el resto de tests, con la persona como terminal inyectada; el trabajo del agente (redactar, implementar, cerrar) lo hace un guion por fase.
- A3: Un bloqueo está resuelto si, haciendo el trabajo que pide y ejecutando el comando que nombra su SIGUIENTE, el recorrido llega a una salida sin bloqueo en 4 pasos como máximo; sin comando nombrado es «sin continuación», y si el mismo bloqueo vuelve, «callejón».
  - impacto: alto
- A4: Las cifras de fricción se fijan exactas en el test, así que un cambio del flujo que añada o quite comandos obliga a actualizarlas a la vista; ARCHITECTURE §16 guarda la línea base.
- A5: Si el recorrido encuentra un callejón, se arregla en este mismo cambio con una ampliación de alcance.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO un texto de core o de la CLI nombra `specty <verbo> …` ENTONCES un test comprueba con el parser de la CLI que el verbo, el subcomando y cada opción existen, y si no, falla nombrando el archivo y el comando.
- AC2: CUANDO el recorrido sigue el SIGUIENTE de cada salida por un cambio quick, uno standard y uno standard en modo delegado ENTONCES llega al cambio cerrado, y cada bloqueo que encuentra queda resuelto, sin callejones ni bloqueos sin continuación.
- AC3: CUANDO el recorrido standard tropieza con código escrito antes de la spec, una spec inválida, un archivo fuera del alcance, una verificación en rojo y un commit del agente ENTONCES cada uno es un bloqueo que su SIGUIENTE resuelve.
- AC4: CUANDO termina cada recorrido ENTONCES da los comandos del agente y de la persona hasta la spec aprobada y hasta el final, y los bloqueos, y el test fija esas cifras.
- AC5: CUANDO alguien lee ARCHITECTURE §16 ENTONCES encuentra las dos comprobaciones y la línea base de fricción.

## Diseño

- `commands-named.test.ts` busca en `packages/core/src` y `packages/cli/src` los textos entre comillas invertidas que empiezan por `specty ` o `${…command} `, fuera de comentarios; cambia los marcadores (`<título>`, `${id}`) por un valor, separa alternativas (`on|off`) y ejecuta cada comando en una carpeta sin git: el parser de la CLI responde «unknown command» u «unknown option» antes de abrir la sesión.
- `walk.ts` es el recorrido: ejecuta `next`, lee el comando del SIGUIENTE, hace el trabajo que corresponde a la fase (guion), lo ejecuta como agente o como persona según el comando, y anota cada paso. Los tropiezos se inyectan con ganchos del guion. Clasifica los bloqueos y cuenta la fricción.
- `friction.test.ts` define los tres recorridos y fija sus cifras.

## Archivos

- crear packages/cli/test/commands-named.test.ts — los comandos que nombran los textos existen
- crear packages/cli/test/walk.ts — el recorrido que sigue los SIGUIENTE, clasifica los bloqueos y cuenta
- crear packages/cli/test/friction.test.ts — los tres recorridos, sus tropiezos y sus cifras
- modificar docs/ARCHITECTURE.md — §16: las dos comprobaciones y la línea base de fricción

## Tareas

- [ ] T1: Los comandos que nombran los textos existen
  - files: packages/cli/test/commands-named.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/commands-named.test.ts
  - type: test
- [ ] T2: El recorrido que sigue los SIGUIENTE y mide la fricción
  - files: packages/cli/test/walk.ts, packages/cli/test/friction.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/friction.test.ts
  - type: test
- [ ] T3: Documentar las comprobaciones y la línea base
  - files: docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
