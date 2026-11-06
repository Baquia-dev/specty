---
kind: epic
---

# La bandeja muestra cada épica una vez, con una línea de fases por corte

## Objetivo

En la Bandeja de `specty ui`, una épica sale una sola vez, en la sección más urgente, como una tarjeta con una línea por corte que recorre las fases (Spec, Tests, Impl., Acept.): la forma «carriles por fase» que la persona eligió para los ocho estados de una épica, sin plegar los terminados. Cada línea dice quién lleva su corte, qué decisión espera y sus avisos, así que una épica cuyos cortes verticales corren en paralelo, cada uno con su agente, se lee de un vistazo. Desaparecen las tres apariciones de la misma épica y el «Ninguna conversación lo lleva» engañoso de la épica, en la que nadie trabaja directamente.

## Fuera de alcance

- Lo que `specty status` y la tarjeta de `next` dicen de una épica sin conversación no cambia.
- La página de la épica (su pestaña Spec con los cortes), la página Memoria, el MCP App y la extensión de VS Code no cambian.
- La línea de un corte no muestra su tarea en curso, su tamaño ni su carpeta: eso está en la página del corte.
- No cambian los totales de la barra («X de N cambios») ni los contadores de los filtros de fase: siguen contando cambios.

## Supuestos

- A1: La urgencia de una épica es la de lo más urgente entre ella y sus cortes con cambio: primero una decisión, luego algo en curso, luego lo reciente. Con «Agrupar por fase», la épica va en la sección de su propia fase; sin agrupar, donde la pone el orden elegido; agrupando por épica, en su propia sección. La persona eligió la forma mirando la vista por estado; en las demás agrupaciones se usa la misma tarjeta.
  - impacto: alto
- A2: Un filtro (búsqueda o fase) muestra la tarjeta entera, con todas sus líneas, si deja pasar la épica o cualquiera de sus cortes, y la oculta si no deja pasar ninguno.
- A3: Quién lleva un corte es el `holder` que ya calcula `status`: el agente de la última conversación que dio un paso en su carpeta. Su nombre sale de `AGENT_NAMES` de core, y una herramienta que no está en esa lista sale con su id. Se muestra aunque ese paso sea antiguo, salvo si el cambio es huérfano: entonces la línea dice «Sin conversación».
- A4: El cambio de cada corte se elige como en la pestaña Spec: el cerrado o, si no hay, el primero de los demás. Uno cancelado libera su corte. Para una épica en borrador, revisión, implementación o ajustes, la tarjeta pide a la fuente el cambio de cada corte (`SpectyData.sliceChanges`), también los archivados, y lo vuelve a pedir con cada aviso de la fuente. Mientras no responde, un corte sin cambio cargado sale sin estado (pista vacía y sin texto), para no decir que no ha empezado. Si la fuente no sabe decirlo (datos de ejemplo, MCP App), los cambios cargados son todos, y un corte sin cambio no ha empezado.
- A5: Una épica solo llega a aceptación cuando todos sus cortes terminaron (`epic.slicesDone` en `cli/src/flow/epic.ts`). Por eso, en aceptación, cierre o terminada, sus líneas salen terminadas sin pedir nada a la fuente. En una épica cancelada, un corte sin cambio cargado sale sin estado.
- A6: Los terminados de las páginas que son cortes de una épica cargada salen solo dentro de su tarjeta, no como filas en Recientes. Un corte cuya épica no está cargada (por ejemplo, un terminado cuya épica terminada no llegó en las páginas) sale como fila suelta con «Feature · C2 · <Épica>», como hoy fuera de su grupo.
- A7: Las fases van a los tramos así: `draft` y `review`, Spec; `testing`, Tests; `implementing` y `adjusting`, Impl.; `acceptance` y `closing`, Acept. En `done`, los cuatro tramos van en verde.

## Criterios de aceptación

- AC1: CUANDO la Bandeja, agrupada por estado, muestra una épica con un corte que espera una decisión, otros en curso y otros terminados ENTONCES la muestra una sola vez, en «Esperan tu decisión», con todos sus cortes dentro; ningún corte suyo sale como fila en otra sección, y el número de la sección cuenta la épica como uno.
- AC2: CUANDO la Bandeja muestra una épica ENTONCES cada corte de su sección Cortes es una línea, en el orden de la spec, con su id, su título (enlazado a la página de su cambio si lo tiene) y una pista de cuatro tramos bajo las cabeceras «Spec», «Tests», «Impl.» y «Acept.». Los tramos ya pasados van rellenos y el de su fase lleva el color de la fase; los de un corte terminado van todos en verde, y su línea se ve como las demás, sin plegar, también en una épica en aceptación o terminada.
- AC3: CUANDO un corte aún no tiene cambio ENTONCES su línea dice, en lugar de la pista, «Listo para empezar» o «Espera a C1» (los cortes de los que depende que no han terminado); con la épica en borrador o revisión, «Puede arrancar en cuanto apruebes» o «Tras C1».
- AC4: CUANDO el cambio de un corte espera una decisión de la persona ENTONCES su línea lleva a la derecha el botón de esa decisión («Aprobar tests», «Aprobar spec»…), que abre la página del corte como el botón de una fila, y su tramo actual va marcado.
- AC5: CUANDO el cambio de un corte está abierto ENTONCES su línea dice a la derecha el agente que lo lleva («Claude Code», «Codex»…). Si es huérfano, dice «Sin conversación» y, bajo su título, «Ninguna conversación lo lleva». Si su conversación salió de su carpeta, lleva el aviso de una fila. Si comparte archivos con otro cambio abierto, «Comparte `ruta` con C5», con el id del corte si el otro es de la misma épica o su título si no.
- AC6: CUANDO la épica está en implementación ENTONCES su cabecera muestra su avance («1/5 cortes», con un anillo) en lugar de la fase, y una línea con solo las partes que tienen cortes: «1 de 5 terminados · 1 te espera · 2 en marcha · 1 listo para empezar · 1 espera a otro corte», sin tamaño, archivos ni carpeta. En cualquier otra fase, la cabecera muestra la fase, lo que espera con su botón y, si terminó, cuándo empezó y cuánto tardó.
- AC7: CUANDO la épica está en implementación ENTONCES su cabecera no dice «Ninguna conversación lo lleva» por la épica; si ninguno de sus cortes tiene un cambio abierto y alguno está listo, dice «Ningún corte en marcha: nadie empezó C1, C2 ni C5».
- AC8: CUANDO el servidor local da un cambio abierto en el que alguna conversación dio un paso ENTONCES su registro trae `holder` con la herramienta y hace cuántos minutos, como `status --json`.
- AC9: CUANDO la persona se mueve por la Bandeja con `j`/`k` ENTONCES pasan por la cabecera de la épica y después por cada corte con cambio, en orden, y Enter abre el elegido.
- AC10: CUANDO la Bandeja se agrupa por fase, sin agrupar o por épica, o un filtro deja pasar solo uno de los cortes de una épica ENTONCES la épica sale una sola vez, con todos sus cortes, en la sección de su propia fase, en su sitio del orden o en su propia sección.
- AC11: CUANDO un corte de una épica abierta terminó y su cambio no está entre los terminados cargados ENTONCES su línea sale terminada y enlazada a su cambio, con lo que la fuente dice de cada corte; mientras la fuente no responde, sale sin estado.

## Diseño

- C1, un solo lugar (`ui/src/inbox/inbox-view.ts`, `inbox.ts`, `inbox-epic.ts`):
  - Un bloque `epic` reúne la épica cargada y todos sus cortes cargados, sea cual sea su estado. Va a una sola sección: la del estado más urgente entre ellos al agrupar por estado, la de su fase al agrupar por fase, y la suya al agrupar por épica.
  - Un filtro deja pasar el bloque si deja pasar a cualquiera de sus miembros.
  - `InboxSection` pasa de listar cambios a listar bloques, con su número de bloques, y da el orden de `j`/`k`.
  - Un corte cuya épica no está cargada sigue siendo un bloque `row`.
  - En este corte, los cortes van aún como filas dentro del grupo, con la épica a la cabeza.
- C2, las líneas:
  - Core: `summarizeChange` (`core/src/summary.ts`) da de cada corte de una épica también `depends`.
  - Compartido: la elección del cambio de cada corte que hoy hace en privado `review/spec-sections.ts` pasa a una función pura (`ui/src/data/slice-changes.ts`) que usan la pestaña Spec y la Bandeja.
  - `ui/src/inbox/epic-lanes.ts` (puro) da, por cada corte en el orden de la spec, su cambio y su estado: sin estado, planeado (listo o en espera, con los cortes que faltan), en curso, espera una decisión o terminado, con el tramo de su fase.
  - `sp-inbox-lane` (`inbox-lane.ts`) dibuja la línea: id, título con enlace, pista o texto de planeado, y el botón de decisión a la derecha.
  - La tarjeta pide `sliceChanges` según A4 y A5, y lo vuelve a pedir con `subscribe`, como la pestaña Spec.
  - Las líneas con cambio son enfocables, y la Bandeja las enfoca con `j`/`k`. `InboxRow` deja de recibir `inEpic`.
- C3, quién lo lleva:
  - `holdsById` (`cli/src/server/records.ts`) da también `holder` de `openChanges`.
  - `ChangeRecord` y `ChangeView` (`ui/src/data/records.ts`) lo llevan, y `views.ts` lo copia.
  - `core/src/light.ts` exporta `AGENT_NAMES`.
  - La línea pone a la derecha el agente o «Sin conversación», y bajo el título los avisos de huérfano, fuera de su carpeta y archivos compartidos.
- C4, la cabecera: `epic-lanes.ts` da también el recuento y el aviso de «Ningún corte en marcha», y la cabecera de la tarjeta muestra el avance con su anillo en implementación, sin tamaño ni carpeta, y no muestra el aviso de huérfano de la épica en esa fase.
- Docs: `docs/ui.md` (la tarjeta de la épica en lugar de «Épicas como cabecera») en C1 y C2, y `docs/ARCHITECTURE.md` §15 (`holder` en los registros de `GET /api/changes`) en C3.

## Cortes

- C1: La épica sale una sola vez, en la sección más urgente, con todos sus cortes
  - ac: AC1, AC10
- C2: Cada corte es una línea de fases, también los que no han empezado
  - ac: AC2, AC3, AC4, AC9, AC11
  - depends: C1
- C3: Cada línea dice quién lleva su corte y sus avisos
  - ac: AC5, AC8
  - depends: C2
- C4: La cabecera de la épica da su avance y si ningún corte está en marcha
  - ac: AC6, AC7
  - depends: C2

## Riesgos

- R1: La tarjeta pide el cambio de cada corte por cada épica en curso, y otra vez con cada aviso de la fuente. Mitigación: solo lo pide una épica en borrador, revisión, implementación o ajustes, que suelen ser pocas; el servidor ya sirve esa petición a la pestaña Spec, y las épicas en aceptación o terminadas no piden nada (A5).
- R2: `j`/`k` pasan a recorrer dos tipos de elementos (filas, y cabeceras y líneas de épica), y un fallo dejaría a la persona sin poder llegar a un corte. Mitigación: AC9 lo prueba en la Bandeja entera, también al cargar una página nueva tras la última fila.
- R3: Con muchos cortes, la tarjeta crece una línea por corte, sin plegar. Mitigación: las líneas son compactas (una por corte, con sus avisos debajo solo si los hay), y es lo que la persona eligió frente a plegar los terminados.

## Cierre

### Resumen

En la Bandeja, una épica sale una sola vez, como un bloque con todos sus cortes cargados, en la sección del más urgente de ellos, en la de su fase o en la suya según la agrupación; un filtro la muestra entera si deja pasar a cualquiera de sus miembros (C1). Cada corte de su sección Cortes es una línea, en el orden de la spec, con su id, su título enlazado y una pista de cuatro tramos (Spec, Tests, Impl., Acept.), sin plegar los terminados; un corte sin cambio dice «Listo para empezar», «Espera a C1», «Puede arrancar en cuanto apruebes» o «Tras C1», y uno que espera una decisión lleva su botón. La elección del cambio de cada corte es una función compartida con la pestaña Spec (`data/slice-changes.ts`), y `j`/`k` recorren la cabecera y las líneas con cambio (C2). El servidor da `holder` en cada cambio abierto, y la línea dice qué agente lleva su corte (por su nombre de `AGENT_NAMES`, ahora en la entrada ligera) o «Sin conversación», con los avisos de huérfano, conversación fuera de su carpeta y «Comparte `ruta` con C5» (C3). Con la épica en implementación, su cabecera muestra «1/5 cortes» con un anillo y la línea del recuento («1 de 5 terminados · 1 te espera · …») sin tamaño ni carpeta, ya no dice «Ninguna conversación lo lleva» por la épica y, si ningún corte está en marcha y alguno está listo, avisa «Ningún corte en marcha: nadie empezó …» (C4).

### Desviaciones

- El primer borrador se creó como `standard` y salió XL; la persona lo canceló y la petición se rehízo como esta épica.
- El resumen de core no ganó `depends`, como preveía el Diseño: los cortes y sus dependencias salen de `review.slices` de la épica entera, así C2 cupo en un solo paquete (con core salía XL).
- La tarjeta pide `sliceChanges` con una promesa en un `effect` y no con `resource`: un `resource` dejaba la Bandeja sin estabilizarse mientras la fuente no respondía (C2).
- La cabecera de la épica sigue siendo su fila (`sp-inbox-row`) con una entrada nueva, `tally`, y el anillo es un SVG nuevo, porque el repo no tenía uno reutilizable (C4).
- La persona desbloqueó en C2 un test aprobado de `inbox/inbox-epic.test.ts` (S1) cuyo fixture no podía pasar con ningún código. Se adaptaron tests existentes previstos en Archivos: una aserción de `data/finished-summaries.test.ts` (C2) y el test de AC1 de `inbox/inbox.test.ts` (C4). `packages/core/test/light.test.ts` no cambió en C3: lo cubre `lane-holds.test.ts`.
- C3 y C4 corrieron en paralelo; `docs/ui.md` chocó al aceptar C3 y se resolvió con los dos cambios. El subagente de C3 se paró una vez esperando un monitor y se reanudó con su contexto.
- En C2, el test intermitente `src/app/embedded.test.ts` (P78/P79) hizo fallar el primer `close`; pasó al repetirlo.

### Decisiones

- La forma es «carriles por fase» (la opción C de la maqueta) para los ocho estados de una épica, sin plegar los terminados: la eligió la persona, pensando en cortes verticales que corren en paralelo, cada uno con su agente.
- Toda épica cargada es un bloque, aunque no tenga cortes cargados, y su urgencia cuenta a todos sus miembros, no solo a los que deja pasar un filtro, para que no cambie de sección al buscar (C1).
- Si la fuente falla o no responde, un corte sin cambio cargado sale sin estado, para no decir «Listo para empezar» de uno que quizá terminó (C2).
- A la derecha de una línea va una sola cosa: el botón de la decisión si la espera; si no, el agente o «Sin conversación» (C3).
- Un subagente por corte; C3 y C4, que solo dependían de C2, en paralelo. En modo delegado, con la autorización de la persona en el chat («aprueba, acepta y cierra tu»), los subagentes aprobaron, aceptaron y cerraron sus cortes, y el agente principal acepta y cierra la épica.

### Pendientes

- P238: `packages/ui/src/inbox/inbox-row.ts` pasó a 320 líneas de código (aviso desde 300); propuesta: llevar el avance con su anillo y el recuento a `inbox/epic-progress.ts`.
- P239: mirar a ojo en `specty ui`, en claro y en oscuro, el anillo, el recuento y las líneas de la tarjeta: solo los comprueban los tests.
- P240: que la fila y la página de un cambio nombren también con su nombre («Codex») la herramienta de una conversación que salió de su carpeta, como ya hace la línea.
