---
kind: epic
---

# Los pendientes de la épica de unidades

## Objetivo

La épica `20261105-verificacion-por-unidades` dejó once pendientes en la memoria de Specty. Unos son fallos que dejaron carpetas de cambio sin salida: una configuración inválida que llega de main, el merge de `close` cuando el cierre sin commit toca un archivo que main también cambió, y un `specty new` que falla a medias. Otros son cabos de las unidades: el registro, que nunca se limpia, y dos lecturas del árbol a la vez, que se pisan. También quedaron los tests lentos, que este repositorio aún no mide, y la verificación fresca, que no nombra los tests que fallan ni se ve en vivo. Con esta épica se cierran todos, cada uno en su corte.

## Fuera de alcance

- Editar `.specty/config.yaml`: lo hace la persona. Los `paths` que faltan en las unidades (P141) y los valores de `checks.testTime` de este repositorio son suyos.
- Los pendientes que no salieron de esa épica (P135, P136 y P140).
- Cambiar qué decide cada unidad o cómo se calcula su huella.

## Supuestos

- A1: `specty prune` borra del registro de unidades (`.git/common/specty/verified/`) los archivos anotados hace más de 30 días, sin configuración: una unidad que vuelve a pasar se anota de nuevo. La limpieza ocurre solo cuando alguien ejecuta `prune`.
  - impacto: alto
- A2: El índice temporal de `treeWith` lleva un nombre único por llamada (con `randomUUID` o un contador del proceso), y se borra al terminar como hoy.
- A3: Mover `verify` a `schema/verify.ts` no cambia el formato ni el comportamiento: lo que hoy acepta y resuelve `schema/config.ts` lo acepta y lo resuelve igual, y la API pública de core no cambia de nombres.
- A4: Si `specty new` encuentra `.git/config` bloqueado por otro proceso, lo reintenta unas veces con espera. Si aun así falla, deshace la worktree y la rama que acaba de crear, y la salida dice que se puede repetir.
  - impacto: alto
- A5: El aviso de `propose` (P129) es un aviso y no bloquea. Sale con `policy.tests: contract` cuando una tarea con código que no es la última tiene una `verify` que ejecuta el typecheck de todo un paquete y algún test aprobado de una tarea posterior está en ese paquete. Sugiere ejecutar en esa tarea solo sus tests.
- A6: `close` hace el commit del cierre (la spec, el estado y `docs/dominio.md`) antes de incorporar main. Así, el merge no choca con archivos sin commit, y un conflicto queda para `specty integrate` como cualquier otro.
  - impacto: alto
- A7: Tras incorporar main, `accept` y `close` validan `.specty/config.yaml`. Si no es válida, deshacen el merge, la carpeta del cambio sigue como estaba y la salida dice a la persona que la arregle en main. Si la configuración de una carpeta ya no es válida, `specty next` dice que la arregle la persona, con el error, porque el guard no deja al agente editarla.
  - impacto: alto
- A8: Cada paquete de este repositorio escribe su informe JUnit en `coverage/junit.xml`, que `.gitignore` ya ignora: Vitest con `reporters` y `outputFile`, y la UI con las opciones equivalentes de `@angular/build:unit-test`. Cambiar esas configuraciones cambia las huellas de las unidades, que corren una vez de nuevo.
  - impacto: alto
- A9: `specty verify --fresh` nombra los tests que fallaron en un intento leyendo los informes JUnit escritos durante ese intento, con los patrones de `checks.testTime.reports`. Sin `checks.testTime`, o sin informes, muestra el final de la salida como hoy.
- A10: La verificación fresca corre en vivo como la de `accept`: cada intento con su archivo en `runs/`, que la UI y la MCP App ya muestran. `specty_verify` es una herramienta del servidor MCP que ejecuta `specty verify --fresh` y devuelve su tarjeta, como `specty_check` y `specty_integrate`.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty prune` y el registro de unidades tiene archivos anotados hace más de 30 días ENTONCES los borra, deja los recientes y dice cuántos borró.
- AC2: CUANDO dos lecturas del árbol corren a la vez en el mismo proceso ENTONCES cada una da el árbol de su contenido.
- AC3: CUANDO se lee `.specty/config.yaml` ENTONCES `verify` se valida y se resuelve igual que antes desde su propio módulo del esquema, y `schema/config.ts` queda por debajo de 300 líneas de código.
- AC4: CUANDO `specty new` no puede escribir la configuración de git porque otro proceso la tiene bloqueada ENTONCES lo reintenta, y si sigue sin poder no deja ni la carpeta ni la rama que creó.
- AC5: CUANDO, con `policy.tests: contract`, una tarea con código que no es la última ejecuta en su `verify` el typecheck de un paquete donde hay tests aprobados de tareas posteriores ENTONCES `propose` avisa y sugiere ejecutar solo los tests de esa tarea.
- AC6: CUANDO el cierre sin commit toca un archivo que main también cambió ENTONCES `close` incorpora main igualmente: sin conflicto, cierra; con conflicto, deja la incorporación para `specty integrate`.
- AC7: CUANDO la incorporación de main en `accept` o `close` trae un `.specty/config.yaml` inválido ENTONCES deshace el merge, la carpeta del cambio sigue funcionando y la salida dice a la persona que lo arregle en main.
- AC8: CUANDO la configuración de una carpeta no es válida ENTONCES `specty next` dice que la arregle la persona, con el error.
- AC9: CUANDO se ejecutan los tests de cada paquete de este repositorio ENTONCES cada uno deja su informe JUnit en `coverage/junit.xml`.
- AC10: CUANDO en `specty verify --fresh` una unidad falla y sus informes JUnit nombran los tests que fallaron ENTONCES la tarjeta nombra esos tests con su archivo.
- AC11: CUANDO se ejecuta `specty verify --fresh` ENTONCES la UI y la MCP App la ven en vivo, como las demás verificaciones.
- AC12: CUANDO un cliente MCP llama a `specty_verify` ENTONCES se ejecuta la verificación fresca y la herramienta devuelve su tarjeta.
- AC13: CUANDO salen los textos nuevos de estos cortes ENTONCES salen en español y en inglés.

## Cortes

- C1: El registro de unidades se limpia y sus lecturas del árbol no se pisan
  - ac: AC1, AC2, AC13
- C2: verify tiene su propio módulo del esquema
  - ac: AC3
- C3: specty new no deja carpetas a medias
  - ac: AC4, AC13
- C4: propose avisa del typecheck completo en una tarea que no es la última
  - ac: AC5, AC13
- C5: close incorpora main aunque el cierre toque lo mismo que main
  - ac: AC6
- C6: Una configuración inválida de main no deja la carpeta sin salida
  - ac: AC7, AC8, AC13
  - depends: C5
- C7: Este repositorio escribe los informes JUnit de sus tests
  - ac: AC9
- C8: La verificación fresca nombra los tests que fallaron
  - ac: AC10, AC13
  - depends: C7
- C9: La verificación fresca se ve en vivo y desde MCP
  - ac: AC11, AC12, AC13
  - depends: C8

## Cierre

### Resumen

Los once pendientes de la épica de unidades quedan resueltos en nueve cortes. `specty prune` borra del registro de unidades lo anotado hace más de 30 días, y cada lectura del árbol usa su propio índice temporal (C1). `verify` tiene su módulo del esquema y `schema/config.ts` baja de 300 líneas de código (C2). `specty new` reintenta la configuración de git bloqueada y, si no puede, deshace la carpeta y la rama que creó (C3). `propose` avisa de un typecheck completo en una tarea que no es la última (C4). `close` hace el commit del cierre antes de incorporar main cuando main tocó sus archivos (C5). Una configuración inválida que llega de main deshace el merge, y `next` le dice al agente que la corrige la persona (C6). Los tests de core, exporters y cli escriben su informe JUnit (C7), y la continuación lo extendió a vscode, la UI y evals (330b043). `specty verify --fresh` nombra los tests que fallaron (C8), se ve en vivo y tiene la herramienta MCP `specty_verify` (C9). Las verificaciones de estos cambios ya reutilizaron unidades del registro: la continuación de JUnit no repitió core, exporters ni cli.

### Desviaciones

- C7 tocaba seis paquetes y `split.maxModules` es 3: se redujo a core, exporters y cli, y vscode, la UI y evals fueron a un cambio de continuación fuera de la épica (P149, cerrado en 330b043).
- Los seis `specty new` lanzados a la vez reprodujeron P128 en C4 y C5: dejaron dos carpetas vacías en main, que se borraron, y esos cortes llevan el sufijo `-2`.
- La aceptación de C2 falló dos veces por el entorno, no por el código: un test de la UI por carga y la carpeta de cobertura ocupada por otro Vitest de la misma carpeta (anotado en la memoria).
- C5 cambió con S1 una expectativa equivocada de su propio test, que la persona desbloqueó.

### Decisiones

- Cada corte lo llevó un subagente, en paralelo cuando no dependía de otro; las aprobaciones, aceptaciones y cierres los tomó el agente principal en modo delegado, salvo desbloquear el test de C5, que es de la persona.
- Las carpetas vacías que dejaba el fallo de P128 se borraron solo tras comprobar que no tenían cambio, ni nada sin commit, y que su rama ya estaba en main.

### Pendientes

- P154: el guard sigue tratando como «otra worktree» una carpeta con la configuración inválida (en curso en su propio cambio).
- P150: el merge de una incorporación se detiene sin nombrar el archivo sin commit que main también cambió (en curso en su propio cambio).
- P141: los `paths` que faltan en las unidades y `checks.testTime` en `.specty/config.yaml` los escribe la persona.
