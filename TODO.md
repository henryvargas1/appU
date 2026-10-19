# TODO de UniFlow

## Cuenta, privacidad y datos del usuario

- [ ] La aplicación debe permitir iniciar sesión con la autenticación administrada de Manus.
- [ ] Los datos deben estar separados por usuario y las tablas de negocio deben validar la pertenencia antes de leer o modificar información.
- [ ] Los archivos y registros deben tener autorización en servidor.
- [ ] La aplicación debe ofrecer eliminación lógica de entradas y opción de exportación.

## Inicio y captura rápida desde iPhone

- [ ] La aplicación debe mostrar un resumen de tareas próximas, sesiones de estudio y recordatorios.
- [ ] La aplicación debe mostrar un indicador de progreso semanal.
- [ ] La aplicación debe permitir iniciar con un toque una captura de texto, foto, audio o archivo.
- [ ] El usuario debe poder escribir texto libre como “Recordatorio: presentación de sociología el viernes”.
- [ ] El usuario debe poder tomar o seleccionar una foto del tablero, cuaderno o diapositiva.
- [ ] El usuario debe poder grabar audio desde el iPhone.
- [ ] El usuario debe poder seleccionar documentos desde Archivos.
- [ ] Las capturas deben entrar en una bandeja de entrada para revisar y confirmar la clasificación sugerida.
- [ ] El usuario debe poder corregir materia, fecha, prioridad y tipo antes de guardar.

## Procesamiento en la nube

- [ ] Las fotos y documentos deben guardarse en almacenamiento de objetos administrado.
- [ ] El servidor debe extraer texto y datos accionables mediante los servicios de IA disponibles.
- [ ] Los audios deben transcribirse en español y el texto debe quedar asociado al audio original.
- [ ] El sistema debe detectar materias, conceptos, fechas, tareas, exámenes, entregas y acciones.
- [ ] La IA no debe crear tareas definitivas sin permitir revisión o corrección del usuario.
- [ ] El teléfono no debe descargar modelos pesados ni ser la fuente principal de almacenamiento.

## Materias, notas y búsqueda

- [ ] El usuario debe poder crear, editar y archivar materias.
- [ ] Cada materia debe mostrar notas, capturas, transcripciones, documentos, tareas y fechas.
- [ ] La aplicación debe permitir buscar dentro del contenido procesado.

## Tareas y motor de planificación

- [ ] El usuario debe poder crear tareas manualmente o desde una captura procesada.
- [ ] Las tareas deben incluir fecha límite, prioridad, estado, materia, complejidad y duración estimada.
- [ ] El sistema debe dividir trabajos largos en pasos.
- [ ] El sistema debe calcular la carga de estudio principalmente según complejidad, urgencia, cantidad de tareas acumuladas, cercanía de fechas y pasos restantes.
- [ ] La disponibilidad del usuario debe servir para evitar choques imposibles, pero no debe decidir por sí sola cuánto estudio necesita.
- [ ] Una tarea sencilla y aislada debe poder sugerir bloques cortos, por ejemplo de 15 minutos.
- [ ] Una carga grande debe aumentar automáticamente el tiempo diario, por ejemplo hasta 90 minutos cuando existan muchas tareas acumuladas.
- [ ] El sistema debe priorizar primero lo urgente y complejo, después lo cercano y finalmente lo de baja complejidad o mayor margen.
- [ ] Los trabajos complejos deben distribuirse en sesiones progresivas hasta la fecha límite.
- [ ] Las sesiones incompletas deben poder reprogramarse sin perder el historial y deben elevar la prioridad si el retraso pone en riesgo la entrega.
- [ ] Debe existir una vista semanal y una lista de pendientes.

## Chat académico

- [ ] El usuario debe poder conversar sobre sus notas y tareas.
- [ ] El chat debe responder preguntas como “¿qué tengo esta semana?”, “¿qué dijo el profesor del examen?” y “hazme preguntas sobre derivadas”.
- [ ] Las respuestas deben basarse primero en la información guardada del usuario.
- [ ] El historial de conversaciones debe guardarse.
- [ ] El chat debe permitir crear tareas, cambiar fechas, resumir notas y generar planes mediante acciones estructuradas.

## Recordatorios y calendario

- [ ] Deben existir recordatorios asociados a tareas, exámenes, entregas y sesiones.
- [ ] Para un examen o entrega futura, el sistema debe crear una secuencia progresiva: aviso semanal cuando falte suficiente tiempo y varios avisos reforzados al acercarse la fecha.
- [ ] Cuando el tiempo lo permita, debe haber como mínimo tres recordatorios antes de un examen o entrega, además del aviso del día cuando corresponda.
- [ ] Cada recordatorio debe ofrecer “Ya está hecho”, “Posponer” y “Ver plan”.
- [ ] Al confirmar “Ya está hecho”, deben detenerse los recordatorios y marcarse la tarea o evento como completado.
- [ ] Si pasa la fecha límite sin confirmación, deben detenerse los recordatorios automáticos y el elemento debe quedar marcado como vencido para revisión manual.
- [ ] La aplicación debe mostrar fechas dentro de UniFlow.
- [ ] Las tareas y sesiones deben poder exportarse a un formato compatible con Apple Calendar.
- [ ] Debe existir un endpoint programado en la nube para revisar recordatorios próximos y mantener el estado actualizado.

## iCloud, Drive y WhatsApp

- [ ] En iPhone, el usuario debe poder exportar copias mediante Archivos para guardarlas en iCloud Drive.
- [ ] Las notas, tareas y calendarios deben poder exportarse en formatos portables.
- [ ] Google Drive y WhatsApp deben quedar planteados como integraciones configurables posteriores y no ser requisitos del funcionamiento central.

## Experiencia y entrega

- [ ] La aplicación debe estar optimizada para iPhone y uso con una mano.
- [ ] Debe usar una interfaz editorial serena, clara y ligera, con captura rápida y prioridades visibles.
- [ ] Deben crearse los iconos y el branding nativo de UniFlow.
- [ ] Deben ejecutarse las comprobaciones TypeScript y lint.
- [ ] Debe guardarse un checkpoint con los cambios aceptados; la publicación final quedará separada del checkpoint.
