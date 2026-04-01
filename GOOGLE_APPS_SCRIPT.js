/**
 * Google Apps Script para LomasBayas APP
 * Este script maneja la sincronización de datos desde la PWA hacia Google Sheets
 * e incluye subida de fotos a Google Drive.
 * 
 * INSTRUCCIONES:
 * 1. Abre tu Google Sheet
 * 2. Ve a Extensiones > Apps Script
 * 3. Borra todo el código existente y pega este
 * 4. Guarda y despliega como aplicación web (Implementar > Nueva implementación)
 * 5. Configura: Ejecutar como "Yo" y Acceso "Cualquier persona"
 * 6. Copia la URL y pégala en GAS_URL de App.tsx
 */

// ID de la carpeta en Google Drive donde se guardarán las fotos
// Crea una carpeta en Drive y pega su ID aquí (lo encuentras en la URL de la carpeta)
const DRIVE_FOLDER_ID = 'TU_ID_DE_CARPETA_AQUI'; // Ejemplo: '1ABC123def456GHI789'

function doPost(e) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        // Manejar diferentes tipos de datos
        if (e.parameter.payload) {
            // Reporte de turno
            const data = JSON.parse(e.parameter.payload);
            saveShiftReport(ss, data);
        } else if (e.parameter.steelChange) {
            // Cambio de aceros
            const data = JSON.parse(e.parameter.steelChange);
            saveSteelChange(ss, data);
        } else if (e.parameter.steelMeasurement) {
            // Medición de aceros
            const data = JSON.parse(e.parameter.steelMeasurement);
            saveSteelMeasurement(ss, data);
        } else if (e.parameter.event) {
            // Evento
            const data = JSON.parse(e.parameter.event);
            saveEvent(ss, data);
        } else if (e.parameter.inventoryRecord) {
            // Inventario
            const data = JSON.parse(e.parameter.inventoryRecord);
            saveInventory(ss, data);
        } else if (e.parameter.uploadPhoto) {
            // Subir foto a Google Drive
            const photoData = JSON.parse(e.parameter.uploadPhoto);
            const photoUrl = uploadPhotoToDrive(photoData);
            return ContentService.createTextOutput(JSON.stringify({ success: true, url: photoUrl }))
                .setMimeType(ContentService.MimeType.JSON);
        } else if (e.parameter.deleteEvent) {
            // Eliminar evento
            const data = JSON.parse(e.parameter.deleteEvent);
            deleteEvent(ss, data.id, data.title);
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        } else if (e.parameter.steelDiscard) {
            // Descarte de aceros
            const data = JSON.parse(e.parameter.steelDiscard);
            saveSteelDiscard(ss, data);
        }

        return ContentService.createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const action = e.parameter.action;

        if (action === 'getEvents') {
            // Obtener todos los eventos abiertos
            const events = getEventsFromSheet(ss);
            return ContentService.createTextOutput(JSON.stringify({ success: true, events: events }))
                .setMimeType(ContentService.MimeType.JSON);
        } else if (action === 'getLastInventory') {
            // Obtener el último registro de inventario
            const inventory = getLastInventoryFromSheet(ss);
            return ContentService.createTextOutput(JSON.stringify({ success: true, inventory: inventory }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        return ContentService.createTextOutput(JSON.stringify({ status: 'OK', message: 'LomasBayas API activa' }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Obtiene todos los eventos de la hoja "Eventos"
 */
function getEventsFromSheet(ss) {
    const sheet = ss.getSheetByName('Eventos');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // Solo encabezados

    const events = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        events.push({
            id: row[0],
            date: row[1],
            title: row[2],
            description: row[3],
            responsible: row[4],
            photo: row[5],
            closed: row[6] === 'Sí' ? 1 : 0,
            synced: 1, // Ya está en el Excel
            createdAt: new Date(row[7]).getTime() || Date.now()
        });
    }
    return events;
}

/**
 * Obtiene el último registro de inventario
 */
function getLastInventoryFromSheet(ss) {
    const sheet = ss.getSheetByName('Inventario');
    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return null; // Solo encabezados

    // Obtener la fila de cantidades (ignorar fila de observaciones si es la última)
    let lastQtyRow = data[data.length - 1];
    let obsRow = null;

    if (lastQtyRow[1] === 'OBSERVACIONES / SN' && data.length > 2) {
        obsRow = lastQtyRow;
        lastQtyRow = data[data.length - 2];
    }
    const headers = data[0];

    const inventory = {
        date: lastQtyRow[0],
        synced: 1,
        createdAt: new Date(lastQtyRow[1]).getTime() || Date.now(),
        observations: {}
    };

    // Mapear los valores dinámicos
    for (let i = 2; i < headers.length; i++) {
        if (headers[i]) {
            if (lastQtyRow[i] !== undefined) {
                // Intentar convertir el header a una clave válida
                inventory[headers[i]] = lastQtyRow[i];
            }
            if (obsRow && obsRow[i] !== undefined && typeof obsRow[i] === 'string' && obsRow[i].trim() !== '') {
                if (headers[i].endsWith('_central')) {
                    const baseKey = headers[i].replace('_central', '');
                    inventory.observations[baseKey] = obsRow[i];
                }
            }
        }
    }

    return inventory;
}

/**
 * Sube una foto a Google Drive y devuelve la URL pública
 */
function uploadPhotoToDrive(photoData) {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);

    // Decodificar base64
    const base64Data = photoData.base64.split(',')[1]; // Quitar el prefijo "data:image/..."
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), photoData.mimeType, photoData.filename);

    // Crear archivo en Drive
    const file = folder.createFile(blob);

    // Hacer el archivo público para que se pueda ver
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Obtener URL directa de la imagen
    const fileId = file.getId();
    const directUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;

    return directUrl;
}

/**
 * Guarda un evento en la hoja "Eventos"
 */
function saveEvent(ss, data) {
    let sheet = ss.getSheetByName('Eventos');

    // Crear la hoja si no existe
    if (!sheet) {
        sheet = ss.insertSheet('Eventos');
        // Agregar encabezados
        sheet.appendRow([
            'ID', 'Fecha', 'Título', 'Descripción', 'Responsable', 'Foto URL', 'Cerrado', 'Fecha Creación'
        ]);
        // Dar formato a los encabezados
        sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    }

    // Agregar el evento
    sheet.appendRow([
        data.id || '',
        data.date,
        data.title,
        data.description,
        data.responsible,
        data.photo || '', // URL de la foto (ya subida a Drive)
        data.closed ? 'Sí' : 'No',
        new Date(data.createdAt).toLocaleString('es-CL')
    ]);
}

/**
 * Guarda un reporte de turno
 */
function saveShiftReport(ss, data) {
    let sheet = ss.getSheetByName('Reportes');

    if (!sheet) {
        sheet = ss.insertSheet('Reportes');
        sheet.appendRow([
            'ID', 'Fecha', 'Turno', 'Perforadora', 'Operador', 'Banco', 'Fase', 'Malla',
            'Tricono Marca', 'Tricono Modelo', 'Tricono Serie', 'Tricono Diámetro',
            'Total Metros', 'Total Demoras (min)', 'Fecha Creación'
        ]);
        sheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    }

    // Calcular totales
    const totalMeters = data.wells ? data.wells.reduce((sum, w) => sum + (w.type === 'well' ? (w.meters || 0) : 0), 0) : 0;
    const totalDelays = data.wells ? data.wells.reduce((sum, w) => sum + (w.type === 'delay' ? (w.timeMin || 0) : 0), 0) : 0;

    sheet.appendRow([
        data.id || '',
        data.date,
        data.shift,
        data.drillNumber,
        data.operator,
        data.bench,
        data.phase,
        data.mesh,
        data.triconeBrand,
        data.triconeModel,
        data.triconeSerial,
        data.triconeDiameter,
        totalMeters,
        totalDelays,
        new Date(data.createdAt).toLocaleString('es-CL')
    ]);

    // Guardar detalle de pozos en otra hoja
    if (data.wells && data.wells.length > 0) {
        saveWellsDetail(ss, data);
    }
}

/**
 * Guarda el detalle de pozos/demoras
 */
function saveWellsDetail(ss, data) {
    let sheet = ss.getSheetByName('Detalle Pozos');

    if (!sheet) {
        sheet = ss.insertSheet('Detalle Pozos');
        sheet.appendRow([
            'Fecha', 'Turno', 'Perforadora', 'Tipo', 'Número', 'Metros', 'Inicio', 'Fin',
            'Tiempo (min)', 'Terreno', 'Categoría', 'Pulldown', 'RPM', 'Observaciones'
        ]);
        sheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    }

    data.wells.forEach(well => {
        sheet.appendRow([
            data.date,
            data.shift,
            data.drillNumber,
            well.type === 'well' ? 'Pozo' : 'Demora',
            well.wellNumber,
            well.meters || '',
            well.startTime,
            well.endTime,
            well.timeMin,
            well.terrain || '',
            well.category || '',
            well.pulldown || '',
            well.rpm || '',
            well.observations
        ]);
    });
}

/**
 * Guarda un cambio de aceros
 */
function saveSteelChange(ss, data) {
    let sheet = ss.getSheetByName('Cambio Aceros');

    if (!sheet) {
        sheet = ss.insertSheet('Cambio Aceros');
        sheet.appendRow([
            'ID', 'Fecha', 'Perforadora', 'Turno', 'Componente', 'N° Serie', 'Comentarios', 'Fecha Creación'
        ]);
        sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    }

    sheet.appendRow([
        data.id || '',
        data.date,
        data.drillNumber,
        data.shift,
        data.component,
        data.serialNumber,
        data.comments,
        new Date(data.createdAt).toLocaleString('es-CL')
    ]);
}

/**
 * Guarda una medición de aceros
 */
function saveSteelMeasurement(ss, data) {
    let sheet = ss.getSheetByName('Medición Aceros');

    if (!sheet) {
        sheet = ss.insertSheet('Medición Aceros');
        sheet.appendRow([
            'ID', 'Fecha', 'Turno', 'Perforadora',
            'Adaptador Inf. Medio',
            'Patera Superior', 'Patera Medio', 'Patera Inferior',
            'Seg.1 Sup', 'Seg.1 Med', 'Seg.1 Inf',
            'Seg.2 Sup', 'Seg.2 Med', 'Seg.2 Inf',
            'Seg.3 Sup', 'Seg.3 Med', 'Seg.3 Inf',
            'Seg.4 Sup', 'Seg.4 Med', 'Seg.4 Inf',
            'Seg.5 Sup', 'Seg.5 Med', 'Seg.5 Inf',
            'Fecha Creación'
        ]);
        sheet.getRange(1, 1, 1, 24).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    }

    sheet.appendRow([
        data.id || '',
        data.date,
        data.shift,
        data.drillNumber,
        data.adaptadorInferiorMedio,
        data.barraPateraSuperior,
        data.barraPateraMedio,
        data.barraPateraInferior,
        data.barraSeguidora1Superior,
        data.barraSeguidora1Medio,
        data.barraSeguidora1Inferior,
        data.barraSeguidora2Superior,
        data.barraSeguidora2Medio,
        data.barraSeguidora2Inferior,
        data.barraSeguidora3Superior || 0,
        data.barraSeguidora3Medio || 0,
        data.barraSeguidora3Inferior || 0,
        data.barraSeguidora4Superior || 0,
        data.barraSeguidora4Medio || 0,
        data.barraSeguidora4Inferior || 0,
        data.barraSeguidora5Superior || 0,
        data.barraSeguidora5Medio || 0,
        data.barraSeguidora5Inferior || 0,
        new Date(data.createdAt).toLocaleString('es-CL')
    ]);
}

/**
 * Guarda un registro de inventario
 */
function saveInventory(ss, data) {
    let sheet = ss.getSheetByName('Inventario');

    const obsData = data.observations || {};

    // Obtener las claves de inventario (excluyendo campos del sistema y observaciones)
    const inventoryKeys = Object.keys(data).filter(key =>
        key !== 'id' && key !== 'date' && key !== 'synced' && key !== 'createdAt' && key !== 'observations'
    );

    if (!sheet) {
        sheet = ss.insertSheet('Inventario');
        // Crear encabezados con los nombres de las claves
        const headers = ['Fecha', 'Fecha Creación'].concat(inventoryKeys);
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    } else {
        // Verificar si los encabezados actuales coinciden, si no, actualizarlos
        const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const expectedHeaders = ['Fecha', 'Fecha Creación'].concat(inventoryKeys);

        if (currentHeaders.length < expectedHeaders.length || currentHeaders[2] !== expectedHeaders[2]) {
            // Actualizar encabezados
            sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
        }
    }

    // Fila Par: Cantidades
    const rowQty = [data.date, new Date(data.createdAt).toLocaleString('es-CL')];
    inventoryKeys.forEach(key => {
        rowQty.push(data[key] || 0);
    });
    sheet.appendRow(rowQty);

    // Fila Impar: Observaciones/SN
    const rowObs = [data.date, 'OBSERVACIONES / SN'];
    inventoryKeys.forEach(key => {
        if (key.endsWith('_central')) {
            const baseKey = key.replace('_central', '');
            rowObs.push(obsData[baseKey] || '');
        } else {
            rowObs.push(''); // Columna de mina vacía
        }
    });
    sheet.appendRow(rowObs);
}

/**
 * Elimina un evento de la hoja "Eventos" buscando por ID o título
 */
function deleteEvent(ss, eventId, eventTitle) {
    const sheet = ss.getSheetByName('Eventos');
    if (!sheet) {
        Logger.log('Hoja Eventos no encontrada');
        return;
    }

    const data = sheet.getDataRange().getValues();

    // Buscar la fila que coincide (columna A = ID, columna C = Título)
    for (let i = data.length - 1; i >= 1; i--) { // Empezar desde abajo, saltar encabezado
        const rowId = data[i][0];
        const rowTitle = data[i][2];

        // Coincidir por ID o por título (por si el ID no coincide exactamente)
        if (rowId == eventId || rowTitle === eventTitle) {
            sheet.deleteRow(i + 1); // +1 porque getValues() es 0-indexed pero deleteRow es 1-indexed
            Logger.log('Evento eliminado: ' + eventTitle + ' (fila ' + (i + 1) + ')');
            return;
        }
    }

    Logger.log('Evento no encontrado: ID=' + eventId + ', Título=' + eventTitle);
}

/**
 * Guarda un registro de descarte de aceros
 */
function saveSteelDiscard(ss, data) {
    let sheet = ss.getSheetByName('Descarte de Aceros');

    if (!sheet) {
        sheet = ss.insertSheet('Descarte de Aceros');
        const headers = [
            'Fecha', 'Serie', 'Equipo', 'Diámetro', 'Fecha Postura', 'Fecha Descarte',
            'Tipo Acero', 'Causa Descarte', 'Metros', 'Terreno',
            'Medida Entre Insertos', 'Medida Matriz',
            'Diámetro Culata', 'Diámetro Portabit',
            'Foto Serie', 'Obs Serie',
            'Foto Cuerpo', 'Foto Botones',
            'Foto Cuerpo/Faldon 1', 'Obs Cuerpo/Faldon 1',
            'Foto Cuerpo/Faldon 2', 'Obs Cuerpo/Faldon 2',
            'Foto Cuerpo/Faldon 3', 'Obs Cuerpo/Faldon 3',
            'Foto Cono 1', 'Obs Cono 1',
            'Foto Cono 2', 'Obs Cono 2',
            'Foto Cono 3', 'Obs Cono 3',
            'Foto Nozzles', 'Obs Nozzles',
            'Foto Conos', 'Obs Conos',
            'Fecha Creación'
        ];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
        sheet.setFrozenRows(1);
    }

    const row = [
        data.date || '',
        data.serie || '',
        data.equipo || '',
        data.diametro || '',
        data.fechaPostura || '',
        data.fechaDescarte || '',
        data.tipoAcero || '',
        data.causaDescarte || '',
        data.metros || 0,
        data.terreno || '',
        data.medidaEntreInsertos || '',
        data.medidaMatriz || '',
        data.diametroCulata || '',
        data.diametroPortabit || '',
        data.fotoSerie || '',
        data.obsSerie || '',
        data.fotoCuerpo || '',
        data.fotoBotones || '',
        data.fotoCuerpoFaldon1 || '',
        data.obsCuerpoFaldon1 || '',
        data.fotoCuerpoFaldon2 || '',
        data.obsCuerpoFaldon2 || '',
        data.fotoCuerpoFaldon3 || '',
        data.obsCuerpoFaldon3 || '',
        data.fotoCono1 || '',
        data.obsCono1 || '',
        data.fotoCono2 || '',
        data.obsCono2 || '',
        data.fotoCono3 || '',
        data.obsCono3 || '',
        data.fotoNozzles || '',
        data.obsNozzles || '',
        data.fotoConos || '',
        data.obsConos || '',
        new Date(data.createdAt).toLocaleString('es-CL')
    ];

    sheet.appendRow(row);
}
