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
        } else if (action === 'getSteelMeasurements') {
            // Obtener las últimas mediciones de aceros por perforadora
            const measurements = getLastSteelMeasurements(ss);
            return ContentService.createTextOutput(JSON.stringify({ success: true, measurements: measurements }))
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

    // Encontrar la fila de encabezados correcta (la primera fila que tenga elementos en la columna 3 (índice 2) en adelante)
    let headerRowIdx = 0;
    while (headerRowIdx < data.length && (!data[headerRowIdx][2] || String(data[headerRowIdx][2]).trim() === '')) {
        headerRowIdx++;
    }

    if (headerRowIdx >= data.length) return null; // No se encontraron encabezados válidos
    const headers = data[headerRowIdx];

    // Buscar la última fila válida (ignorando las que estén complemente vacías)
    let lastValidIdx = data.length - 1;
    while (lastValidIdx > headerRowIdx && 
           String(data[lastValidIdx][0]).trim() === '' && 
           String(data[lastValidIdx][1]).trim() === '') {
        lastValidIdx--;
    }

    if (lastValidIdx <= headerRowIdx) return null;

    let lastQtyRow = data[lastValidIdx];
    let obsRow = null;

    // Verificar si la última fila es de observaciones
    if (String(lastQtyRow[1]).trim() === 'OBSERVACIONES / SN' && lastValidIdx > headerRowIdx) {
        obsRow = lastQtyRow;
        lastQtyRow = data[lastValidIdx - 1]; // La fila anterior debiera ser la de cantidades
    }

    let createdAtVal = lastQtyRow[1];
    let newDateStr = lastQtyRow[0]; // Fallback a Columna A si falla
    
    try {
        if (createdAtVal instanceof Date) {
            newDateStr = Utilities.formatDate(createdAtVal, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else if (typeof createdAtVal === 'string') {
            const match = createdAtVal.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            if (match) {
                let d = match[1].padStart(2, '0');
                let m = match[2].padStart(2, '0');
                let y = match[3];
                newDateStr = y + '-' + m + '-' + d;
            } else {
                let d = new Date(createdAtVal);
                if (!isNaN(d.getTime())) {
                    newDateStr = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
                }
            }
        }
    } catch(e) {}

    const inventory = {
        date: newDateStr, // Fecha tomada desde la Columna A o Parseada
        synced: 1,
        createdAt: new Date(lastQtyRow[1]).getTime() || Date.now(),
        observations: {}
    };

    // Mapear los valores dinámicos
    for (let i = 2; i < headers.length; i++) {
        if (headers[i]) {
            if (lastQtyRow[i] !== undefined && lastQtyRow[i] !== '') {
                // Intentar convertir el header a una clave válida
                inventory[headers[i]] = lastQtyRow[i];
            }
            if (obsRow && obsRow[i] !== undefined) {
                let obsVal = String(obsRow[i]).trim();
                // Omitimos validaciones en blanco para permitir vacíos en observaciones, pero almacenamos los válidos
                if (obsVal !== '') {
                    if (headers[i].endsWith('_central')) {
                        const baseKey = headers[i].replace('_central', '');
                        inventory.observations[baseKey] = obsVal;
                    }
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
    // Buscar o crear automáticamente la carpeta para las fotos
    const folderName = "LomasBayas_Fotos";
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

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
            'Comentarios', 'Fecha Creación'
        ]);
        sheet.getRange(1, 1, 1, 25).setFontWeight('bold').setBackground('#4A90D9').setFontColor('white');
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
        data.comentarios || '',
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

/**
 * Obtiene la última medición de Aceros y sus últimos cambios
 */
function getLastSteelMeasurements(ss) {
    const medSheet = ss.getSheetByName('Medición Aceros');
    const camSheet = ss.getSheetByName('Cambio Aceros');
    const infoSheet = ss.getSheetByName('Informacion Basica');

    const lastMeasurements = {};
    let promedioMetros = 0;
    const garantizadosDict = {}; // { "4 1/2": { patera: 9000, seguidora: 9000, adaptador: 25000 }, ... }

    // 1. Obtener Información Básica (Garantizado y Promedio Metros)
    if (infoSheet) {
        const infoData = infoSheet.getDataRange().getValues();
        if (infoData.length >= 20) {
            promedioMetros = Number(infoData[19][1]) || 0;
        }

        for (let i = 1; i < infoData.length; i++) {
            const compRaw = String(infoData[i][0]).trim().toLowerCase();
            const diam = String(infoData[i][1]).trim();
            const garantizado = Number(infoData[i][2]) || 0;

            if (compRaw && diam && garantizado) {
                if (!garantizadosDict[diam]) garantizadosDict[diam] = {};
                
                let cat = '';
                if (compRaw.includes('patera') || compRaw.includes('barra 1')) cat = 'patera';
                else if (compRaw.includes('seguidora') || compRaw.includes('barra 2')) cat = 'seguidora';
                else if (compRaw.includes('adaptador') || compRaw.includes('martillo')) cat = 'adaptador';

                if (cat) {
                    garantizadosDict[diam][cat] = garantizado;
                }
            }
        }
    }

    // 2. Obtener últimas mediciones
    if (medSheet) {
        const data = medSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const drill = String(row[3]).trim(); // Col D: Perforadora
            if (drill) {
                let diam = '';
                if (['8', '11', '14'].includes(drill)) diam = '4 1/2';
                else if (['5', '6', '7', '12', '13'].includes(drill)) diam = '8 5/8';
                else if (['9', '10'].includes(drill)) diam = '10 3/4';

                const garPatera = garantizadosDict[diam]?.patera || 0;
                const garSeguidora = garantizadosDict[diam]?.seguidora || 0;
                const garAdaptador = garantizadosDict[diam]?.adaptador || 0;

                lastMeasurements[drill] = {
                    date: row[1],
                    adaptador: { centro: row[4] },
                    barras: [
                        { pin: row[5], centro: row[6], box: row[7] }, // Barra 1 (Patera)
                        { pin: row[8], centro: row[9], box: row[10] }, // Barra 2
                        { pin: row[11], centro: row[12], box: row[13] }, // Barra 3
                        { pin: row[14], centro: row[15], box: row[16] }, // Barra 4
                        { pin: row[17], centro: row[18], box: row[19] }, // Barra 5
                        { pin: row[20], centro: row[21], box: row[22] }  // Barra 6
                    ],
                    obs: row[23] || '',
                    cambios: {
                        adaptador: { instalacion: '', cambio: '', metros: 'N/A' },
                        barras: [
                            { instalacion: '', cambio: '', metros: 'N/A' }, // Barra 1
                            { instalacion: '', cambio: '', metros: 'N/A' }, // Barra 2
                            { instalacion: '', cambio: '', metros: 'N/A' }, // Barra 3
                            { instalacion: '', cambio: '', metros: 'N/A' }, // Barra 4
                            { instalacion: '', cambio: '', metros: 'N/A' }, // Barra 5
                            { instalacion: '', cambio: '', metros: 'N/A' }  // Barra 6
                        ]
                    },
                    garantizados: {
                        adaptador: garAdaptador,
                        barras: [garPatera, garSeguidora, garSeguidora, garSeguidora, garSeguidora, garSeguidora]
                    },
                    promedioMetros: promedioMetros
                };
            }
        }
    }

    // 3. Obtener fechas de cambios
    if (camSheet) {
        const data = camSheet.getDataRange().getValues();
        const changes = {};

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const dateStr = row[1];
            const drill = String(row[2]).trim();
            const compRaw = String(row[4]).trim().toLowerCase();
            
            let cat = '';
            let barraIndex = -1;

            if (compRaw.includes('barra 1') || compRaw.includes('patera')) { cat = 'barras'; barraIndex = 0; }
            else if (compRaw.includes('barra 2') || compRaw === 'barra seguidora') { cat = 'barras'; barraIndex = 1; }
            else if (compRaw.includes('barra 3')) { cat = 'barras'; barraIndex = 2; }
            else if (compRaw.includes('barra 4')) { cat = 'barras'; barraIndex = 3; }
            else if (compRaw.includes('barra 5')) { cat = 'barras'; barraIndex = 4; }
            else if (compRaw.includes('barra 6')) { cat = 'barras'; barraIndex = 5; }
            else if (compRaw.includes('adaptador') || compRaw.includes('martillo')) cat = 'adaptador';

            if (drill && cat) {
                if (!changes[drill]) changes[drill] = {};
                
                if (cat === 'barras') {
                    if (!changes[drill].barras) changes[drill].barras = [[], [], [], [], [], []];
                    if (barraIndex !== -1) changes[drill].barras[barraIndex].push(dateStr);
                } else {
                    if (!changes[drill][cat]) changes[drill][cat] = [];
                    changes[drill][cat].push(dateStr);
                }
            }
        }

        for (const drill in lastMeasurements) {
            if (changes[drill]) {
                if (changes[drill].adaptador) {
                    const arr = changes[drill].adaptador;
                    lastMeasurements[drill].cambios.adaptador.instalacion = arr[arr.length - 1];
                    lastMeasurements[drill].cambios.adaptador.cambio = arr.length > 1 ? arr[arr.length - 2] : '';
                }
                if (changes[drill].barras) {
                    for (let b = 0; b < 6; b++) {
                        const arr = changes[drill].barras[b];
                        if (arr && arr.length > 0) {
                            lastMeasurements[drill].cambios.barras[b].instalacion = arr[arr.length - 1];
                            lastMeasurements[drill].cambios.barras[b].cambio = arr.length > 1 ? arr[arr.length - 2] : '';
                        }
                    }
                }
            }
        }
    }

    return lastMeasurements;
}
