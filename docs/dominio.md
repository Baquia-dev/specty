# Glosario del dominio

Términos de Specty que un agente podría nombrar mal, de los más concretos a los más comunes. Las tarjetas traen la definición de los que usa su texto, como mucho 3 y en este orden ([formats.md §6](formats.md#6-configyaml)).

- **Corte** (`Slice`): una parte de una épica que se entrega como un cambio propio, estructurado como un corte vertical de funcionalidad verificable de punta a punta.
- **Épica**: un cambio sin tareas que avanza por sus cortes verticales; exige criterios observables y prohíbe capas técnicas horizontales, priorizando la redacción previa de specs para agentes en paralelo.
- **Subagente** (`agent_id`; en OpenCode, una sesión hija): un agente que lanza la sesión para hacer parte de su trabajo; para el guard es una conversación propia, que entra con `specty enter` en la carpeta de un cambio y queda atada a ella.
- **Encargo** (`briefOf`): el texto que la tarjeta de una épica da para un corte listo o huérfano, y que la sesión pasa tal cual a un subagente para que cree o retome su cambio y lo cierre.
- **Carril** (`ChangeKind`): el tipo de cambio: quick, standard, spike, retro o epic.
- **Ampliación** (`ScopeRequest`): pedir tocar un archivo fuera del alcance de la tarea.
- **Incorporación** (`IntegrationState`): traer la rama destino al cambio al cerrarlo.
- **Recibo** (`Receipt`): lo que deja Specty para que el pre-commit acepte su commit.
- **Bloqueo** (`LockHolder`): qué comando está cambiando un cambio; uno a la vez.
- **Plaza de verificación** (`verify.slots`, `inSlots`): una de las verificaciones que corren a la vez en el clon; la de una tarea ocupa una, y la completa, todas.
- **Unidad de verificación** (`verify.units`, `VerifyUnit`): una parte de la verificación completa, con su comando y los archivos de los que depende; no se repite si ya pasó con la misma huella en el clon.
- **Registro de unidades** (`.git/common/specty/verified/`, `fullPlan`): las unidades que pasaron, una por huella, en cualquier cambio y worktree del clon; la verificación completa de `accept`, la incorporación, `specty integrate` y la UI no repiten las que están en él; `specty prune` borra las anotadas hace más de 30 días (`pruneRecord`).
- **Test lento** (`checks.testTime`, `test-time`): un test que, según el informe JUnit que dejó la misma ejecución, tardó más de `maxMs`; `specty check` avisa de él y la nota de la verificación de `accept` muestra los cinco primeros.
- **Verificación fresca** (`specty verify --fresh`): la verificación completa entera, sin el registro de las unidades que ya pasaron, que repite una vez la que falla.
- **Unidad inestable** (`flaky`): una unidad que en una verificación fresca falla y pasa al repetirla; queda en la memoria como lección de sus `paths`.
- **Cambio huérfano** (`orphan`): uno que espera al agente sin que ninguna sesión trabaje en él.
- **Cambio sin carpeta** (`lost`, `specty restore`): uno abierto cuya carpeta se borró o git podó, y que sigue en su rama, desde la que se recupera.
- **Entrada de la memoria** (`MemoryEntry`): un pendiente, una mejora, un recordatorio o una decisión, con id `Pn` o `Dn`.
- **Memoria de Specty** (`specty memory`): las entradas de la rama `specty-memory`, que todas las sesiones y carpetas ven.
- **Lección** (`lesson`): una entrada de la memoria con lo que un agente aprendió de unas rutas del código, que siempre las lleva.
- **Frente** (`Front`, `specty front`): una parte del trabajo de la memoria, con las rutas que abarca y sus pendientes y mejoras en orden, para repartirlo entre sesiones. No es un carril, que es el tipo de cambio.
- **Disparador** (`due`, `paths`, `onClose`): lo que hace salir un recordatorio de la memoria, un día, tocar unas rutas o que se archive un cambio; hasta entonces no sale en cada sesión.
- **Bitácora** (`specty note`): las notas de un cambio en su audit (`change.noted`); la tarjeta de `next` muestra las tres últimas.
- **Mensaje** (`MessageView`, `specty message`): lo que una sesión o la persona deja para la sesión de un cambio abierto; le llega una vez, tras su siguiente comando.
- **Test aprobado** (`lockedTests`): un test que aprobó la persona, o el rojo de un bug; solo cambia con un desbloqueo.
- **Ciclo de tests** (`TestCycle`): con `contract`, el de una feature (gate 2) o el de un bug (su rojo se bloquea solo).
- **Modo delegado** (`Delegation`): el agente aprueba, acepta y cierra por la persona.
- **Retro-spec**: la spec que documenta después cambios hechos sin spec.
- **Hallazgo**: lo que una tarea aprendió (`task done --finding`) para las siguientes.
- **Observación** (`ReviewRemark`): una viñeta alta o media de la última revisión independiente del resultado, con su referencia `diff-<n>.md#<número>`; la que el cierre no cita pasa a la memoria como pendiente.
- **Guard** (`GuardDecision`): el hook que decide si la fase permite cada acción del agente.
- **Supuesto** (`Assumption`): lo que la spec da por cierto; con impacto alto, lo confirma la persona.
- **Criterio** (`Criterion`): un resultado observable con id `ACn`, que su test lleva en el nombre.
- **Fase** (`Phase`): el punto del flujo de un cambio, de draft a done o cancelled.
- **Tarjeta**: la salida de un comando para el agente, que acaba en SIGUIENTE.
