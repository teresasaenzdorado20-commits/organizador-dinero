# Organizador de dinero

PWA de finanzas personales sin backend ni sincronización remota. La aplicación está construida con JavaScript ES modules, HTML y CSS, y guarda todas las cuentas, etiquetas, transacciones, presupuestos y objetivos en IndexedDB.

## Estructura

- `index.html`, `styles.css`: interfaz adaptable a móvil y escritorio.
- `app.js`: vistas, formularios y operaciones de negocio.
- `domain.js`: saldos, reservas, periodos y progreso de presupuestos.
- `db.js`: acceso a IndexedDB, copia JSON y restauración.
- `manifest.json`, `sw.js`, `assets/`: instalación, modo sin conexión e iconos.
- `sw.js` usa la red primero al estar conectado y conserva la caché como respaldo sin conexión.

## Ejecutar en Windows

Haz doble clic en `Iniciar Organizador.bat`. Se abrirá la aplicación en `http://127.0.0.1:8765/`; deja abierta la ventana de PowerShell mientras la usas y pulsa `Ctrl+C` para detenerla. No se necesita instalar Node, Python, un backend ni una base de datos en la nube. No abras `index.html` directamente: el navegador bloquea los módulos JavaScript cuando se carga como archivo `file://`.

Al cargar la app con conexión, se actualizan sus archivos desde la carpeta y la caché solo se usa como respaldo sin conexión. Si tenías la app abierta mientras se cambiaban archivos, recarga la pestaña o ciérrala y vuelve a abrirla.

La PWA necesita un origen seguro para usar service workers e instalarse. El lanzador sirve la app solo en el propio dispositivo. Para instalarla en un iPhone, publícala en un hosting estático con HTTPS, abre la URL en Safari y pulsa **Compartir → Añadir a pantalla de inicio**.

En un iPhone, abre la URL HTTPS en Safari, pulsa **Compartir → Añadir a pantalla de inicio**. Safari guardará la aplicación como acceso independiente. La primera visita necesita conexión para descargar el shell de la aplicación; después se puede abrir sin conexión.

## Persistencia y migraciones

La base se llama `organizador-dinero` y actualmente tiene la versión 2. La versión 2 añade las stores `debts` y `debtEvents`; las cuentas, movimientos y datos previos se conservan. Se aceptan copias JSON de la versión 1 y se exportan copias nuevas en la versión 2. La actualización del esquema se declara en `db.js` dentro de `onupgradeneeded`; las versiones futuras deben incrementar `DB_VERSION`, añadir o indexar stores y transformar registros con cursores dentro de esa transacción. No borres stores ni registros como parte de una migración. Los objetos son flexibles y pueden incorporar campos nuevos sin reescribir el historial.

Al eliminar una cuenta se puede dar de baja su saldo o repartirlo entre otras cuentas activas. La cuenta se elimina de la lista de cuentas; sus movimientos históricos se conservan. Los presupuestos y objetivos se pueden ocultar, editar o eliminar. Las copias JSON incluyen todas las stores y pueden importarse desde **Ajustes y copias**; la importación reemplaza la base local y pide confirmación en un panel propio.

## Reglas principales

- El saldo actual considera solo movimientos confirmados. Un ingreso previsto no se suma hasta pulsar **Ya llegó**.
- Las aportaciones a objetivos no cambian el saldo total; reducen el saldo disponible.
- Si un gasto excede el saldo disponible, el usuario selecciona uno o varios objetivos para cubrir la diferencia. Los usos quedan auditados.
- Al completar una compra asociada a un objetivo, el objetivo se cierra y cualquier importe reservado restante vuelve automáticamente a estar disponible.
- Las etiquetas principales y subetiquetas son libres; pueden marcarse para exigir una subetiqueta. Los filtros aceptan ambas al mismo nivel.
- Los selectores y filtros muestran todas las etiquetas en una lista alfabética unificada, independientemente de que se crearan como principales o subetiquetas.
- Los presupuestos se controlan por mes y admiten varias etiquetas. Los de ahorro cuentan aportaciones confirmadas, no gastos.
- Los objetivos admiten una fecha opcional y pueden mostrarse como vencidos y ocultarse sin perder su auditoría.
- Los objetivos no dependen de una cuenta: cada aportación o retirada indica la cuenta, y el saldo reservado se puede ajustar cuando sea necesario.
- Al registrar como comprada una meta completada, sus etiquetas aparecen en cascada desde el inicio y el nombre del objetivo se propone como nota del gasto.
- Los calendarios son paneles flotantes propios, anclados al campo de fecha y situados dentro de la ventana visible; los formularios de compra y presupuesto permiten crear etiquetas principales o subetiquetas sin perder los datos ya introducidos.
- Estadísticas permiten combinar varias cuentas y etiquetas, elegir hoy, mes, año, un día o un rango personalizado.
- Un gasto dividido conserva el importe completo pagado para cuadrar el saldo de la cuenta, pero solo cuenta tu parte en gastos, presupuestos y gráficos. Las porciones adelantadas crean deudas agrupables por persona.
- Las deudas cruzadas con una persona se compensan automáticamente. Lo que te deben reduce temporalmente el saldo disponible hasta que se abone o compense.
- En una deuda compensada, el movimiento de gasto conserva el importe bruto; la compensación se registra como un ingreso de ajuste para que el saldo de la cuenta solo refleje el pago neto.
- Pagar una deuda propia y condonar una deuda generan gastos etiquetados; recibir un reembolso por encima de lo pendiente registra el excedente como ingreso.
- Todas las fechas se introducen y muestran como `DD/MM/YYYY`; los campos incluyen un calendario interactivo y mantienen ese formato visible. Las subetiquetas se eligen en cascada a cualquier profundidad, pueden tener varios elementos padre y no tienen iconos ni colores.
- En **Movimientos** se pueden filtrar transacciones entre dos fechas inclusivas con el calendario DD/MM/YYYY; las fechas se validan para evitar que el inicio quede después del final.
- Comprar el objetivo asociado a un ahorro se identifica como compra del objetivo y no genera el aviso de dinero reservado usado para un gasto ajeno.
- Ingresos y gastos se pueden editar o eliminar desde **Movimientos**; el saldo se recalcula y los registros relacionados de deuda se mantienen coherentes.
- Las deudas se pueden editar o eliminar desde **Me deben / Debo**; los abonos y devoluciones también se pueden editar o eliminar desde su historial. Las deudas derivadas de gastos divididos se actualizan desde el gasto de origen.
- Los ingresos y gastos futuros no alteran el saldo hasta confirmar manualmente su ejecución; la previsión de inicio y el gráfico de estadísticas incluyen los movimientos programados y los cobros pendientes.
- Las etiquetas de gastos e ingresos se guardan por separado, admiten jerarquía principal/subetiqueta multinivel y multienlace, y se pueden asignar varias a cada movimiento y presupuesto. Los cambios y eliminaciones conservan el historial financiero.
- Las confirmaciones y formularios emergentes usan modales táctiles adaptados a móvil; no se usan `alert()`, `confirm()` ni `prompt()` del navegador.

## Copias y privacidad

IndexedDB pertenece al perfil del navegador/dispositivo. Borrar los datos de Safari o del navegador elimina la base local. Exporta copias JSON periódicas y guárdalas fuera del dispositivo. No se incluye cifrado con contraseña ni sincronización: protege el acceso al dispositivo y a las copias.
