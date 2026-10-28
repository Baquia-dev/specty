---
kind: epic
---

# Tests como contrato y vocabulario del dominio

## Objetivo

Specty ya hace cumplir la parte de SDD: la spec antes del código, aprobada por una persona y trazable hasta cada línea. La de TDD sigue siendo texto en la tarjeta de tarea («míralo fallar», «no cambies un test que ya existía»): nada comprueba que el test fallara antes del código, ni impide que el agente lo cambie para que pase. Esta épica toma de cada metodología lo que mejor funciona con agentes:
- De TDD, los tests como contrato. Con `policy.tests: contract`, el agente escribe primero los tests de los criterios, Specty comprueba que fallan y la persona los aprueba antes del código (gate 2). Desde ahí quedan bloqueados, y solo la persona puede desbloquear uno.
- De SDD, la trazabilidad completa: cada criterio enlaza con sus tests, y un criterio sin test no está verificado.
- De FDD, el vocabulario del dominio: un glosario que llega a cada tarjeta con los términos que usa, para que el agente no invente nombres.

La ceremonia depende del tipo de trabajo: el gate 2 solo en features, el bloqueo automático en bugs, y lo demás como hoy.

## Fuera de alcance

- Hacer `contract` el valor por defecto: se decide después de probarlo en este repositorio, en un cambio aparte (decisión de la persona, 2026-10-27).
- El gate 2 en cambios sin features (bugs, refactors, quick), por decisión de la persona.
- Medir la cobertura o exigir un umbral: es de la configuración del runner, que Specty ya ejecuta.
- Detectar una implementación que reconoce los casos del test (mutation testing): queda para la revisión independiente del diff.
- Exigir el rojo test a test leyendo informes JUnit XML: será un seguimiento si el rojo del comando se queda corto al usarlo.
- Specs vivas por capacidad, al estilo de OpenSpec: la spec del cambio sigue atada al hash de su aprobación.
- Bloquear tests caso a caso dentro de un archivo: el bloqueo es por archivo (A3).

## Supuestos

- A1: Pasa por la fase de tests un cambio `standard` con alguna tarea `feat` (el tipo por defecto) y `policy.tests: contract`; un cambio `quick` no tiene criterios, así que no pasa por el gate 2 aunque su tarea sea `feat`, y si es `fix` sigue el ciclo de un bug (AC11).
  - impacto: alto
- A2: En modo delegado, el agente aprueba los tests (gate 2) igual que aprueba la spec, porque la persona renunció a revisar (ADR 0010); el bloqueo sigue valiendo, y desbloquear un test queda siempre fuera del modo delegado.
  - impacto: alto
- A3: El bloqueo es por archivo y completo, porque también una línea añadida puede debilitar un test aprobado (un mock que el runner eleva al principio del archivo, un `return`); los tests que añada la implementación van en archivos nuevos.
  - impacto: alto
- A4: Un error de compilación de un test nuevo cuenta como rojo, como en el TDD clásico, así que en la fase de tests no se escribe código de producción, ni siquiera firmas.
- A5: Los runners de los stacks con ejemplo en docs/checks.md nombran en su salida el archivo o la clase de cada test que falla, así que Specty puede comprobar que el rojo viene de los tests nuevos; C2 lo comprueba con salidas grabadas.
- A6: Los ids de criterio se repiten entre cambios (`AC1` en cada uno), así que la trazabilidad solo mira las líneas de test que añade el cambio, y `specty why` resuelve las antiguas por su commit.
- A7: La persona activa `policy.tests: contract` en este repositorio en cuanto C3 llegue a main y el CLI de la carpeta principal esté construido, y los cortes siguientes se trabajan así: es la prueba antes de hacerlo el valor por defecto (el agente no puede editar `.specty/config.yaml`).

## Criterios de aceptación

- AC1: CUANDO un test que añade el cambio lleva en su nombre el id de un criterio ENTONCES la tarjeta de aceptación lo muestra junto a ese criterio, con el commit que lo añadió.
- AC2: CUANDO un criterio sin `test: manual` no aparece en ninguna línea de test que añadió el cambio ENTONCES `specty check --spec` lo señala: como aviso con `recommended` y como fallo con `contract`.
- AC3: CUANDO un criterio lleva `test: manual` ENTONCES no exige test, y la aceptación lo lista como comprobación de la persona.
- AC4: CUANDO se aprueba la spec de un cambio que pasa por la fase de tests (A1) ENTONCES el cambio entra en `testing`, donde el guard deja escribir solo los tests del alcance del cambio y rechaza el resto del código gobernado con un SIGUIENTE que lleva a `specty propose`.
- AC5: CUANDO el agente envía los tests con `specty propose` y la verificación pasa, o su salida no nombra alguno de los tests nuevos ENTONCES Specty rechaza el envío y dice qué test no está en rojo.
- AC6: CUANDO la verificación falla por los tests nuevos ENTONCES Specty hace un commit solo con los tests y el cambio espera a la persona (gate 2).
- AC7: CUANDO la persona aprueba los tests con `specty approve` o desde la UI, o el agente en modo delegado ENTONCES el cambio pasa a `implementing` y la auditoría registra quién los aprobó.
- AC8: CUANDO el agente intenta editar o borrar un test aprobado ENTONCES el guard lo rechaza y su SIGUIENTE le pide parar y explicárselo al usuario o pedir el desbloqueo.
- AC9: CUANDO un test aprobado no coincide con el hash guardado al aprobarlo y no tiene un desbloqueo aprobado ENTONCES `specty check --spec` falla con `tests-locked`, en local y en la CI.
- AC10: CUANDO el agente pide desbloquear un test ENTONCES la solicitud nunca se aprueba sola ni la decide el agente en modo delegado, solo la persona; al completar la tarea, la versión nueva queda bloqueada y la aceptación la muestra.
- AC11: CUANDO un cambio con `contract` tiene tareas `fix` y ninguna `feat` ENTONCES el test que reproduce el fallo pasa por el rojo y queda bloqueado sin esperar a la persona.
- AC12: CUANDO una tarea `refactor` o `perf` de un cambio con `contract` quita aserciones de un test que ya existía ENTONCES `task done` no la completa.
- AC13: CUANDO se aprueba un ajuste de un cambio con `contract` ENTONCES un criterio modificado desbloquea sus tests y vuelve a la fase de tests con el gate 2, y una tarea de defecto sigue el ciclo de un bug.
- AC14: CUANDO el glosario define un término que aparece en la spec o en la tarea ENTONCES la tarjeta del borrador, de los tests o de la tarea trae su definición, solo la de esos términos y dentro del presupuesto de la tarjeta.
- AC15: CUANDO `init` prepara un proyecto sin glosario ENTONCES lo crea con pistas, y `specty doctor` avisa mientras siga con solo las pistas.
- AC16: CUANDO el cambio llega al cierre ENTONCES la tarjeta del cierre pide añadir al glosario los términos que el cambio introdujo o renombró.
- AC17: CUANDO la persona abre en la UI un cambio en `testing` o en aceptación ENTONCES ve los tests nuevos con su rojo y puede aprobarlos, ve los tests bloqueados y las solicitudes de desbloqueo, y ve la matriz criterio → tests con los criterios manuales.
- AC18: CUANDO `policy.tests` no es `contract` ENTONCES ningún cambio pasa por la fase de tests ni bloquea tests, y el flujo es el de hoy.
- AC19: CUANDO el test de fricción recorre una feature y un bug con `contract` ENTONCES cada bloqueo se resuelve por su SIGUIENTE y las cifras de comandos quedan fijadas.

## Diseño

- Decisiones de la persona (2026-10-27): el gate 2 solo en features; desbloquear un test queda fuera del modo delegado; `contract` empieza como opción y pasa a ser el valor por defecto después de probarlo en Specty.
- `policy.tests` gana el valor `contract`, por encima de `required`. Sin él, nada cambia (AC18).
- Fase `testing`, entre `review` e `implementing`, con el patrón de `closing`: el agente trabaja y envía, y después espera a la persona. El código gobernado solo se abre a los tests del alcance (lo que `isTestFile` reconoce entre los tests implícitos de Archivos o en Archivos), y la spec queda bloqueada.
- El envío es `specty propose`. Specty exige que cada criterio tenga su test (C1), ejecuta la verificación de las tareas, exige que falle nombrando cada test nuevo y hace un commit solo con los tests, con los trailers del cambio. La aprobación es `specty approve`, que ya elige el cambio por la decisión que espera, y la UI usa la misma acción.
- Bloqueo: al aprobar, `state.json` guarda el hash de cada test enviado. El guard rechaza escribirlos o borrarlos con una regla nueva, como la de los archivos protegidos, y `check --spec` compara los hashes (`tests-locked`). Desbloquear es una solicitud de `specty scope add` sobre un test bloqueado: nunca se aprueba sola y el modo delegado no la cubre, como `delegate` y `uninstall`. Al completar la tarea, el hash nuevo sustituye al aprobado.
- Trazabilidad: el nombre del test lleva el id del criterio, y `criteria-tested` busca los ids en las líneas añadidas de los tests del cambio. Un criterio acepta el campo `test: manual`, como `impacto` en los supuestos; no se llama `verify` para no confundirlo con el comando de las tareas.
- Ceremonia por tipo de trabajo, con `contract`:
  - feature (`standard` con alguna tarea `feat`): fase de tests y gate 2;
  - bug (solo tareas `fix`, también en `quick`): fase de tests y rojo, con bloqueo sin gate 2;
  - refactor y perf: sin fase de tests; quitar aserciones de un test que ya existía pasa de aviso a error;
  - ajustes: un refinamiento vuelve a la fase de tests para su criterio, y un defecto sigue el ciclo de un bug;
  - spike, retro y épica: como hoy.
- Glosario: un archivo del proyecto, por ejemplo `docs/dominio.md`, con la ruta en `config.yaml` y una línea por término (definición y nombre en el código). Las tarjetas del borrador, de los tests y de la tarea traen las definiciones de los términos que aparecen en su texto, y la del cierre pide actualizarlo. Es contexto justo a tiempo: AGENTS.md no crece.
- La plantilla de la épica sugiere títulos de corte con la forma «acción + resultado + objeto» de FDD.
- C1 escribe el ADR 0014 «Los tests como contrato» con estas decisiones.

## Cortes

- C1: Cada criterio se comprueba con un test que lleva su id
  - ac: AC1, AC2, AC3
- C2: Los tests de una feature se ven fallar y se aprueban antes del código
  - ac: AC4, AC5, AC6, AC7, AC18, AC19
  - depends: C1
- C3: Los tests aprobados no se pueden cambiar sin permiso de la persona
  - ac: AC8, AC9, AC10
  - depends: C2
- C4: Los bugs, los refactors y los ajustes siguen su propio ciclo de tests
  - ac: AC11, AC12, AC13, AC19
  - depends: C3
- C5: El vocabulario del dominio llega con las tarjetas que lo usan
  - ac: AC14, AC15, AC16
- C6: La UI muestra la fase de tests, los bloqueos y la matriz de criterios
  - ac: AC17
  - depends: C1, C4

## Riesgos

- R1: El gate 2 suma comandos a cada feature: unos dos del agente y uno de la persona. Mitigación: solo con `contract` y solo en features, y el test de fricción fija las cifras (AC19).
- R2: Un rojo que no viene de los tests nuevos, porque otro test ya fallaba o por un error ajeno. Mitigación: la salida tiene que nombrar cada test nuevo (A5), y la persona ve el rojo en el gate 2.
- R3: Un test bloqueado mal escrito frena al agente, sobre todo en modo delegado, donde no puede desbloquearlo. Mitigación: el guard y la tarjeta le piden parar y explicarlo, y la persona decide desde la terminal o la UI.
- R4: El bloqueo por archivo obliga a poner en archivos aparte los tests que añade la implementación (A3). Mitigación: la tarjeta lo dice, y si estorba al probarlo en Specty (A7), se revisa antes de hacer `contract` el valor por defecto.
- R5: Las reglas de tests y el glosario hacen crecer las tarjetas. Mitigación: el test de presupuesto del core (1.500 tokens) y un límite de términos por tarjeta.
- R6: La fase nueva toca a la vez la máquina de estados, el guard, los comandos, los textos y la UI. Mitigación: los cortes separan el core y la CLI de la UI, y cada corte cumple los límites de división.

## Cierre

### Resumen

Los seis cortes están en main:
- C1: cada criterio enlaza con los tests que llevan su id, con su tarea y su commit; `criteria-tested` avisa de los criterios sin test, y `test: manual` los deja a la persona. ADR 0014.
- C2: con `policy.tests: contract`, una feature aprobada pasa a `testing`, donde solo se escriben tests; `specty propose` exige que fallen nombrando cada test nuevo y hace un commit solo con ellos, y `specty approve` es el gate 2.
- C3: los tests aprobados quedan bloqueados por hash, en el guard y en `tests-locked`; solo la persona desbloquea uno, y al terminar la tarea vuelve a bloquearse.
- C4: un bug ve fallar su test y lo bloquea sin esperar a la persona, un refactor o un perf no quita aserciones, y un ajuste que modifica un criterio desbloquea sus tests y vuelve al gate 2.
- C5: el glosario llega a las tarjetas del borrador, de los tests y de la tarea con los términos que usan, y la del cierre pide actualizarlo; `init` lo crea con pistas y `doctor` avisa mientras solo las tenga.
- C6: la UI enseña los tests enviados con su rojo y deja aprobarlos, los tests bloqueados y sus desbloqueos, y los tests de cada criterio en Aceptación.

### Desviaciones (respecto al plan)

- Los cortes C2, C3, C4 y C6 llevaron cambios previos para caber en los límites de división. La fase `testing` toca un `Record<Phase>` en core, la CLI y la UI, así que la persona subió `split.maxModules` a 3.
- AC15 salió de C5 por tamaño y se hizo en un cambio de seguimiento. C1 también tuvo uno: el id cuenta solo en el nombre de un test o en un comentario, y la matriz enseña como mucho 3 tests por criterio.
- A7 no se cumplió como estaba escrito: `contract` no se activó en este repositorio tras C3, así que C4, C5 y C6 se trabajaron con `recommended`. La persona lo activa al cerrar la épica.
- En dos tareas (T3 del corte C3 y T2 del primer cambio previo de C6) los tests se escribieron sin verlos fallar antes del código. Está anotado en sus cierres.

### Decisiones

- El ciclo de tests se decide al aprobar la spec y se guarda en `state.json`, porque al enviar los tests ya no queda la revisión anterior para comparar criterios.
- Un desbloqueo se reconoce por la ruta del test bloqueado, no por un campo nuevo de la solicitud: así lo leen igual `scope add`, el guard, `tests-locked` y la UI.
- `tests-locked` es una comprobación común: se ejecuta también sin `--spec` y en la CI.
- Cada tarjeta trae como mucho 3 términos del glosario, en líneas de 100 caracteres, para no pasar del presupuesto de 1.500 tokens.

### Pendientes

- Probar `contract` en este repositorio (A7) y decidir después, en un cambio aparte, si pasa a ser el valor por defecto. Antes conviene revisar si el bloqueo por archivo estorba (R4).
- Leer el rojo test a test con JUnit XML, si nombrar el test en la salida del comando se queda corto (R2).
- Specty no tiene glosario propio: hasta que lo tenga, sus tarjetas no traen términos.
- Avisos de `max-lines` que quedan: `fixtures.ts` de la UI, `cards/index.ts`, `cards/doctor.ts` y `schema/config.ts`.
