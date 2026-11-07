---
kind: epic
---

# Todo Specty configurable desde una página de flujo en la UI

## Objetivo

Hoy solo se configura Specty editando `.specty/config.yaml` a mano: ninguna pantalla lee ni escribe ese archivo, y unos 36 parámetros que cambian su comportamiento están fijos en el código. Con esta épica, la persona arma el flujo en una página «Configuración» de la UI, siguiendo la propuesta B que eligió («Flujo equipable»). Las fases se ven en línea, cada una con sus piezas. Hay un modo básico, con perfiles, y uno avanzado, para equipar, quitar y ajustar cada pieza. Una vista General recoge los ajustes que no son de una fase. Además, los parámetros fijos pasan a ser ajustes. Las garantías de Specty se ven con candado y no se cambian.

## Fuera de alcance

- Apagar o cambiar las garantías de Specty: quién aprueba, acepta y cierra, el acceso al código y a la spec en cada fase, el guard y sus rutas protegidas, los errores de la spec que impiden aprobar, que el modelo solo suba el tamaño, que las acciones de la UI solo valgan desde la terminal de la persona y las comprobaciones de origen, cookie y CSRF del servidor.
- Implementar `team.approvers`, `team.requirePrReview` y `ui.requireUserPresence` (fase 4): la página los muestra como «Próximamente».
- Un archivo de ajustes por persona o por máquina: el tema, el idioma de la UI y las vistas siguen en el navegador, y el modo delegado en el clon.
- Las variables de entorno (`SPECTY_AGENT`, `CLAUDE_CONFIG_DIR`…).
- Editar la configuración desde la CLI (`specty config`) o desde la extensión de VS Code, y editar el YAML en crudo en la UI.
- Perfiles definidos por la persona.

## Supuestos

- A1: La página sigue la propuesta B del artifact «Propuestas de configuración de Specty». Tiene dos vistas, cada una en Básico y Avanzado. La vista Flujo muestra las fases Borrador, Revisión, Tests, Implementación, Aceptación y Cierre con sus piezas. La vista General agrupa por sección los ajustes que no son de una fase: idioma, forma de trabajo, alcance, git, memoria, desarrollo, interfaz y glosario. Las secciones son las del documento de la propuesta A, porque B no tenía sitio para estos ajustes. El navegador recuerda la vista y el modo, como las preferencias de la Bandeja.
  - impacto: alto
- A2: Las garantías van con candado, como decidió el usuario. Se ven como piezas en su fase, con una frase que explica por qué no se quitan, y no tienen control.
  - impacto: alto
- A3: Guardar escribe en la carpeta donde corre `specty ui` (la principal) y hace un commit propio, como decidió el usuario. El commit lleva solo `.specty/config.yaml`, con el trailer `Specty-Config: true` y un recibo de tipo `config` (`commitWithReceipt`), que los hooks aceptan como el de `init`. Se toma el turno de aterrizaje para no cruzarse con otro aterrizaje. Solo cambian las claves tocadas, con el `Document` de `yaml`, y el resto del archivo y sus comentarios se conservan, como en `writeConfig` de `install/project-files.ts`. Hay dos casos en que no guarda y dice por qué, como `commitInstall`: que esa carpeta tenga un cambio en curso o que `config.yaml` tenga cambios sin commit.
  - impacto: alto
- A4: Solo la persona guarda, con la misma puerta que aprobar desde la UI: servidor arrancado desde una terminal interactiva, cookie de sesión y CSRF. El agente no guarda ajustes, ni en modo delegado. Sin esa puerta, la página es de solo lectura y lo dice, como la Memoria.
  - impacto: alto
- A5: El catálogo de ajustes vive en core, puro, en la entrada ligera (`light.ts`) porque lo usa el hilo principal de la UI. Por cada ajuste guarda su clave, sección, fase y pieza si las tiene, tipo de control y valor por defecto. También guarda sus marcas: afecta permisos, ejecuta un comando, vive en el clon, próximamente, nuevo, interno y garantía. Sus textos van en español y en inglés en `packages/core/src/cards/`. Los perfiles y el diff entre dos configuraciones también viven en core. El servidor valida con `resolveConfig` y devuelve los errores por clave, así que la UI no carga zod.
  - impacto: medio
- A6: Los perfiles son tres conjuntos de claves en core. Equilibrado son los valores por defecto. Ligero y Estricto cambian solo políticas y límites (`policy.tests`, niveles y umbrales de `checks`, `lines`, `split`), nunca comandos ni rutas. Su contenido exacto lo fija la spec de C4. La página marca el perfil cuyas claves coinciden con la configuración, o Propio si no coincide ninguno.
  - impacto: medio
- A7: Las claves nuevas (C5 a C9 y C11 a C19) van en módulos de schema propios, como `checks.ts` o `git.ts`, para que `schema/config.ts` (315 líneas) no crezca. Todas son opcionales. Sin ellas, Specty se comporta igual que hoy, con los mismos valores. Los internos van bajo una clave `internal`. Los nombres exactos los fijan la spec de cada corte y `docs/formats.md` §6.
  - impacto: medio
- A8: La clave `effort`, que hoy el schema acepta y nada lee, pasa a ser la tabla de esfuerzo por tamaño (`BY_LEVEL` de `sizing/effort.ts`) y la regla del esfuerzo de una tarea (C6). El modelo puede seguir subiéndolo, nunca bajarlo.
  - impacto: medio
- A9: Con `flow.closing: false`, aceptar un cambio estándar lo cierra como hoy uno rápido: archiva y aterriza sin la fase de cierre, sin sección Cierre y sin retro. Las épicas y los cortes siguen igual.
  - impacto: alto
- A10: Algunos parámetros internos forman parte del cumplimiento. Son la vida de los recibos, la de los pendientes del guard, la de las instantáneas de shell y la vinculación de sesiones. C8 los deja con candado, como garantías, y solo expone los que no pueden debilitar el guard.
  - impacto: medio
- A11: `ui.port` se conecta en C9: sin `--port`, `specty ui` usa ese puerto. Las otras tres claves sin efecto se muestran como «Próximamente», sin control.
  - impacto: bajo
- A12: La pieza «Modo delegado» usa el `/api/delegation` de hoy. Se aplica al momento, sin diff ni commit, porque vive en el clon y no en `config.yaml`.
  - impacto: bajo
- A13: Cada corte documenta lo suyo, con todo texto nuevo en español y en inglés. Las claves y el trailer van en `docs/formats.md` §6 y §7, la pantalla «Ajustes» en `docs/ui.md` y los endpoints en `docs/ARCHITECTURE.md`.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona abre «Configuración» en la UI ENTONCES ve, en la vista General en Avanzado, cada ajuste de `config.yaml` agrupado por sección. Cada uno tiene su nombre y descripción en el idioma de la UI, su clave y su valor efectivo. Si su valor difiere del de por defecto, lleva la marca «Modificado» y muestra el valor por defecto.
- AC2: CUANDO un ajuste afecta permisos, ejecuta un comando, vive en el clon o todavía no tiene efecto ENTONCES lleva su marca. Los que no tienen efecto se ven como «Próximamente» y no se editan.
- AC3: CUANDO la persona escribe en el buscador o elige un filtro (Modificados, Afectan permisos, Ejecutan comandos, Nuevos) ENTONCES ve solo los ajustes que coinciden por nombre, descripción o clave.
- AC4: CUANDO `config.yaml` no es válido ENTONCES la página muestra cada error del validador del core junto a su ajuste y los valores que puede leer.
- AC5: CUANDO la persona cambia ajustes y pulsa «Revisar y guardar» ENTONCES ve un diálogo con cada cambio. Cada uno muestra el valor nuevo y, si se quitó algo, el anterior en una línea «Antes». Los cambios que ejecutan un comando o afectan permisos llevan un aviso, y los que afectan permisos piden una confirmación aparte.
- AC6: CUANDO confirma ENTONCES Specty valida con el core y escribe en `.specty/config.yaml` solo las claves cambiadas, con el resto del archivo y sus comentarios igual. Después hace un commit solo de ese archivo con el trailer `Specty-Config: true`, y los hooks de git lo aceptan.
- AC7: CUANDO un valor no es válido, por ejemplo `size.M` mayor o igual que `size.L` ENTONCES su campo muestra el error del validador y no se puede guardar.
- AC8: CUANDO `specty ui` no lo arrancó una persona desde su terminal ENTONCES la página es de solo lectura y lo dice. El servidor rechaza el guardado, también si lo pide el agente en modo delegado.
- AC9: CUANDO la carpeta de `specty ui` tiene un cambio en curso, o `config.yaml` tiene cambios sin commit ENTONCES Specty no guarda y dice por qué.
- AC10: CUANDO la persona pulsa «Restablecer» en un ajuste modificado y guarda ENTONCES la clave sale del archivo y vuelve el valor por defecto.
- AC11: CUANDO la persona abre la vista Flujo ENTONCES ve las fases en línea, cada una con las piezas que la configuración equipa. La fase Tests solo aparece con `policy.tests: contract`.
- AC12: CUANDO está en Avanzado y elige una fase ENTONCES ve sus piezas equipadas, con sus ajustes, y la lista de piezas que se pueden equipar. Equipar, quitar o ajustar una pieza cambia las claves que la definen, y se guarda como en AC5 y AC6.
- AC13: CUANDO una pieza es una garantía de Specty ENTONCES se ve con candado y una frase que explica por qué no se quita, sin control para quitarla ni cambiarla. Lo son la aprobación de la spec, la del contrato de tests, la aceptación de la persona y el guard del agente.
- AC14: CUANDO está en Básico ENTONCES la línea de fases se ve sin controles para equipar ni quitar, con frases que dicen qué hace el flujo configurado. La vista General muestra solo los ajustes básicos, y una línea dice cuántos más hay en Avanzado.
- AC15: CUANDO la persona enciende o apaga la pieza «Modo delegado» ENTONCES se aplica al momento en el clon, igual que en el menú de preferencias.
- AC16: CUANDO está en Básico ENTONCES ve los perfiles Ligero, Equilibrado, Estricto y Propio, con marcado el que corresponde a la configuración: Propio si no coincide ninguno.
- AC17: CUANDO elige un perfil ENTONCES la línea de fases y sus frases muestran cómo quedaría el flujo. Al guardar, se escriben solo las claves que cambian, con el diálogo de AC5.
- AC18: CUANDO `flow.closing` es `false` y la persona acepta un cambio estándar ENTONCES el cambio queda hecho, archivado y aterrizado sin pasar por la fase de cierre. Con `true` o sin la clave, el cierre sigue como hoy.
- AC19: CUANDO se configuran las tareas que admite un cambio `quick`, cuándo se recomienda la revisión independiente y qué verificaciones ejecuta `task done` además de la de alcance ENTONCES `propose`, su tarjeta y `task done` los aplican. Sin las claves, se comportan como hoy.
- AC20: CUANDO se configuran los pesos y umbrales del tamaño, el aviso de «cerca de partir» y la tabla de esfuerzo ENTONCES el tamaño, ese aviso y el esfuerzo recomendado los usan. Sin las claves salen igual que hoy, y el modelo sigue sin poder bajar el tamaño ni el esfuerzo.
- AC21: CUANDO se configuran el umbral de sesión nueva, los tiempos y la versión de ccusage, reglas de riesgo propias, términos vagos o capas horizontales ENTONCES las tarjetas y los avisos los usan. Las reglas de riesgo propias se suman a las de Specty, que no se quitan.
- AC22: CUANDO se configuran en `internal` las esperas, los reintentos o la retención ENTONCES Specty los usa. Las vidas que forman parte del cumplimiento (A10) no se configuran.
- AC23: CUANDO se configuran en `internal` la salida máxima de un comando, la prioridad de las verificaciones, el tiempo del hook de Antigravity, los límites de lo que se muestra o los del servidor de la UI ENTONCES Specty los usa.
- AC24: CUANDO `ui.port` tiene un número y `specty ui` se arranca sin `--port` ENTONCES el servidor usa ese puerto.
- AC25: CUANDO existe una clave nueva de C5 a C9 ENTONCES la página la muestra en su sección con la marca «Nuevo». Las de `internal` van en una sección «Interno», plegada, con un aviso.
- AC26: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés, y `docs/formats.md` documenta cada clave nueva y el trailer `Specty-Config`.

## Diseño

- Core: carpeta nueva `packages/core/src/settings/`, con `catalog.ts` (los ajustes y sus marcas), `pieces.ts` (las piezas de cada fase y las claves que las definen, garantías incluidas), `presets.ts` (C4) y `diff.ts` (los cambios entre dos configuraciones, para el diálogo). Los textos van en `packages/core/src/cards/settings*.ts`. Todo esto se exporta desde `light.ts` y desde `index.ts`. Las claves nuevas van en módulos de `packages/core/src/schema/`, como `flow.ts`, `sizing.ts`, `usage.ts`, `warnings.ts` e `internal.ts`.
- CLI: `packages/cli/src/server/config.ts` sirve tres rutas. `GET /api/config` devuelve la entrada del archivo, los valores efectivos, los de por defecto, los errores, si se puede guardar y, si no, por qué. `POST /api/config/check` toma una entrada candidata y devuelve sus errores y su diff. `POST /api/config` guarda. El guardado va en `packages/cli/src/flow/config-save.ts`, que reutiliza el editor de `install/project-files.ts` y `commitWithReceipt`. `enforce/hook.ts` acepta el recibo `config`. Cada ruta va en `api.ts` (GET) y `actions.ts` (POST), con la puerta de las acciones de la persona.
- UI: carpeta nueva `packages/ui/src/settings/`, con la estructura de `memory/`: página, barra de herramientas, estado en la URL y en el navegador, y sus tests junto a cada fuente. Tiene la ruta `/settings` («Specty · Configuración»), un enlace «Configuración» en el encabezado y el diálogo «Revisar y guardar», con el estilo de los diffs de la revisión. El hilo principal importa de `@baquia-dev/specty-core/light`.
- C5 a C9 y C11 a C19: cada parámetro fijo pasa a leer su valor de la configuración resuelta. Las funciones de core que hoy usan una constante lo reciben como parámetro, con el valor de hoy por defecto. Cada corte añade sus claves al catálogo con la marca «Nuevo».

## Cortes

- C1: La página Configuración muestra todos los ajustes, en solo lectura
  - ac: AC1, AC2, AC3, AC4, AC26
- C2: El servidor valida y guarda los ajustes, con diff y commit
  - ac: AC6, AC8, AC9, AC10, AC26
  - depends: C1
- C3: La vista Flujo muestra las fases con sus piezas para ver, equipar y quitar
  - ac: AC11, AC12, AC13, AC14, AC15, AC26
  - depends: C10
- C4: Perfiles Ligero, Equilibrado y Estricto en el modo básico
  - ac: AC16, AC17, AC26
  - depends: C3
- C5: La fase de cierre y otras reglas del flujo pasan a ser ajustes
  - ac: AC18, AC19, AC25, AC26
  - depends: C3
- C6: El tamaño y el esfuerzo pasan a ser ajustes
  - ac: AC20, AC25, AC26
  - depends: C1
- C7: Los avisos de la spec y de las sesiones pasan a ser ajustes
  - ac: AC21, AC25, AC26
  - depends: C1
- C8: Las esperas, los reintentos y la retención pasan a ser ajustes internos
  - ac: AC22, AC25, AC26
  - depends: C1
- C9: La ejecución, la salida y el servidor pasan a ser ajustes internos
  - ac: AC23, AC24, AC25, AC26
  - depends: C1
- C10: La página guarda los ajustes con el diálogo Revisar y guardar
  - ac: AC5, AC7, AC8, AC9, AC10, AC26
  - depends: C2
- C11: El resto de esperas, bloqueos y retención pasan a ser ajustes internos
  - ac: AC22, AC25, AC26
  - depends: C8
- C12: La salida máxima de un comando pasa a ser un ajuste interno
  - ac: AC23, AC25, AC26
  - depends: C9
- C13: Los límites del servidor de la UI pasan a ser ajustes internos
  - ac: AC23, AC25, AC26
  - depends: C12
- C14: Los límites de lo que muestran las tarjetas pasan a ser ajustes internos
  - ac: AC23, AC25, AC26
  - depends: C12
- C15: Los límites de lo que muestran los comandos y los checks pasan a ser ajustes internos
  - ac: AC23, AC25, AC26
  - depends: C12
- C16: El tiempo del hook de Antigravity pasa a ser un ajuste interno
  - ac: AC23, AC25, AC26
  - depends: C12
- C17: Los intervalos de sondeo pasan a ser ajustes internos
  - ac: AC22, AC25, AC26
  - depends: C11
- C18: La caducidad de los bloqueos y del índice de restos pasa a ser un ajuste interno
  - ac: AC22, AC25, AC26
  - depends: C11
- C19: Las reglas de riesgo propias se suman a las de Specty
  - ac: AC21, AC25, AC26
  - depends: C7

## Riesgos

- R1: Guardar desde la UI es una vía nueva para cambiar permisos, como `scope.autoApprove` o `policy.tests`. Mitigación: la misma puerta que aprobar (A4), una confirmación aparte para esos cambios y un commit con trailer que queda en el historial.
- R2: Los ajustes internos permiten dejar Specty inservible, por ejemplo con esperas a cero o salidas mínimas. Mitigación: el schema pone mínimos, la sección «Interno» va plegada con un aviso y cada ajuste tiene «Restablecer».
- R3: Los cambios en curso siguen con la configuración de su rama hasta que incorporan main. Mitigación: el diálogo lo dice al guardar, y `accept` ya valida `config.yaml` después de incorporar main.
- R4: C8 y C9 tocan muchos archivos de la CLI. Si uno de esos cortes sale demasiado grande al proponerlo, se estrecha y se ajusta la épica antes de aprobarlo, como C4 de `20261107-verificacion-sin-repetir`. Así se dividió C2, que salió XL, en el servidor (C2) y la página (C10), lo que quedó fuera de C8 pasó a C11, lo que quedó fuera de C9 pasó a C12, lo que quedó fuera de C12, que también salió XL, pasó a C13 a C16, lo que quedó fuera de C11 al cerrarse pasó a C17 y C18, y las reglas de riesgo propias que dejó C7 pasaron a C19.
- R5: Las piezas de C3 tienen que corresponder a claves reales. Si una pieza no tiene clave hasta C5, se muestra sin control hasta que ese corte la añada.
