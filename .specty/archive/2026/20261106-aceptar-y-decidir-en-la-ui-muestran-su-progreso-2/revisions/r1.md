---
kind: epic
---

# Aceptar y decidir en la UI muestran su progreso hasta que se ve el resultado

## Objetivo

Hoy, al aceptar o cerrar desde la UI, el diálogo se queda abierto sin decir nada mientras la petición tarda minutos, y a mitad la página puede decir «No existe ese cambio». Con este cambio, el diálogo se cierra al confirmar, la cabecera dice que la acción sigue y por qué espera, y la página nunca da por perdido un cambio que ya mostraba. Además, el botón de cada decisión (confirmar un supuesto, por ejemplo) sigue cargando hasta que la página ya muestra el nuevo estado.

## Fuera de alcance

- Acortar lo que tarda aceptar o cerrar: la espera del turno de la verificación completa, la incorporación de main ni `git.afterLanding`.
- Mostrar una acción en curso en la Bandeja, en otra pestaña del navegador o tras recargar la página.
- Mostrar el nuevo estado antes de que el servidor lo confirme (actualización optimista).
- Añadir un botón para confirmar criterios: en la UI solo se confirman supuestos.

## Supuestos

- A1: La petición queda pendiente minutos porque aceptar un cambio rápido y confirmar el cierre esperan el turno de la verificación completa de otra sesión (`landingTurn`) y ejecutan `git.afterLanding` (en este repositorio, el build del CLI) dentro de la misma petición, detrás de la cola de acciones del servidor (`serial`). El comando ya lo dice por `io.err`, que hoy solo llega a la consola del servidor. Si la causa fuera un cuelgue real del servidor, este cambio no lo arregla.
  - impacto: alto
- A2: «No existe ese cambio» sale porque `ChangesStore.byId` da por inexistente un cambio cuando su lectura falla (un 500 mientras su carpeta se archiva o su worktree se borra) o no lo encuentra un instante. Un cambio que la página ya mostró no desaparece: siempre está abierto, archivado o en su rama. Por eso, una vez mostrado, una lectura fallida o vacía deja lo último leído en pantalla.
  - impacto: alto
- A3: El retraso al confirmar un supuesto viene de que la UI no lee nada tras la acción y espera al evento `changes`, que el servidor busca cada segundo. Todas las decisiones de la persona pasan por `ServerData.post`, así que esperar ahí la relectura arregla también las solicitudes de alcance, los comentarios, aprobar, pedir cambios, aprobar los tests y pedir ajustes, sin tocar cada componente.
  - impacto: medio
- A4: Tras una acción, la fuente espera las relecturas de quienes la escuchan como mucho 10 s. Pasado ese tiempo, la acción termina igual y el siguiente evento `changes` actualiza la página.
  - impacto: bajo
- A5: La línea que manda el servidor mientras la acción sigue llega en el idioma de Specty, como la salida de una verificación, y no en el de la página. Lo que la UI escribe alrededor («Aceptando…», «Cerrando…») sí va en los dos idiomas.
  - impacto: bajo
- A6: Las acciones en curso viven en un servicio raíz de la pestaña que las lanzó: sobreviven a navegar dentro de la UI, pero no a recargar la página.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la persona pulsa «Aceptar» en el diálogo de aceptar ENTONCES el diálogo se cierra al momento; mientras el servidor no responde, «Aceptar resultado» de la cabecera y de la barra compacta carga y «Pedir ajustes…» queda desactivado con el motivo «Aceptando…»; al responder, un aviso dice que se aceptó o por qué no, y los botones vuelven a su estado.
- AC2: CUANDO la persona pulsa «Confirmar y archivar» en el diálogo del cierre ENTONCES el diálogo se cierra al momento, el botón de la cabecera carga mientras el servidor no responde, y al responder un aviso dice que el cierre se confirmó o por qué no.
- AC3: CUANDO la persona acepta o cierra desde la UI y el comando espera el turno de la verificación completa de otra sesión ENTONCES el servidor emite eventos `action` con el id del cambio, la acción y lo que el comando dice por su salida de errores (la línea de la espera), y otro con `done: true` cuando la acción termina.
- AC4: CUANDO una aceptación o un cierre lanzados desde esta página siguen en curso ENTONCES la cabecera dice bajo los botones «Aceptando…» o «Cerrando…» («Accepting…», «Closing…» en inglés) hasta que la acción termina.
- AC5: CUANDO la página ya mostraba un cambio y una lectura posterior falla o no lo encuentra ENTONCES sigue mostrando lo último que leyó en lugar de «No existe ese cambio»; y CUANDO una relectura de la lista falla ENTONCES la lista conserva los cambios que ya mostraba. «No existe ese cambio» sigue saliendo para un id que nunca se encontró.
- AC6: CUANDO el servidor lee los cambios y la carpeta de uno desaparece a mitad de la lectura ENTONCES `GET /api/changes` responde 200 sin ese cambio, en lugar de fallar con 500.
- AC7: CUANDO la persona toma una decisión desde la UI (confirmar un supuesto, por ejemplo) ENTONCES la acción termina, y su botón deja de cargar, solo después de que la lista y el cambio de la página se han vuelto a leer, o tras 10 s si la relectura no termina.
- AC8: CUANDO una aceptación o un cierre lanzados desde esta página siguen en curso y el servidor manda una línea de esa acción ENTONCES la cabecera muestra esa línea bajo los botones, en lugar de «Aceptando…» o «Cerrando…», hasta que la acción termina.

## Diseño

- **Servidor, progreso de las acciones** (`packages/cli/src/server/actions.ts`, `api.ts`):
  - `runAction` recibe un `said: (text: string) => void` opcional; `onScreen` da a la sesión de la UI un `io` cuyo `err` llama a `said` y sigue escribiendo en la consola del servidor.
  - En `act`, antes de entrar en `serial`, se emite `action` con `{ change, action }`; con cada línea, `{ change, action, note }`; al terminar, bien o mal, `{ change, action, done: true }`. Solo las acciones de un cambio (`runAction`), no la memoria ni el modo delegado.
- **Servidor, lecturas que no fallan** (`packages/cli/src/server/records.ts`): en `openOnes`, la lectura de cada cambio (`readRecord` y sus criterios con tests) que lanza un error se trata como si no estuviera: el cambio se salta. `changeRecords` lo encuentra después entre los archivados.
- **Fuente de datos** (`packages/ui/src/data/source.ts`, `server.ts`, `server-answers.ts`):
  - `subscribe(listener)` acepta un oyente que devuelve una promesa; las fuentes que lo ignoran siguen igual.
  - `ServerData.post`, tras un 200, llama a cada oyente y espera sus promesas, como mucho 10 s (A4), antes de resolver.
  - Nuevo `watchActions(listener)` en `SpectyData` (por defecto, nada) y en `ServerData` sobre los eventos `action`, con `actionEvent` en `server-answers.ts`, como `runEvent`.
- **Store** (`packages/ui/src/data/changes-store.ts`):
  - Su oyente recarga `views` y las páginas de terminados y devuelve una promesa que se cumple cuando dejan de cargar; el de `byId` hace lo mismo con su `asked`. Un recurso inactivo (`reload()` devuelve `false` y no carga) se da por cumplido.
  - `listed` conserva el último valor si la relectura falla; `byId` conserva la última vista encontrada (`linkedSignal`), y `missing` solo vale `true` si nunca se encontró.
- **Acciones en curso** (`packages/ui/src/data/in-flight.ts`, nuevo): `InFlight`, servicio raíz. `run(change, kind, action)` guarda `{ kind, note? }` por id mientras la promesa sigue, toma las notas de `watchActions` para ese cambio y acción, y lo quita al terminar. `of(id)` da la señal de ese cambio.
- **Diálogos y acciones** (`packages/ui/src/acceptance/result-dialogs.ts`, `acceptance-actions.ts`, `closing-actions.ts`):
  - `AcceptResult.accept()` y `ConfirmClosing.confirm()` cierran el diálogo y lanzan la acción con `InFlight.run`; al cumplirse, el aviso de éxito de hoy; al fallar, `reportFailure`.
  - `AcceptanceActions` y `ClosingActions` leen `InFlight.of(change.id)`: el botón principal con `loading`, el resto desactivado con «Aceptando…» o «Cerrando…», y fuera de la barra compacta, bajo los botones, la nota del servidor o ese texto (`[data-in-flight]`), en lugar de la línea de la verificación completa.
- **Tests**: los escritos antes que el código no usan tipos ni miembros que aún no existen. Los de la UI usan una fuente que extiende `FixtureData` y deja la acción pendiente hasta que el test la resuelve. Los de las acciones de aceptar y cerrar que hoy esperan el diálogo abierto con el motivo pasan a esperar el aviso con el diálogo cerrado; los de pedir ajustes no cambian.

## Cortes

- C1: La página no da por perdido un cambio que ya mostraba
  - ac: AC5, AC6
- C2: Cada decisión carga hasta que la página la muestra
  - ac: AC7
  - depends: C1
- C3: Aceptar y cerrar cierran el diálogo y se ven en curso en la cabecera
  - ac: AC1, AC2, AC4
- C4: La cabecera dice por qué espera una aceptación o un cierre
  - ac: AC3, AC8
  - depends: C2, C3

## Riesgos

- R1: Esperar las relecturas en `post` alarga cada acción lo que tarda leer `/api/changes` — el tope de 10 s (A4) y que el botón ya cargaba durante la petición; a cambio desaparece el instante con el estado viejo.
- R2: Conservar lo último leído puede dejar en pantalla un cambio viejo si el servidor se cae — los avisos de error de la fuente siguen saliendo, y el siguiente evento `changes` lo corrige.
