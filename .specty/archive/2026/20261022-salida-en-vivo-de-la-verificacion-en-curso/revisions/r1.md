---
kind: standard
follows:
  - 20261022-pestana-progreso-tareas-como-documento-verificac
---

# Salida en vivo de la verificación en curso

## Objetivo

Mientras Specty verifica una tarea (al ejecutar `specty task done`, que puede tardar un minuto), la pestaña Progreso muestra la salida de esa verificación en tiempo real. Así la persona ve cómo avanzan los tests sin esperar al resultado. Al terminar, la tarea muestra su resultado como hasta ahora.

## Fuera de alcance

- Que la CLI guarde la salida mientras verifica y que el servidor local la transmita: va en el cambio de la CLI y del servidor. El prototipo la simula en su fuente de datos.
- La salida de los comandos que el agente ejecuta por su cuenta: Specty no los ve.
- Mostrar la verificación en curso en la Bandeja o en la barra compacta.

## Supuestos

- A1: La salida en vivo no pasa por la derivación de vistas, que recalcula todos los cambios en un worker y sería demasiado para una línea cada poco. La fuente la entrega por su propio canal (`SpectyData.watchRun(change, listener)`): la tarea, el comando, cuándo empezó y las líneas hasta ahora, o nada cuando no corre ninguna. La pestaña solo se suscribe mientras está abierta. Al terminar, el resultado llega como siempre, con el evento `task.verified`.
  - impacto: alto
- A2: En la fila de la tarea que se verifica aparece un bloque abierto por defecto con «Verificando · 0:42», el comando y las líneas que llegan, con los colores de la salida. Se puede ocultar y volver a mostrar. Mientras corre, la salida del fallo anterior se pliega.
  - impacto: alto
- A3: La salida sigue al final mientras la persona no suba para leer; si sube, aparece «Ir al final» para volver a seguirla. Se muestran como mucho las últimas 500 líneas, con una nota de cuántas quedan antes.
- A4: El lector de pantalla anuncia que empezó la verificación y cómo terminó, no cada línea.
- A5: En el prototipo, el comando de la paleta «Simular: verificar la tarea en curso» lanza una verificación en la tarea en curso de un cambio en implementación: las líneas llegan poco a poco y al final registra el resultado (correcto o fallido), como lo hará la CLI.

## Criterios de aceptación

- AC1: CUANDO se está verificando una tarea ENTONCES su fila en Progreso muestra «Verificando», el comando, el tiempo que lleva y las líneas de salida a medida que llegan, con sus colores.
- AC2: CUANDO llegan líneas nuevas ENTONCES la salida baja sola hasta la última, salvo que la persona haya subido para leer; CUANDO subió ENTONCES «Ir al final» la devuelve al final y vuelve a seguirla.
- AC3: CUANDO la verificación termina ENTONCES el bloque en vivo desaparece y la tarea muestra su última verificación, correcta o fallida, como hasta ahora.
- AC4: CUANDO empieza o termina la verificación ENTONCES el lector de pantalla lo anuncia, sin leer cada línea.
- AC5: CUANDO la persona oculta la salida en vivo ENTONCES queda solo la línea «Verificando · tiempo», y puede volver a mostrarla.

## Diseño

- **Contrato** (`data/progress.ts`, `data/records.ts`): `RunRecord` (tarea, comando, inicio y líneas) y `SpectyData.watchRun(change, listener)`. Por defecto no emite nada, porque una fuente sin verificaciones en vivo simplemente no las tiene. `formatClock(ms)` da «0:42» o «1:05:30».
- **Simulación** (`data/sample-run.ts`, `data/fixtures.ts`): un guion de salida de `flutter test`, una línea cada poco, que termina con el resultado. Al acabar, la fuente añade `task.verified` al audit (con `outputTail` si falló), suma un intento y avisa a los suscriptores. `fixtures.ts` solo delega, para no pasar de 300 líneas.
- **Bloque en vivo** (`progress/live-output.ts`): `sp-live-output`, que se suscribe a la tarea y lleva un reloj de un segundo. Las líneas se colorean con `outputSegments`; la región es desplazable y sigue el final salvo que la persona suba; incluye «Ir al final», el botón para ocultarla y una región de estado para los anuncios.
- **Pestaña y fila** (`progress/progress-tab.ts`, `progress/task-row.ts`): la pestaña pone el bloque en la fila de la tarea en curso; la fila pliega la salida del fallo anterior mientras corre otra verificación.

## Archivos

- modificar packages/ui/src/data/progress.ts — la verificación en curso y el reloj
- modificar packages/ui/src/data/progress.test.ts — tests del reloj
- modificar packages/ui/src/data/records.ts — el canal de la verificación en curso
- crear packages/ui/src/data/sample-run.ts — la verificación simulada
- modificar packages/ui/src/data/fixtures.ts — simular una verificación en vivo
- modificar packages/ui/src/data/fixtures.test.ts — tests de la simulación
- crear packages/ui/src/progress/live-output.ts — el bloque de salida en vivo
- crear packages/ui/src/progress/live-output.test.ts — tests del bloque
- modificar packages/ui/src/progress/progress-tab.ts — el bloque en la tarea en curso
- modificar packages/ui/src/progress/task-row.ts — plegar el fallo anterior mientras se verifica
- modificar packages/ui/src/progress/progress-tab.test.ts — la verificación en vivo en la pestaña
- modificar docs/ui.md — la salida en vivo

## Tareas

- [ ] T1: El canal de la verificación en curso
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/progress.test.ts, packages/ui/src/data/records.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/progress.test.ts
- [ ] T2: Una verificación simulada en la fuente de ejemplo
  - files: packages/ui/src/data/sample-run.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/fixtures.test.ts
- [ ] T3: El bloque de salida en vivo
  - files: packages/ui/src/progress/live-output.ts, packages/ui/src/progress/live-output.test.ts
  - ac: AC1, AC2, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/live-output.test.ts
- [ ] T4: La salida en vivo en la pestaña Progreso
  - files: packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/task-row.ts, packages/ui/src/progress/progress-tab.test.ts, docs/ui.md
  - ac: AC1, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: lanzar la simulación desde la paleta, ver llegar las líneas, subir para leer y volver con «Ir al final», ocultar y mostrar, y que al terminar quede el resultado.
