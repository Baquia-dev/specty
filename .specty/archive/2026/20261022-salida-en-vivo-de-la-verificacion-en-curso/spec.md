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

- [x] T1: El canal de la verificación en curso
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/progress.test.ts, packages/ui/src/data/records.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/progress.test.ts
- [x] T2: Una verificación simulada en la fuente de ejemplo
  - files: packages/ui/src/data/sample-run.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/fixtures.test.ts
- [x] T3: El bloque de salida en vivo
  - files: packages/ui/src/progress/live-output.ts, packages/ui/src/progress/live-output.test.ts
  - ac: AC1, AC2, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/live-output.test.ts
- [x] T4: La salida en vivo en la pestaña Progreso
  - files: packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/task-row.ts, packages/ui/src/progress/progress-tab.test.ts, docs/ui.md
  - ac: AC1, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: lanzar la simulación desde la paleta, ver llegar las líneas, subir para leer y volver con «Ir al final», ocultar y mostrar, y que al terminar quede el resultado.

## Cierre

### Resumen

Mientras Specty verifica la tarea en curso, su fila en Progreso muestra «Verificando · 0:42», el comando y la salida a medida que llega, con los colores de la salida. Sigue la última línea salvo que la persona suba a leer; entonces «Ir al final» la devuelve. Se puede ocultar sin perder la línea del reloj. La salida fallida anterior se pliega mientras corre, y al terminar queda el resultado como cualquier verificación. Un lector de pantalla oye el inicio, el fin y el resultado, no cada línea. La salida llega por su propio canal, `SpectyData.watchRun`, y en el prototipo la lanza «Simular: verificar la tarea en curso».

### Desviaciones

- **Tests de la simulación:** van en `data/sample-run.test.ts`, junto a la simulación, y no en `fixtures.test.ts`, que no se tocó.
- **Lógica fuera de `fixtures.ts`:** además de la simulación, `canFinishTask` y `finishTaskIn` pasaron a `sample-run.ts` para que `fixtures.ts` no pase de 300 líneas.
- **`watchRun` por defecto:** responde una vez que no corre ninguna (`undefined`) en lugar de no emitir nada. Así quien se suscribe siempre recibe el estado actual al empezar.
- **Bloque siempre montado:** `sp-live-output` está en la fila de la tarea en curso aunque no corra nada, para que su región de estado pueda anunciar el fin y el resultado. Solo se ve mientras hay una verificación.
- **Comprobación de «Ir al final»:** la salida simulada tiene 11 líneas y no llena la región, así que en el navegador se comprobó acortando la región en la página. Los tests lo cubren midiendo el desplazamiento.

### Decisiones

- **Canal aparte:** cada línea actualiza solo la señal de la pestaña abierta, no la derivación de vistas del worker. La pestaña se suscribe al cambio que muestra y se da de baja al cambiar o al cerrarse.
- **Plegar sin pisar a la persona:** la fila decide si la salida anterior está abierta según la última verificación y si hay otra en curso. Un resultado nuevo o una verificación nueva lo recalculan, y mientras no cambien se respeta lo que eligió la persona. El fallo nuevo aparece abierto al terminar.
- **Seguir el final:** se considera al final a menos de 8 px; «Ir al final» vuelve a seguir la salida y mueve el foco a ella, porque el botón desaparece.
- **Colores compartidos:** `OUTPUT_TONES` sale de la fila al bloque en vivo, así la salida en vivo y la guardada se leen igual.
- **Simulación coherente con el ejemplo:** la verificación falla mientras la tarea espera el archivo que pidió en su solicitud de alcance, con el error que lo nombra, y pasa una vez aprobada. Al terminar suma un intento y deja `task.verified` en el audit, con `outputTail` si falló, como la CLI.

### Pendientes

- **CLI y servidor:** que la CLI escriba la salida mientras verifica y el servidor local la transmita, para implementar `watchRun` en la fuente real.
- **Pestañas por hacer:** Aceptación e Historial. El detalle por eventos irá en Historial.
