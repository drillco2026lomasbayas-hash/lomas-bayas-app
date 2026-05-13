# Reporte Visual y Generación PDF

Se ha completado la integración del nuevo reporte visual "CHEQUEO PERFORADORA" interactivo con generación a PDF.

## 1. Google Apps Script Backend
La función `getLastSteelMeasurements` en `GOOGLE_APPS_SCRIPT.js` ha sido completamente reescrita. Ahora, no solo devuelve un porcentaje aislado, sino que recorre ambas hojas: **"Medición Aceros"** y **"Cambio Aceros"** para estructurar un reporte completo por cada perforadora:
* **Mediciones:** Recupera Pin, Centro y Box para las *Barras Patera y Seguidora*, y el Centro para el *Adaptador de Tricono*.
* **Cambios:** Extrae y calcula las fechas del último cambio realizado (instalación actual) y del cambio anterior.

> [!IMPORTANT]
> **ACCIÓN REQUERIDA:** Asegúrate de copiar todo el código de `GOOGLE_APPS_SCRIPT.js` en tu editor de Google Apps Script y realizar un **Nuevo Despliegue** para que tu aplicación React comience a recibir estos nuevos datos complejos, de lo contrario la aplicación no funcionará correctamente en esa sección.

## 2. Aplicación React (Frontend)
- **Modal Interactivo:** Añadí el componente `DrillReportModal.tsx` el cual se encarga de renderizar la vista del "Chequeo Perforadora". 
- **Tarjetas Clickeables:** En la sección "Control de Diámetros", las tarjetas de las perforadoras ahora detectan si la perforadora posee datos y muestran un cursor con forma de "mano". Al hacer clic, se abre el reporte.
- **Gráficos Dinámicos:** Utilizando SVGs, las imágenes de tus aceros (`adaptador_tricono.png`, `barra_rotary.png`) están flanqueadas por donas porcentuales (Verdes, Amarillas y Rojas) según sus niveles de desgaste.
- **Exportación PDF:** Al presionar el botón de PDF, la librería `html2canvas` toma una fotografía exacta del modal renderizado y la inserta en un documento utilizando `jsPDF` (`Reporte_Perforadora_PE<ID>.pdf`).

## 3. Hoja de "Metros Aceros"
Para poder vincular en un futuro la métrica de los metros perforados acumulados de un acero, te sugiero crear una hoja en el mismo archivo de Excel configurada de la siguiente manera:

* **Nombre de la Hoja:** `Registro Metros`
* **Columnas:**
  1. `Fecha`
  2. `Perforadora` (Ej. PE05)
  3. `Componente` (Ej. Barra Patera)
  4. `Fecha de Instalación`
  5. `Metros Acumulados`

Por el momento, el campo "Metros Perforados" mostrará `N/A` tal y como acordamos. Cuando tengas esa hoja funcionando, me avisas y conectaremos esa columna al script.
