# Glosario del dominio

Términos de Specty que un agente podría nombrar mal, de los más concretos a los más comunes. Las tarjetas traen la definición de los que usa su texto, como mucho 3 y en este orden ([formats.md §6](formats.md#6-configyaml)).

- **Corte** (`Slice`): una parte de una épica que se entrega como un cambio propio, estructurado como un corte vertical de funcionalidad verificable de punta a punta.
- **Épica**: un cambio sin tareas que avanza por sus cortes verticales; exige criterios observables y prohíbe capas técnicas horizontales, priorizando la redacción previa de specs para agentes en paralelo.
- **Carril** (`ChangeKind`): el tipo de cambio: quick, standard, spike, retro o epic.
- **Ampliación** (`ScopeRequest`): pedir tocar un archivo fuera del alcance de la tarea.
- **Incorporación** (`IntegrationState`): traer la rama destino al cambio al cerrarlo.
- **Recibo** (`Receipt`): lo que deja Specty para que el pre-commit acepte su commit.
- **Bloqueo** (`LockHolder`): qué comando está cambiando un cambio; uno a la vez.
- **Cambio huérfano** (`orphan`): uno que espera al agente sin que ninguna sesión trabaje en él.
- **Entrada de la memoria** (`MemoryEntry`): un pendiente, una mejora, un recordatorio o una decisión, con id `Pn` o `Dn`.
- **Memoria de Specty** (`specty memory`): las entradas de la rama `specty-memory`, que todas las sesiones y carpetas ven.
- **Lección** (`lesson`): una entrada de la memoria con lo que un agente aprendió de unas rutas del código, que siempre las lleva.
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
