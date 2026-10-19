# TODO de UniFlow

## Cuenta, privacidad y datos del usuario

- [x] La aplicación debe permitir iniciar sesión con la autenticación administrada de Manus.
- [x] Los datos deben estar separados por usuario y las tablas de negocio deben validar la pertenencia antes de leer o modificar información.
- [x] Los archivos y registros deben tener autorización en servidor.
- [x] La aplicación debe ofrecer eliminación lógica de entradas y opción de exportación.

## Inicio y captura rápida desde iPhone

- [x] La aplicación debe mostrar un resumen de tareas próximas, sesiones de estudio y recordatorios.
- [x] La aplicación debe mostrar un indicador de progreso semanal.
- [x] La aplicación debe permitir iniciar con un toque una captura de texto, foto, audio o archivo.
- [x] El usuario debe poder escribir texto libre como “Recordatorio: presentación de sociología el viernes”.
- [x] El usuario debe poder tomar o seleccionar una foto del tablero, cuaderno o diapositiva.
- [x] El usuario debe poder grabar audio desde el iPhone.
- [x] El usuario debe poder seleccionar documentos desde Archivos.
- [x] Las capturas deben entrar en una bandeja de entrada para revisar y confirmar la clasificación sugerida.
- [x] El usuario debe poder corregir materia, fecha, prioridad y tipo antes de guardar.

## Procesamiento en la nube

- [x] Las fotos y documentos deben guardarse en almacenamiento de objetos administrado.
- [x] El servidor debe extraer texto y datos accionables mediante los servicios de IA disponibles.
- [x] Los audios deben transcribirse en español y el texto debe quedar asociado al audio original.
- [x] El sistema debe detectar materias, conceptos, fechas, tareas, exámenes, entregas y acciones.
- [x] La IA no debe crear tareas definitivas sin permitir revisión o corrección del usuario.
- [x] El teléfono no debe descargar modelos pesados ni ser la fuente principal de almacenamiento.

## Materias, notas y búsqueda

- [x] El usuario debe poder crear, editar y archivar materias.
- [x] Cada materia debe mostrar notas, capturas, transcripciones, documentos, tareas y fechas.
- [x] La aplicación debe permitir buscar dentro del contenido procesado.

## Tareas y motor de planificación

- [x] El usuario debe poder crear tareas manualmente o desde una captura procesada.
- [x] Las tareas deben incluir fecha límite, prioridad, estado, materia, complejidad y duración estimada.
- [x] El sistema debe dividir trabajos largos en pasos.
- [x] El sistema debe calcular la carga de estudio principalmente según complejidad, urgencia, cantidad de tareas acumuladas, cercanía de fechas y pasos restantes.
- [x] La disponibilidad del usuario debe servir para evitar choques imposibles, pero no debe decidir por sí sola cuánto estudio necesita.
- [x] Una tarea sencilla y aislada debe poder sugerir bloques cortos, por ejemplo de 15 minutos.
- [x] Una carga grande debe aumentar automáticamente el tiempo diario, por ejemplo hasta 90 minutos cuando existan muchas tareas acumuladas.
- [x] El sistema debe priorizar primero lo urgente y complejo, después lo cercano y finalmente lo de baja complejidad o mayor margen.
- [x] Los trabajos complejos deben distribuirse en sesiones progresivas hasta la fecha límite.
- [x] Las sesiones incompletas deben poder reprogramarse sin perder el historial y deben elevar la prioridad si el retraso pone en riesgo la entrega.
- [x] Debe existir una vista semanal y una lista de pendientes.

## Chat académico

- [x] El usuario debe poder conversar sobre sus notas y tareas.
- [x] El chat debe responder preguntas como “¿qué tengo esta semana?”, “¿qué dijo el profesor del examen?” y “hazme preguntas sobre derivadas”.
- [x] Las respuestas deben basarse primero en la información guardada del usuario.
- [x] El historial de conversaciones debe guardarse.
- [x] El chat debe permitir crear tareas, cambiar fechas, resumir notas y generar planes mediante acciones estructuradas.

## Recordatorios y calendario

- [x] Deben existir recordatorios asociados a tareas, exámenes, entregas y sesiones.
- [x] Para un examen o entrega futura, el sistema debe crear una secuencia progresiva: aviso semanal cuando falte suficiente tiempo y varios avisos reforzados al acercarse la fecha.
- [x] Cuando el tiempo lo permita, debe haber como mínimo tres recordatorios antes de un examen o entrega, además del aviso del día cuando corresponda.
- [x] Cada recordatorio debe ofrecer “Ya está hecho”, “Posponer” y “Ver plan”.
- [x] Al confirmar “Ya está hecho”, deben detenerse los recordatorios y marcarse la tarea o evento como completado.
- [x] Si pasa la fecha límite sin confirmación, deben detenerse los recordatorios automáticos y el elemento debe quedar marcado como vencido para revisión manual.
- [x] La aplicación debe mostrar fechas dentro de UniFlow.
- [x] Las tareas y sesiones deben poder exportarse a un formato compatible con Apple Calendar.
- [x] Debe existir un endpoint programado en la nube para revisar recordatorios próximos y mantener el estado actualizado. _(`POST /api/scheduled/reminders`; falta programarlo cada 15 min en Manus.)_

## iCloud, Drive y WhatsApp

- [x] En iPhone, el usuario debe poder exportar copias mediante Archivos para guardarlas en iCloud Drive.
- [x] Las notas, tareas y calendarios deben poder exportarse en formatos portables.
- [x] Google Drive y WhatsApp deben quedar planteados como integraciones configurables posteriores y no ser requisitos del funcionamiento central.

## Experiencia y entrega

- [x] La aplicación debe estar optimizada para iPhone y uso con una mano.
- [x] Debe usar una interfaz editorial serena, clara y ligera, con captura rápida y prioridades visibles.
- [x] Deben crearse los iconos y el branding nativo de UniFlow.
- [x] Deben ejecutarse las comprobaciones TypeScript y lint.
- [ ] Debe guardarse un checkpoint con los cambios aceptados; la publicación final quedará separada del checkpoint. _(Acción en la plataforma Manus.)_

## Pendiente fuera del código

- [ ] Programar la tarea en la nube que llama a `POST /api/scheduled/reminders` (recomendado: cada 15 minutos).
- [ ] Notificaciones push remotas: hoy se usan notificaciones locales del iPhone sincronizadas con la nube; el push de servidor requiere credenciales de Apple/Expo y una compilación nativa.
- [ ] Google Drive y WhatsApp: integraciones posteriores que requieren autorización externa.
