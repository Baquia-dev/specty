# 0014 · Los tests como contrato

- Estado: aceptada
- Fecha: 2026-10-27

## Contexto

Specty hace cumplir el desarrollo guiado por especificaciones: la spec antes del código, aprobada por una persona, y cada línea trazable hasta su criterio. Con agentes, TDD gana valor por dos motivos. Un test es una especificación ejecutable, sin ambigüedad. Y le da al agente un oráculo para iterar solo hasta el verde. Su riesgo con IA es que el agente haga trampa: que cambie el test para que pase, escriba aserciones vacías o escriba tests que confirman sus propios errores.

Hasta ahora, en Specty el test primero era texto en la tarjeta de tarea («míralo fallar», «no cambies un test que ya existía»), con un aviso cuando una tarea quitaba aserciones. Nada comprobaba que el test fallara antes del código, ni impedía cambiarlo después. Tampoco había un enlace entre un criterio y los tests que lo comprueban.

De FDD faltaba el vocabulario del dominio: sin él, el agente inventa nombres distintos en cada módulo.

## Decisión

- **Los tests son el contrato de los criterios.** Con `policy.tests: contract`, un cambio con features pasa por una fase de tests tras aprobar la spec. El agente escribe los tests de los criterios, Specty comprueba que fallan y la persona los aprueba antes del código: es el segundo punto de revisión, tras la spec.
- **Los tests aprobados quedan bloqueados.** Specty guarda su hash al aprobarlos. El guard rechaza cambiarlos, y `specty check --spec` lo comprueba también en la CI. Desbloquear uno es una solicitud que decide la persona.
- **Cada criterio enlaza con sus tests.**
  - El nombre del test lleva el id del criterio.
  - `criteria-tested` avisa del criterio de una tarea `feat` o `fix` que ningún test nombra.
  - La aceptación muestra cada criterio con sus tests y el commit que los añadió.
  - Un criterio que ningún test puede comprobar lleva `test: manual`, y lo comprueba la persona al aceptar.
- **La ceremonia depende del tipo de trabajo.**
  - Las features pasan por la fase de tests, con la revisión de la persona.
  - En los bugs, el test que reproduce el fallo tiene que fallar y se bloquea sin esa revisión.
  - Los refactors no pueden quitar aserciones de los tests que ya existen.
  - Los spikes, las retro-specs y las épicas siguen como antes.
- **El vocabulario del dominio llega justo a tiempo.** El proyecto tiene un glosario, y cada tarjeta trae solo los términos que usa. El cierre pide actualizarlo.
- **Es determinista** ([ADR 0001](0001-sin-llm.md) y [ADR 0012](0012-lo-verificable-lo-verifica-specty.md)): Specty ejecuta los comandos del proyecto y lee sus resultados, sin modelos.

Decisiones del usuario del 2026-10-27:

- La revisión de los tests es solo para features.
- Desbloquear un test queda fuera del modo delegado ([ADR 0010](0010-modo-delegado.md)): lo decide siempre la persona. Aprobar los tests sí se delega, como aprobar la spec.
- `contract` empieza como opción, y pasará a ser el valor por defecto después de probarlo en este repositorio, en un cambio aparte. Hecho el 2026-10-29, tras usarlo aquí desde el 2026-10-28: `init` escribe `contract` en un proyecto nuevo. Una configuración sin la clave sigue en `recommended`, para no cambiarle el flujo a un proyecto que ya existía.
- Un cambio `quick` no pasa por la revisión de los tests, porque no tiene criterios; si es un bug, sigue el ciclo de un bug.
- El bloqueo es por archivo y completo, y un error de compilación de un test nuevo cuenta como rojo, como en el TDD clásico.

## Cortes

Cada corte es un cambio hijo de la épica `20261027-tests-como-contrato-y-vocabulario-del-dominio`:

1. Cada criterio se comprueba con un test que lleva su id: `test: manual`, `criteria-tested`, la matriz de aceptación y este ADR.
2. Los tests de una feature se ven fallar y se aprueban antes del código: el valor `contract` y la fase `testing`.
3. Los tests aprobados no se pueden cambiar sin permiso de la persona.
4. Los bugs, los refactors y los ajustes siguen su propio ciclo de tests.
5. El vocabulario del dominio llega con las tarjetas que lo usan.
6. La UI muestra la fase de tests, los bloqueos y la matriz de criterios.

## Consecuencias

- Una feature con `contract` suma un punto de revisión y unos comandos, que fija el test de fricción. A cambio, la persona revisa los tests, más cortos que la implementación, y el agente no puede ajustarlos a su código.
- Los tests que añada la implementación van en archivos nuevos, porque una línea añadida también puede debilitar un test aprobado: un mock que el runner eleva al principio del archivo, o un `return`.
- El rojo se comprueba con el comando entero. Si se queda corto, un seguimiento leerá los informes JUnit XML, que generan casi todos los runners, para exigirlo test a test.
- Specty no mide la cobertura ni exige un umbral: es de la configuración del runner, y con IA es la métrica más fácil de inflar.
- La spec de un cambio sigue atada al hash de su aprobación. Lo que cambie al implementar va al Cierre o a un ajuste, no a reescribir la spec.
