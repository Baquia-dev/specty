---
kind: standard
epic: 20261106-aceptar-y-decidir-en-la-ui-muestran-su-progreso-2
slice: C1
---

# La página no da por perdido un cambio que ya mostraba

## Objetivo

Hoy, mientras un cambio se archiva o su worktree se borra, la página de ese cambio puede decir «No existe ese cambio», la Bandeja cambia su lista por un aviso de error y `GET /api/changes` puede fallar con un 500. Con este cambio, la página sigue mostrando lo último que leyó de un cambio que ya mostraba, la Bandeja conserva su lista bajo el aviso y el servidor deja fuera el cambio cuya carpeta desaparece a mitad de la lectura. Es el corte C1 de la épica `20261106-aceptar-y-decidir-en-la-ui-muestran-su-progreso-2` (AC5 y AC6 de la épica).

## Fuera de alcance

- Que una decisión cargue hasta que la página la muestra (C2), ni las acciones en curso de aceptar y cerrar (C3, C4).
- Un `state.json` a medio escribir, que `git` puede dejar un instante al incorporar un cambio: sigue fallando como hoy.
- Las páginas de cambios terminados de la Bandeja (`FinishedPages`), que ya conservan las suyas si una relectura falla.

## Supuestos

- A1: El 500 de `GET /api/changes` sale de leer el estado de un cambio cuya carpeta desaparece a mitad: `locateChange` ve su `state.json` y, antes de que `loadState` lo lea, el cierre lo archiva o `git worktree remove` lo borra, y `loadState` lanza. También sale de `readRecord`, que fecha la fase con la hora de `state.json` cuando la auditoría no lo dice, si la carpeta se va entre leer la spec y esa hora. Los criterios con tests no lanzan: `git` responde con un código y un archivo que falta se lee como ninguno. Por eso el arreglo va en esas dos lecturas y no en un `catch` en `openOnes`, como proponía el diseño de la épica: el efecto es el mismo, el cambio se salta.
  - impacto: alto
- A2: Un cambio cuyo `state.json` desaparece entre encontrarlo y leerlo no está, igual que uno que `locateChange` no encuentra. Vale para todos los comandos que usan `loadChange`, no solo para el servidor; un `state.json` que existe pero no se puede leer sigue lanzando.
  - impacto: medio
- A3: Un cambio que la página ya mostró no desaparece: siempre está abierto, archivado o en su rama. Por eso, una vez mostrado, una lectura fallida o vacía deja lo último leído en pantalla hasta que otra lo encuentre. Lo último leído es por id: si la página pasa a otro cambio, no conserva el anterior.
  - impacto: alto
- A4: Cuando una relectura de la lista falla, la Bandeja muestra el aviso de error con «Reintentar» encima de la lista que ya mostraba, en lugar de cambiarla por él. Si la lista nunca se leyó, sale solo el aviso, como hoy.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la página ya mostraba un cambio y una lectura posterior falla o no lo encuentra ENTONCES sigue mostrando lo último que leyó en lugar de «No existe ese cambio»; y CUANDO una relectura de la lista falla ENTONCES la lista conserva los cambios que ya mostraba. «No existe ese cambio» sigue saliendo para un id que nunca se encontró.
- AC2: CUANDO el servidor lee los cambios y la carpeta de uno desaparece a mitad de la lectura ENTONCES `GET /api/changes` responde 200 sin ese cambio, en lugar de fallar con 500.

## Diseño

- **Servidor** (`packages/cli/src/store/changes.ts`, `server/records.ts`):
  - `loadChange` lee `state.json` con `readText`; si ya no está, devuelve `undefined`. Si está, lo valida como `loadState`, con el mismo error.
  - `readRecord` toma la hora de `state.json` sin lanzar; si ya no está, deja fuera el cambio, como ya hace con uno cuyo estado no puede leer.
- **Store** (`packages/ui/src/data/changes-store.ts`):
  - Lo último derivado se guarda en un `linkedSignal` sobre `views`, que conserva el valor anterior si la relectura falla. `listed` lo da (o `[]` si nunca se leyó) y `ready` dice si la lista se leyó alguna vez.
  - `byId` guarda la última vista encontrada en un `linkedSignal` con el id como parte de su fuente: con el mismo id, una lectura fallida o vacía deja la anterior; con otro id, empieza sin ninguna. `missing` solo vale `true` si esa vista no existe y la fuente falló o no lo tiene.
- **Bandeja** (`packages/ui/src/inbox/inbox.ts`): el aviso de error va antes de la lista y no la sustituye. Los esqueletos salen mientras la lista no se leyó (`store.ready()`) ni la primera página de terminados, y solo si no hay error.
- **Tests**: el del servidor va en su propio archivo porque envuelve `exists` y `readText` de `io/files` con `vi.mock`, para borrar la carpeta del cambio justo después de que el servidor lea su `state.json` o su spec. Los de la UI usan una fuente que falla o deja de tener un cambio y avisa de que algo cambió.

## Archivos

- modificar packages/cli/src/store/changes.ts — un cambio cuyo `state.json` desaparece entre encontrarlo y leerlo no está
- modificar packages/cli/src/server/records.ts — `readRecord` deja fuera un cambio cuya carpeta desaparece antes de fechar su fase
- crear packages/cli/test/server/vanishing.test.ts — `GET /api/changes` responde 200 sin el cambio cuya carpeta desaparece a mitad de la lectura
- modificar packages/ui/src/data/changes-store.ts — la lista y la vista de un cambio conservan lo último leído; `ready`
- modificar packages/ui/src/data/changes-store.test.ts — la lista y un cambio encontrado se conservan; un id nunca encontrado sigue sin existir
- modificar packages/ui/src/change/change-page.unloaded.test.ts — la página sigue mostrando el cambio cuando una lectura falla o no lo encuentra
- modificar packages/ui/src/inbox/inbox.ts — el aviso de error sobre la lista, sin quitarla
- modificar packages/ui/src/inbox/inbox.test.ts — la Bandeja conserva su lista bajo el aviso cuando una relectura falla

## Tareas

- [x] T1: El servidor da la lista sin el cambio cuya carpeta desaparece a mitad de la lectura
  - files: packages/cli/src/store/changes.ts, packages/cli/src/server/records.ts, packages/cli/test/server/vanishing.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/vanishing.test.ts test/server/records.test.ts test/server/finished.test.ts test/server/lifecycle.test.ts
  - type: fix
- [x] T2: La página y la Bandeja conservan lo último que leyeron
  - files: packages/ui/src/data/changes-store.ts, packages/ui/src/data/changes-store.test.ts, packages/ui/src/change/change-page.unloaded.test.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/changes-store.test.ts --include src/change/change-page.unloaded.test.ts --include src/inbox/inbox.test.ts --include src/data/fixtures.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Riesgos

- R1: Conservar lo último leído puede dejar en pantalla un cambio viejo si el servidor se cae — el aviso de error de la Bandeja sigue saliendo, y el siguiente evento `changes` lo corrige.
- R2: `loadChange` deja de lanzar para un `state.json` que desaparece, y algún comando podría esperar ese error — solo pasaba en una carrera, porque `locateChange` ya devuelve `undefined` si no existe; los tests de la CLI lo cubren en la verificación completa.

## Cierre

### Resumen

El servidor ya no responde 500 cuando la carpeta de un cambio desaparece a mitad de una lectura: `loadChange` da por no encontrado un cambio cuyo `state.json` se va entre encontrarlo y leerlo, y `readRecord` lo deja fuera si la carpeta se va antes de fechar su fase. En la UI, `ChangesStore` conserva la última lista derivada y, en `byId`, la última vista de cada id, así que una lectura fallida o vacía ya no hace decir «No existe ese cambio» a una página que lo mostraba; ese mensaje queda para un id que nunca se encontró. La Bandeja pone el aviso de error encima de la lista en lugar de sustituirla.

### Desviaciones

- El arreglo del servidor va en `store/changes.ts` (`loadChange`) y en el `stat` de `readRecord`, y no en un `catch` por cambio en `openOnes`, como proponía el diseño de la épica: `loadState` era quien lanzaba (A1). El efecto es el mismo y además vale para todos los comandos que usan `loadChange` (A2).
- La Bandeja también cambió (A4): sin eso, la lista conservada no se veía, porque el aviso de error la sustituía.
- La aceptación esperó al arreglo del E2E de OpenCode en main (`20261106-el-e2e-de-opencode-funciona-con-opencode-2-2-5`): con OpenCode 2.2.5 en el PATH, sus 7 tests fallaban también en main. La primera incorporación de main se abortó para rehacerla con ese arreglo.

### Decisiones

- Lo último leído es por id: si la página pasa a otro cambio, empieza sin vista, para no mostrar un cambio por otro.
- Un `state.json` que existe pero no se puede leer sigue lanzando: solo se salta el que desaparece.

### Pendientes

- Ninguno
