import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Activity,
  PlusCircle,
  Save,
  FileText,
  Calendar,
  HardHat,
  Wifi,
  WifiOff,
  Trash2,
  Home,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { db, type WellRecord, type SteelChange, type SteelMeasurement, type Event, type InventoryRecord, type SteelDiscard } from './db';
import { INVENTORY_CATEGORIES, createEmptyInventory } from './inventoryData';
import './index.css';

const lastSavedDrafts: Record<string, string> = {};

const App: React.FC = () => {
  // CONFIGURACIÓN: Pega aquí la URL de tu implementación de Google Apps Script
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyJ4sVXk3Y5geSSvvuRkIQe-AOlyrsFEvxQnwOr2zbAFI7US65O1LKvs1ZlGk9Fpgvy/exec';

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wells, setWells] = useState<WellRecord[]>(() => {
    const saved = localStorage.getItem('draft_wells');
    return saved ? JSON.parse(saved) : [];
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [currentPage, setCurrentPage] = useState<'reporte' | 'cambioAceros' | 'medicionAceros' | 'eventos' | 'nuevoEvento' | 'analista' | 'inventario' | 'tecnico' | 'descarteAceros'>('reporte');

  // Estado para Reporte General
  const [reportData, setReportData] = useState(() => {
    const saved = localStorage.getItem('draft_reportData');
    if (saved) return JSON.parse(saved);
    return {
      date: new Date().toISOString().split('T')[0],
      shift: 'TURNO A',
      drillNumber: '',
      operator: '',
      bench: '',
      phase: '',
      mesh: '',
      triconeBrand: '',
      triconeModel: '',
      triconeSerial: '',
      triconeDiameter: '10 5/8"'
    };
  });

  // Estado para Cambio de Aceros
  const [steelChangeData, setSteelChangeData] = useState(() => {
    const saved = localStorage.getItem('draft_steelChangeData');
    if (saved) return JSON.parse(saved);
    return {
      date: new Date().toISOString().split('T')[0],
      drillNumber: '',
      shift: 'TURNO A',
      component: 'Amortiguador',
      serialNumber: '',
      comments: ''
    };
  });

  // Estado para Medición de Aceros
  const [steelMeasurementData, setSteelMeasurementData] = useState(() => {
    const saved = localStorage.getItem('draft_steelMeasurementData');
    if (saved) return JSON.parse(saved);
    return {
      date: new Date().toISOString().split('T')[0],
      shift: 'A',
      drillNumber: '',
      adaptadorInferiorMedio: 0,
      barraPateraSuperior: 0,
      barraPateraMedio: 0,
      barraPateraInferior: 0,
      barraSeguidora1Superior: 0,
      barraSeguidora1Medio: 0,
      barraSeguidora1Inferior: 0,
      barraSeguidora2Superior: 0,
      barraSeguidora2Medio: 0,
      barraSeguidora2Inferior: 0,
      barraSeguidora3Superior: 0,
      barraSeguidora3Medio: 0,
      barraSeguidora3Inferior: 0,
      barraSeguidora4Superior: 0,
      barraSeguidora4Medio: 0,
      barraSeguidora4Inferior: 0,
      barraSeguidora5Superior: 0,
      barraSeguidora5Medio: 0,
      barraSeguidora5Inferior: 0
    };
  });

  // Estado para Eventos
  const [openEvents, setOpenEvents] = useState<Event[]>([]);
  const [newEventData, setNewEventData] = useState(() => {
    const saved = localStorage.getItem('draft_newEventData');
    if (saved) return JSON.parse(saved);
    return {
      date: new Date().toISOString().split('T')[0],
      title: '',
      description: '',
      responsible: '',
      photo: ''
    };
  });

  // Estado para Inventario
  const [inventoryData, setInventoryData] = useState<Record<string, number>>(createEmptyInventory());
  const [inventoryObs, setInventoryObs] = useState<Record<string, string>>({});
  const [openSnRow, setOpenSnRow] = useState<string | null>(null);
  const [inventoryDate, setInventoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [lastInventoryDate, setLastInventoryDate] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Estado para modal de confirmación de eliminación
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);

  // Estado para Descarte de Aceros
  const [discardData, setDiscardData] = useState<Omit<SteelDiscard, 'id' | 'synced' | 'createdAt'>>(() => {
    const saved = localStorage.getItem('draft_discardData');
    if (saved) return JSON.parse(saved);
    return {
      date: new Date().toISOString().split('T')[0],
      serie: '',
      equipo: '',
      diametro: '',
      fechaPostura: new Date().toISOString().split('T')[0],
      fechaDescarte: new Date().toISOString().split('T')[0],
      tipoAcero: 'Bit',
      causaDescarte: '',
      metros: 0,
      terreno: 'Medio'
    };
  });
  const [uploadingDiscardPhoto, setUploadingDiscardPhoto] = useState(false);

  useEffect(() => { localStorage.setItem('draft_reportData', JSON.stringify(reportData)); }, [reportData]);
  useEffect(() => { localStorage.setItem('draft_wells', JSON.stringify(wells)); }, [wells]);
  useEffect(() => { localStorage.setItem('draft_steelChangeData', JSON.stringify(steelChangeData)); }, [steelChangeData]);
  useEffect(() => { localStorage.setItem('draft_steelMeasurementData', JSON.stringify(steelMeasurementData)); }, [steelMeasurementData]);
  useEffect(() => { localStorage.setItem('draft_newEventData', JSON.stringify(newEventData)); }, [newEventData]);
  useEffect(() => { localStorage.setItem('draft_discardData', JSON.stringify(discardData)); }, [discardData]);

  const getCurrentTime = () => {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  };

  const calculateMinutes = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440; // Next day
    return diff;
  };

  // Cargar cantidad de registros pendientes y configurar listeners de conexión
  useEffect(() => {
    const updatePendingCount = async () => {
      const count = await db.reports.where('synced').equals(0).count();
      setPendingCount(count);
    };

    const handleOnline = () => {
      setIsOnline(true);
      // Intentar sincronizar automáticamente al recuperar conexión
      syncData().then(updatePendingCount);
      syncPendingDeletions(); // Sincronizar eliminaciones pendientes
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cargar conteo inicial y sincronizar si hay conexión
    updatePendingCount();
    if (navigator.onLine) {
      syncData().then(updatePendingCount);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar datos cuando se cambia de página
  useEffect(() => {
    if (currentPage === 'inventario') {
      loadLastInventory();
    } else if (currentPage === 'eventos') {
      loadOpenEvents();
    }
  }, [currentPage]);

  const addWell = () => {
    const lastWell = [...wells].reverse().find(w => w.type === 'well');
    const newNum = lastWell ? (parseInt(lastWell.wellNumber) + 1).toString() : '1';

    setWells([...wells, {
      type: 'well',
      wellNumber: newNum,
      meters: 0,
      startTime: getCurrentTime(),
      endTime: '',
      terrain: 'Medio',
      timeMin: 0,
      pulldown: '',
      rpm: '',
      observations: ''
    }]);
  };

  const addDelay = () => {
    const lastDelay = [...wells].reverse().find(w => w.type === 'delay');
    const newNum = lastDelay ? (parseInt(lastDelay.wellNumber) + 1).toString() : '1';

    setWells([...wells, {
      type: 'delay',
      wellNumber: newNum,
      startTime: getCurrentTime(),
      endTime: '',
      category: 'Mecanica',
      timeMin: 0,
      observations: ''
    }]);
  };

  const finishItem = (index: number) => {
    const updatedWells = [...wells];
    const item = updatedWells[index];
    const endTime = getCurrentTime();
    updatedWells[index] = {
      ...item,
      endTime,
      timeMin: calculateMinutes(item.startTime, endTime)
    };
    setWells(updatedWells);
  };

  const removeWell = (index: number) => {
    const updatedWells = wells.filter((_, i) => i !== index);
    setWells(updatedWells);
  };

  const updateWell = (index: number, field: keyof WellRecord, value: any) => {
    const updatedWells = [...wells];
    const newItem = { ...updatedWells[index], [field]: value };
    if (field === 'startTime' || field === 'endTime') {
      newItem.timeMin = calculateMinutes(newItem.startTime, newItem.endTime);
    }
    updatedWells[index] = newItem as WellRecord;
    setWells(updatedWells);
  };

  const totalMeters = wells.reduce((sum, item) => sum + (item.type === 'well' ? (item.meters || 0) : 0), 0);
  const totalDelays = wells.reduce((sum, item) => sum + (item.type === 'delay' ? (item.timeMin || 0) : 0), 0);

  const handleSave = async () => {
    try {
      const recordToSave = {
        ...reportData,
        wells,
        synced: 0,
        createdAt: Date.now()
      };

      const reportStr = JSON.stringify(recordToSave);
      if (lastSavedDrafts['draft_wells'] === reportStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }
      
      let syncSuccess = false;
      const btn = document.querySelector('.btn-save');
      const originalText = btn?.textContent || 'GUARDAR REGISTRO';
      
      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          const fd = new FormData();
          fd.append('payload', reportStr);
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) syncSuccess = true;
        } catch(e) { console.error('Error enviando a la nube:', e); }
      }

      recordToSave.synced = syncSuccess ? 1 : 0;
      await db.reports.add(recordToSave);
      const newCount = await db.reports.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (syncSuccess) {
        setWells([]);
        localStorage.removeItem('draft_wells');
        lastSavedDrafts['draft_wells'] = '';
        
        setReportData({
          date: new Date().toISOString().split('T')[0],
          shift: 'TURNO A',
          drillNumber: '',
          operator: '',
          bench: '',
          phase: '',
          mesh: '',
          triconeBrand: '',
          triconeModel: '',
          triconeSerial: '',
          triconeDiameter: '10 5/8"'
        });
        localStorage.removeItem('draft_reportData');
        
        if (btn) {
          btn.textContent = '¡GUARDADO EN LA NUBE!';
          setTimeout(() => btn.textContent = originalText, 2500);
        }
      } else {
        lastSavedDrafts['draft_wells'] = reportStr;
        if (btn) btn.textContent = originalText;
        alert(isOnline ? 'Error al guardar en la nube. Guardado localmente.' : 'Sin internet. Progreso guardado de forma local.');
      }
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Error al intentar guardar.');
    }
  };



  const syncData = async () => {
    console.log('Iniciando sincronización...');
    const unsynced = await db.reports.where('synced').equals(0).toArray();
    console.log('Reportes pendientes de sincronizar:', unsynced.length);

    if (unsynced.length === 0) return;

    for (const report of unsynced) {
      try {
        if (!GAS_URL || GAS_URL.includes('TU_URL_DE_APPS_SCRIPT_AQUI')) {
          console.warn('Sincronización cancelada: GAS_URL no configurada.');
          return;
        }

        console.log('Sincronizando reporte:', report.id);

        // Usamos un iframe oculto para enviar el formulario (evita CORS completamente)
        const iframe = document.createElement('iframe');
        iframe.name = 'sync_iframe_' + Date.now();
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GAS_URL;
        form.target = iframe.name;

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = JSON.stringify(report);
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();

        // Limpiar después de un breve tiempo
        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 5000);

        // Marcar como sincronizado (asumimos éxito ya que no hay forma de verificar)
        await db.reports.update(report.id!, { synced: 1 });
        console.log('Reporte sincronizado con éxito:', report.id);
      } catch (error) {
        console.error('Fallo en la sincronización del reporte', report.id, error);
      }
    }
  };

  // Guardar Cambio de Aceros
  const handleSaveSteelChange = async () => {
    try {
      const record: Omit<SteelChange, 'id'> = {
        ...steelChangeData,
        synced: 0,
        createdAt: Date.now()
      };

      const recordStr = JSON.stringify(record);
      if (lastSavedDrafts['draft_steelChangeData'] === recordStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }

      let syncSuccess = false;
      const btn = document.querySelector('.btn-save-steel');
      const originalText = btn?.textContent || 'GUARDAR REGISTRO';

      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          const fd = new FormData();
          fd.append('steelChange', recordStr);
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) syncSuccess = true;
        } catch (e) { console.error('Error enviando a nube:', e); }
      }

      record.synced = syncSuccess ? 1 : 0;
      await db.steelChanges.add(record);

      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (syncSuccess) {
        setSteelChangeData({
          date: new Date().toISOString().split('T')[0],
          drillNumber: '',
          shift: 'TURNO A',
          component: 'Amortiguador',
          serialNumber: '',
          comments: ''
        });
        localStorage.removeItem('draft_steelChangeData');
        lastSavedDrafts['draft_steelChangeData'] = '';
        if (btn) {
          btn.textContent = '¡GUARDADO EN LA NUBE!';
          setTimeout(() => btn.textContent = originalText, 2500);
        }
      } else {
        lastSavedDrafts['draft_steelChangeData'] = recordStr;
        if (btn) btn.textContent = originalText;
        alert(isOnline ? 'Error contactando nube. Guardado local.' : 'Sin internet. Guardado localmente.');
      }
    } catch (error) {
      console.error('Error guardando cambio de aceros:', error);
      alert('Error al guardar el registro.');
    }
  };



  // Guardar Medición de Aceros
  const handleSaveSteelMeasurement = async () => {
    try {
      const record: Omit<SteelMeasurement, 'id'> = {
        ...steelMeasurementData,
        synced: 0,
        createdAt: Date.now()
      };

      const recordStr = JSON.stringify(record);
      if (lastSavedDrafts['draft_steelMeasurementData'] === recordStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }

      let syncSuccess = false;
      const btn = document.querySelector('.btn-save-measurement');
      const originalText = btn?.textContent || 'GUARDAR REGISTRO';

      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          const fd = new FormData();
          fd.append('steelMeasurement', recordStr);
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) syncSuccess = true;
        } catch (e) { console.error('Error enviando a nube:', e); }
      }

      record.synced = syncSuccess ? 1 : 0;
      await db.steelMeasurements.add(record);

      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count() +
        await db.steelMeasurements.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (syncSuccess) {
        setSteelMeasurementData({
          date: new Date().toISOString().split('T')[0],
          shift: 'A',
          drillNumber: '',
          adaptadorInferiorMedio: 0,
          barraPateraSuperior: 0,
          barraPateraMedio: 0,
          barraPateraInferior: 0,
          barraSeguidora1Superior: 0,
          barraSeguidora1Medio: 0,
          barraSeguidora1Inferior: 0,
          barraSeguidora2Superior: 0,
          barraSeguidora2Medio: 0,
          barraSeguidora2Inferior: 0,
          barraSeguidora3Superior: 0,
          barraSeguidora3Medio: 0,
          barraSeguidora3Inferior: 0,
          barraSeguidora4Superior: 0,
          barraSeguidora4Medio: 0,
          barraSeguidora4Inferior: 0,
          barraSeguidora5Superior: 0,
          barraSeguidora5Medio: 0,
          barraSeguidora5Inferior: 0
        });
        localStorage.removeItem('draft_steelMeasurementData');
        lastSavedDrafts['draft_steelMeasurementData'] = '';
        if (btn) {
          btn.textContent = '¡GUARDADO EN LA NUBE!';
          setTimeout(() => btn.textContent = originalText, 2500);
        }
      } else {
        lastSavedDrafts['draft_steelMeasurementData'] = recordStr;
        if (btn) btn.textContent = originalText;
        alert(isOnline ? 'Error contactando nube. Guardado local.' : 'Sin internet. Guardado localmente.');
      }
    } catch (error) {
      console.error('Error guardando medición de aceros:', error);
      alert('Error al guardar la medición.');
    }
  };



  // Descargar eventos desde Google Sheets
  const downloadEventsFromSheet = async (): Promise<Event[]> => {
    try {
      const response = await fetch(`${GAS_URL}?action=getEvents`);
      const result = await response.json();
      if (result.success && result.events) {
        console.log('Eventos descargados desde Excel:', result.events.length);
        return result.events;
      }
      return [];
    } catch (error) {
      console.error('Error descargando eventos:', error);
      return [];
    }
  };

  // Cargar eventos abiertos (con sincronización bidireccional)
  const loadOpenEvents = async () => {
    // Primero cargar eventos locales
    let localEvents = await db.events.where('closed').equals(0).toArray();

    // Si hay conexión, descargar eventos del Excel y fusionar
    if (navigator.onLine) {
      try {
        const remoteEvents = await downloadEventsFromSheet();

        // Fusionar: agregar eventos remotos que no existen localmente
        for (const remoteEvent of remoteEvents) {
          if (remoteEvent.closed === 0) { // Solo eventos abiertos
            // Buscar si ya existe localmente (por título y fecha para evitar duplicados)
            const exists = localEvents.some(
              local => local.title === remoteEvent.title && local.date === remoteEvent.date
            );

            if (!exists) {
              // Agregar a la BD local
              await db.events.add({
                ...remoteEvent,
                synced: 1 // Ya está sincronizado porque viene del Excel
              });
              console.log('Evento importado del Excel:', remoteEvent.title);
            }
          }
        }

        // Recargar eventos locales después de la fusión
        localEvents = await db.events.where('closed').equals(0).toArray();
      } catch (error) {
        console.warn('Error sincronizando eventos desde Excel:', error);
      }
    }

    setOpenEvents(localEvents);
  };

  // Guardar nuevo evento
  const handleSaveEvent = async () => {
    try {
      if (!newEventData.title || !newEventData.responsible) {
        alert('Por favor complete los campos obligatorios (Título y Responsable)');
        return;
      }

      const record: Omit<Event, 'id'> = {
        ...newEventData,
        closed: 0,
        synced: 0,
        createdAt: Date.now()
      };

      const recordStr = JSON.stringify(record);
      if (lastSavedDrafts['draft_newEventData'] === recordStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }

      let syncSuccess = false;
      const btn = document.querySelector('.btn-save-event');
      const originalText = btn?.textContent || 'GUARDAR EVENTO';

      let eventToSync = { ...record };

      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          
          if (record.photo && record.photo.startsWith('data:image')) {
            const driveUrl = await uploadPhotoToDrive(record.photo);
            if (driveUrl) {
              eventToSync.photo = driveUrl;
            }
          }

          const fd = new FormData();
          fd.append('event', JSON.stringify(eventToSync));
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) syncSuccess = true;
        } catch (e) {
           console.error('Error enviando a nube:', e);
        }
      }

      eventToSync.synced = syncSuccess ? 1 : 0;
      await db.events.add(eventToSync);

      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count() +
        await db.steelMeasurements.where('synced').equals(0).count() +
        await db.events.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (syncSuccess) {
        setNewEventData({
          date: new Date().toISOString().split('T')[0],
          title: '',
          description: '',
          responsible: '',
          photo: ''
        });
        localStorage.removeItem('draft_newEventData');
        lastSavedDrafts['draft_newEventData'] = '';
        await loadOpenEvents();
        setCurrentPage('eventos');
        
        if (btn) {
          btn.textContent = '¡GUARDADO EN LA NUBE!';
          setTimeout(() => btn.textContent = originalText, 2500);
        }
      } else {
        lastSavedDrafts['draft_newEventData'] = recordStr;
        if (btn) btn.textContent = originalText;
        alert(isOnline ? 'Error en nube. Guardado local.' : 'Sin internet. Guardado localmente.');
        await loadOpenEvents();
        setCurrentPage('eventos');
      }
    } catch (error) {
      console.error('Error guardando evento:', error);
      alert('Error al guardar el evento.');
    }
  };

  // Mostrar modal de confirmación para eliminar
  const confirmDeleteEvent = (event: Event) => {
    setEventToDelete(event);
  };

  // Cancelar eliminación
  const cancelDeleteEvent = () => {
    setEventToDelete(null);
  };

  // Eliminar evento (con soporte offline)
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;

    const event = eventToDelete;
    setEventToDelete(null); // Cerrar modal

    try {
      // Eliminar de la BD local
      await db.events.delete(event.id!);

      // Si el evento ya fue sincronizado, necesitamos eliminarlo del Excel también
      if (event.synced === 1) {
        if (isOnline) {
          // Eliminar directamente del Excel
          await deleteEventFromSheet(event.id!, event.title);
        } else {
          // Guardar la eliminación pendiente para sincronizar después
          await db.pendingDeletions.add({
            type: 'event',
            recordId: event.id!,
            recordTitle: event.title,
            createdAt: Date.now(),
            synced: 0
          });
          console.log('Eliminación pendiente guardada para sincronizar:', event.id);
        }
      }

      // Actualizar la lista de eventos
      await loadOpenEvents();

      // Feedback visual
      alert('Evento eliminado correctamente');
    } catch (error) {
      console.error('Error eliminando evento:', error);
      alert('Error al eliminar el evento.');
    }
  };

  // Eliminar evento del Google Sheet
  const deleteEventFromSheet = async (eventId: number, eventTitle: string) => {
    try {
      const formData = new FormData();
      formData.append('deleteEvent', JSON.stringify({ id: eventId, title: eventTitle }));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        console.log('Evento eliminado del Excel:', eventId);
      } else {
        console.warn('Error eliminando del Excel:', result.error);
      }
    } catch (error) {
      console.error('Error eliminando evento del Excel:', error);
    }
  };

  // Sincronizar eliminaciones pendientes
  const syncPendingDeletions = async () => {
    const pending = await db.pendingDeletions.where('synced').equals(0).toArray();
    if (pending.length === 0) return;

    for (const deletion of pending) {
      try {
        if (deletion.type === 'event') {
          await deleteEventFromSheet(deletion.recordId, deletion.recordTitle);
        }
        // Marcar como sincronizado
        await db.pendingDeletions.update(deletion.id!, { synced: 1 });
        console.log('Eliminación sincronizada:', deletion.recordId);
      } catch (error) {
        console.error('Error sincronizando eliminación:', error);
      }
    }
  };

  // Función auxiliar para subir foto a Google Drive
  const uploadPhotoToDrive = async (base64Data: string): Promise<string | null> => {
    try {
      const mimeMatch = base64Data.match(/data:(image\/\w+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const photoPayload = {
        base64: base64Data,
        mimeType: mimeType,
        filename: `evento_sync_${Date.now()}.jpg`
      };

      const formData = new FormData();
      formData.append('uploadPhoto', JSON.stringify(photoPayload));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success && result.url) {
        return result.url;
      }
      return null;
    } catch (error) {
      console.error('Error subiendo foto a Drive:', error);
      return null;
    }
  };



  // Manejar foto - sube a Google Drive si hay conexión
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Leer como base64 primero
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;

      if (isOnline) {
        // Subir a Google Drive
        setUploadingPhoto(true);
        try {
          const photoPayload = {
            base64: base64Data,
            mimeType: file.type,
            filename: `evento_${Date.now()}_${file.name}`
          };

          // Usar fetch para subir y obtener URL
          const formData = new FormData();
          formData.append('uploadPhoto', JSON.stringify(photoPayload));

          const response = await fetch(GAS_URL, {
            method: 'POST',
            body: formData
          });

          const result = await response.json();
          if (result.success && result.url) {
            setNewEventData({ ...newEventData, photo: result.url });
            console.log('Foto subida a Drive:', result.url);
          } else {
            // Si falla, guardar base64 local
            console.warn('Error subiendo foto, guardando local:', result.error);
            setNewEventData({ ...newEventData, photo: base64Data });
          }
        } catch (error) {
          console.error('Error subiendo foto:', error);
          // Guardar base64 local si falla
          setNewEventData({ ...newEventData, photo: base64Data });
        } finally {
          setUploadingPhoto(false);
        }
      } else {
        // Sin conexión: guardar base64 local, se subirá al sincronizar
        setNewEventData({ ...newEventData, photo: base64Data });
        console.log('Sin conexión: foto guardada localmente');
      }
    };
    reader.readAsDataURL(file);
  };

  // Descargar último inventario desde Google Sheets
  const downloadLastInventoryFromSheet = async () => {
    try {
      const response = await fetch(`${GAS_URL}?action=getLastInventory`);
      const result = await response.json();
      if (result.success && result.inventory) {
        console.log('Último inventario descargado desde Excel');
        return result.inventory;
      }
      return null;
    } catch (error) {
      console.error('Error descargando inventario:', error);
      return null;
    }
  };

  // Cargar último registro de inventario (con sincronización bidireccional)
  const loadLastInventory = async () => {
    // Primero cargar registro local más reciente
    let localRecord = await db.inventoryRecords.orderBy('createdAt').reverse().first();

    // Si hay conexión, intentar descargar desde Excel
    if (navigator.onLine) {
      try {
        const remoteInventory = await downloadLastInventoryFromSheet();
        if (remoteInventory) {
          const remoteDate = new Date(remoteInventory.date).getTime();
          const localDate = localRecord ? new Date(localRecord.date).getTime() : 0;

          // Si el remoto es más reciente o no hay local, importar y guardar
          if (remoteDate > localDate || !localRecord) {
            // Construir el registro para guardar en IndexedDB
            const inventoryToSave: Omit<InventoryRecord, 'id'> = {
              date: remoteInventory.date,
              synced: 1, // Ya viene del Excel, está sincronizado
              createdAt: remoteInventory.createdAt || Date.now()
            } as Omit<InventoryRecord, 'id'>;

            // Agregar todos los campos de inventario
            INVENTORY_CATEGORIES.forEach(cat => {
              cat.items.forEach(item => {
                const centralKey = `${item.key}_central` as keyof InventoryRecord;
                const minaKey = `${item.key}_mina` as keyof InventoryRecord;
                (inventoryToSave as any)[centralKey] = remoteInventory[centralKey] || 0;
                (inventoryToSave as any)[minaKey] = remoteInventory[minaKey] || 0;
              });
            });

            // Verificar si ya existe un registro con la misma fecha
            const existingRecord = await db.inventoryRecords.where('date').equals(remoteInventory.date).first();
            if (!existingRecord) {
              await db.inventoryRecords.add(inventoryToSave);
              console.log('Inventario guardado localmente desde Excel:', remoteInventory.date);
            }

            // Actualizar la referencia local
            localRecord = await db.inventoryRecords.orderBy('createdAt').reverse().first();
          }
        }
      } catch (error) {
        console.warn('Error sincronizando inventario desde Excel:', error);
      }
    }

    // Cargar datos del registro local (ya sea descargado o previo)
    if (localRecord) {
      setLastInventoryDate(localRecord.date);
      // Cargar los valores del último registro
      const newData: Record<string, number> = {};
      INVENTORY_CATEGORIES.forEach(cat => {
        cat.items.forEach(item => {
          const centralKey = `${item.key}_central` as keyof InventoryRecord;
          const minaKey = `${item.key}_mina` as keyof InventoryRecord;
          newData[`${item.key}_central`] = (localRecord![centralKey] as number) || 0;
          newData[`${item.key}_mina`] = (localRecord![minaKey] as number) || 0;
        });
      });
      setInventoryData(newData);
      setInventoryObs(localRecord.observations || {});
      setOpenSnRow(null);
      setInventoryDate(localRecord.date); // Precargar la fecha también
    } else {
      setLastInventoryDate(null);
      setInventoryData(createEmptyInventory());
      setInventoryObs({});
      setOpenSnRow(null);
    }
  };

  // Guardar registro de inventario
  const handleSaveInventory = async () => {
    try {
      const record = {
        date: inventoryDate,
        ...inventoryData,
        observations: inventoryObs,
        synced: 0,
        createdAt: Date.now()
      } as Omit<InventoryRecord, 'id'>;

      console.log('Guardando inventario...', record);
      await db.inventoryRecords.add(record);

      // Feedback visual
      const btn = document.querySelector('.btn-save-inventory');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '¡GUARDADO!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }

      // Actualizar conteo pendiente
      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count() +
        await db.steelMeasurements.where('synced').equals(0).count() +
        await db.events.where('synced').equals(0).count() +
        await db.inventoryRecords.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (isOnline) {
        await syncInventoryRecords();
      }

      setLastInventoryDate(inventoryDate);
      alert('Inventario guardado correctamente');
    } catch (error) {
      console.error('Error guardando inventario:', error);
      alert('Error al guardar el inventario.');
    }
  };

  // Sincronizar registros de inventario
  const syncInventoryRecords = async () => {
    const unsynced = await db.inventoryRecords.where('synced').equals(0).toArray();
    if (unsynced.length === 0) return;

    for (const record of unsynced) {
      try {
        const iframe = document.createElement('iframe');
        iframe.name = 'sync_inventory_' + Date.now();
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GAS_URL;
        form.target = iframe.name;

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'inventoryRecord';
        input.value = JSON.stringify(record);
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 5000);

        await db.inventoryRecords.update(record.id!, { synced: 1 });
        console.log('Inventario sincronizado:', record.id);
      } catch (error) {
        console.error('Error sincronizando inventario:', error);
      }
    }
  };

  // Resetear formulario de descarte
  const resetDiscardForm = () => {
    setDiscardData({
      date: new Date().toISOString().split('T')[0],
      serie: '',
      equipo: '',
      diametro: '',
      fechaPostura: new Date().toISOString().split('T')[0],
      fechaDescarte: new Date().toISOString().split('T')[0],
      tipoAcero: 'Bit',
      causaDescarte: '',
      metros: 0,
      terreno: 'Medio'
    });
  };

  // Guardar descarte de aceros
  const handleSaveDiscard = async () => {
    try {
      if (!discardData.serie || !discardData.equipo) {
        alert('Por favor complete los campos obligatorios (Serie y Equipo)');
        return;
      }

      const record: Omit<SteelDiscard, 'id'> = {
        ...discardData,
        synced: 0,
        createdAt: Date.now()
      };

      const recordStr = JSON.stringify(record);
      if (lastSavedDrafts['draft_discardData'] === recordStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }

      let syncSuccess = false;
      const btn = document.querySelector('.btn-save-discard');
      const originalText = btn?.textContent || 'GUARDAR DESCARTE';

      let dataToSync = { ...record };

      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          const fd = new FormData();
          fd.append('steelDiscard', JSON.stringify(dataToSync));
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) syncSuccess = true;
        } catch (e) {
          console.error('Error enviando a nube:', e);
        }
      }

      dataToSync.synced = syncSuccess ? 1 : 0;
      await db.steelDiscards.add(dataToSync);

      if (syncSuccess) {
        resetDiscardForm();
        localStorage.removeItem('draft_discardData');
        lastSavedDrafts['draft_discardData'] = '';
        setCurrentPage('tecnico');
        if (btn) {
          btn.textContent = '¡GUARDADO EN LA NUBE!';
          setTimeout(() => btn.textContent = originalText, 2500);
        }
      } else {
        lastSavedDrafts['draft_discardData'] = recordStr;
        if (btn) btn.textContent = originalText;
        alert(isOnline ? 'Error en nube. Guardado local.' : 'Sin internet. Guardado localmente.');
        setCurrentPage('tecnico');
      }
    } catch (error) {
      console.error('Error guardando descarte:', error);
      alert('Error al guardar el registro.');
    }
  };



  // Manejar foto de descarte
  const handleDiscardPhotoChange = (fieldName: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;

      if (isOnline) {
        setUploadingDiscardPhoto(true);
        try {
          const photoPayload = {
            base64: base64Data,
            mimeType: file.type,
            filename: `descarte_${fieldName}_${Date.now()}_${file.name}`
          };

          const formData = new FormData();
          formData.append('uploadPhoto', JSON.stringify(photoPayload));

          const response = await fetch(GAS_URL, {
            method: 'POST',
            body: formData
          });

          const result = await response.json();
          if (result.success && result.url) {
            setDiscardData(prev => ({ ...prev, [fieldName]: result.url }));
            console.log('Foto subida a Drive:', result.url);
          } else {
            setDiscardData(prev => ({ ...prev, [fieldName]: base64Data }));
          }
        } catch (error) {
          console.error('Error subiendo foto:', error);
          setDiscardData(prev => ({ ...prev, [fieldName]: base64Data }));
        } finally {
          setUploadingDiscardPhoto(false);
        }
      } else {
        setDiscardData(prev => ({ ...prev, [fieldName]: base64Data }));
      }
    };
    reader.readAsDataURL(file);
  };

  const hasDraftReport = 
    reportData.drillNumber !== '' ||
    reportData.operator !== '' ||
    reportData.bench !== '' ||
    reportData.phase !== '' ||
    reportData.mesh !== '' ||
    reportData.triconeBrand !== '' ||
    reportData.triconeModel !== '' ||
    reportData.triconeSerial !== '' ||
    wells.length > 0;
    
  const hasDraftSteel = steelChangeData.drillNumber || steelChangeData.serialNumber || steelChangeData.comments;
  const hasDraftMeasurement = steelMeasurementData.drillNumber || steelMeasurementData.adaptadorInferiorMedio > 0 || steelMeasurementData.barraPateraSuperior > 0;
  const hasDraftEvent = newEventData.title || newEventData.description || newEventData.responsible;
  const hasDraftDiscard = discardData.serie || discardData.equipo || discardData.causaDescarte;

  return (
    <div>
      <div className="connectivity-status">
        {isOnline ? (
          <><Wifi size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> ONLINE{pendingCount > 0 ? ` - ${pendingCount} PENDIENTE(S)` : ' - SINCRONIZADO'}</>
        ) : (
          <><WifiOff size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> OFFLINE{pendingCount > 0 ? ` - ${pendingCount} PENDIENTE(S)` : ''}</>
        )}
        {isOnline && pendingCount > 0 && (
          <button
            onClick={async () => {
              await syncData();
              const count = await db.reports.where('synced').equals(0).count();
              setPendingCount(count);
            }}
            style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer' }}
          >
            SINCRONIZAR AHORA
          </button>
        )}
      </div>

      <header className="header">
        <div className="logo-container">
          <img src="/drillco-logo.png" alt="Drillco" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
        <div className="brand-title">
          <h1>ÁREA TÉCNICA</h1>
          <p>Lomas Bayas</p>
        </div>
        <div className="logo-container">
          <img src="/codelco-logo.png" alt="Codelco" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
      </header>

      {/* Página principal de Reporte */}
      {currentPage === 'reporte' && (
        <main className="container">
          {/* Datos del Turno */}
          <section className="card">
            <div className="card-title">
              <ClipboardList size={20} />
              Datos del Turno
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={reportData.date} onChange={(e) => setReportData({ ...reportData, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Turno</label>
                <select value={reportData.shift} onChange={(e) => setReportData({ ...reportData, shift: e.target.value })}>
                  <option>TURNO A</option>
                  <option>TURNO B</option>
                </select>
              </div>
              <div className="form-group">
                <label>Perforadora</label>
                <select value={reportData.drillNumber} onChange={(e) => setReportData({ ...reportData, drillNumber: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  <option value="5">5</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="14">14</option>
                </select>
              </div>
              <div className="form-group">
                <label>Operador *</label>
                <input type="text" placeholder="Nombre" value={reportData.operator} onChange={(e) => setReportData({ ...reportData, operator: e.target.value })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                  <input type="checkbox" id="saveName" style={{ width: 'auto' }} />
                  <label htmlFor="saveName" style={{ textTransform: 'none', fontSize: '0.7rem' }}>Guardar nombre</label>
                </div>
              </div>
              <div className="form-group">
                <label>Banco</label>
                <input type="text" placeholder="2210" value={reportData.bench} onChange={(e) => setReportData({ ...reportData, bench: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Fase</label>
                <input type="text" placeholder="8" value={reportData.phase} onChange={(e) => setReportData({ ...reportData, phase: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Malla</label>
                <input type="text" className="full-width" placeholder="12" value={reportData.mesh} onChange={(e) => setReportData({ ...reportData, mesh: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Datos Tricono */}
          <section className="card">
            <div className="card-title">
              <Activity size={20} />
              Datos Tricono
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Marca</label>
                <input type="text" placeholder="Shareate1" value={reportData.triconeBrand} onChange={(e) => setReportData({ ...reportData, triconeBrand: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Modelo</label>
                <input type="text" placeholder="615r" value={reportData.triconeModel} onChange={(e) => setReportData({ ...reportData, triconeModel: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Serie</label>
                <input type="text" placeholder="78452211" value={reportData.triconeSerial} onChange={(e) => setReportData({ ...reportData, triconeSerial: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Diámetro</label>
                <select value={reportData.triconeDiameter} onChange={(e) => setReportData({ ...reportData, triconeDiameter: e.target.value })}>
                  <option>10 5/8"</option>
                  <option>7 7/8"</option>
                </select>
              </div>
            </div>
          </section>

          {/* Registro de Pozos */}
          <div className="well-section-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              REGISTRO DE TRABAJO
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'none', fontSize: '0.8rem', fontWeight: 500 }}>
                <input type="checkbox" id="reporteTotal" style={{ width: 'auto' }} />
                <label htmlFor="reporteTotal">REPORTE TOTAL</label>
              </div>
            </h2>
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>TOTAL METROS</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--secondary)' }}>{totalMeters.toFixed(1)}m</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>TOTAL DEMORAS</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--danger)' }}>{totalDelays} min</div>
              </div>
            </div>
          </div>

          {wells.map((item, index) => (
            <div key={index} className="well-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <span className="well-badge">#{item.wellNumber}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    {item.type === 'well' ? 'POZO' : 'DEMORA'}
                  </span>
                </div>
                <button onClick={() => removeWell(index)} style={{ background: 'none', color: 'var(--danger)' }}>
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>N° {item.type === 'well' ? 'Pozo' : 'Demora'}</label>
                  <input
                    type="text"
                    value={item.wellNumber}
                    onChange={(e) => updateWell(index, 'wellNumber', e.target.value)}
                  />
                </div>

                {item.type === 'well' ? (
                  <div className="form-group">
                    <label style={{ color: 'var(--secondary)' }}>Metros</label>
                    <input
                      type="number"
                      value={item.meters}
                      onChange={(e) => updateWell(index, 'meters', parseFloat(e.target.value))}
                      style={{ borderColor: 'var(--secondary)', background: '#f0f7ff' }}
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Categoría</label>
                    <select value={item.category} onChange={(e) => updateWell(index, 'category', e.target.value)}>
                      <option>Mecanica</option>
                      <option>Abastecimiento</option>
                      <option>Colación</option>
                    </select>
                  </div>
                )}

                <div className="form-group full-width">
                  <label>Horario (Inicio → Fin)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="time" value={item.startTime} onChange={(e) => updateWell(index, 'startTime', e.target.value)} />
                    <span>→</span>
                    <input type="time" value={item.endTime} onChange={(e) => updateWell(index, 'endTime', e.target.value)} />
                  </div>
                </div>

                {item.type === 'well' && (
                  <>
                    <div className="form-group">
                      <label>Terreno</label>
                      <select value={item.terrain} onChange={(e) => updateWell(index, 'terrain', e.target.value)}>
                        <option>Blando</option>
                        <option>Medio</option>
                        <option>Duro</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Pulldown / RPM</label>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <input
                          type="text"
                          placeholder="Pull"
                          value={item.pulldown}
                          onChange={(e) => updateWell(index, 'pulldown', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="RPM"
                          value={item.rpm}
                          onChange={(e) => updateWell(index, 'rpm', e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Tiempo Total</label>
                  <div style={{ padding: '0.75rem', background: '#f0f2f5', borderRadius: '8px', textAlign: 'center', fontSize: '0.9rem' }}>
                    {item.timeMin} min
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>Observaciones</label>
                  <textarea
                    placeholder="Comentarios..."
                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', resize: 'none' }}
                    value={item.observations}
                    onChange={(e) => updateWell(index, 'observations', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px dashed var(--border)', paddingTop: '1rem' }}>
                <button
                  onClick={() => finishItem(index)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '2px solid var(--secondary)',
                    background: 'white',
                    color: 'var(--secondary)',
                    fontWeight: 700,
                    fontSize: '0.8rem'
                  }}
                >
                  {item.type === 'well' ? 'Termino del Pozo' : 'Termino de Demora'}
                </button>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  ACUMULADO {item.type === 'well' ? 'METROS' : 'TIEMPO'}: <span style={{ color: item.type === 'well' ? 'var(--secondary)' : 'var(--danger)' }}>
                    {item.type === 'well'
                      ? wells.slice(0, index + 1).filter(w => w.type === 'well').reduce((s, w) => s + (w.meters || 0), 0).toFixed(1) + ' M'
                      : wells.slice(0, index + 1).filter(w => w.type === 'delay').reduce((s, w) => s + (w.timeMin || 0), 0) + ' MIN'
                    }
                  </span>
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn-add" onClick={addWell} style={{ marginTop: 0 }}>
              <PlusCircle size={20} />
              AGREGAR POZO
            </button>
            <button className="btn-add" onClick={addDelay} style={{ marginTop: 0, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              <Activity size={20} />
              DEMORAS
            </button>
          </div>

          <button className={`btn-save ${hasDraftReport ? 'pulse-red' : ''}`} onClick={handleSave}>
            <Save size={24} />
            GUARDAR REGISTRO
          </button>
        </main>
      )}

      {/* Página Cambio de Aceros */}
      {currentPage === 'cambioAceros' && (
        <main className="container">
          <section className="card">
            <div className="card-title">
              <HardHat size={20} />
              <span>CAMBIO DE ACEROS</span>
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Registre reemplazos y movimientos de componentes
            </p>
          </section>

          <section className="card">
            <div className="card-title">
              <Calendar size={20} />
              <span>FECHA DEL CAMBIO</span>
            </div>
            <input
              type="date"
              value={steelChangeData.date}
              onChange={(e) => setSteelChangeData({ ...steelChangeData, date: e.target.value })}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <ClipboardList size={20} />
              <span>PERFORADORA Y TURNO</span>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Perforadora</label>
                <select
                  value={steelChangeData.drillNumber}
                  onChange={(e) => setSteelChangeData({ ...steelChangeData, drillNumber: e.target.value })}
                >
                  <option value="">Seleccionar...</option>
                  <option value="5">5</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="14">14</option>
                </select>
              </div>
              <div className="form-group">
                <label>TURNO</label>
                <select
                  value={steelChangeData.shift}
                  onChange={(e) => setSteelChangeData({ ...steelChangeData, shift: e.target.value })}
                >
                  <option value="TURNO A">Turno A</option>
                  <option value="TURNO B">Turno B</option>
                </select>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <HardHat size={20} />
              <span>COMPONENTE (TIPO DE ACERO)</span>
            </div>
            <select
              value={steelChangeData.component}
              onChange={(e) => setSteelChangeData({ ...steelChangeData, component: e.target.value })}
            >
              <option value="Amortiguador">Amortiguador</option>
              <option value="Adaptador superior">Adaptador superior</option>
              <option value="Barra Seguidora">Barra Seguidora</option>
              <option value="Barra Patera">Barra Patera</option>
              <option value="Adaptador inferior">Adaptador inferior</option>
              <option value="Anillo Guia">Anillo Guia</option>
              <option value="Tricono">Tricono</option>
            </select>
          </section>

          <section className="card">
            <div className="card-title">
              <FileText size={20} />
              <span>N° DE SERIE *</span>
            </div>
            <input
              type="text"
              placeholder="Ingrese serie del componente"
              value={steelChangeData.serialNumber}
              onChange={(e) => setSteelChangeData({ ...steelChangeData, serialNumber: e.target.value })}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <FileText size={20} />
              <span>COMENTARIOS</span>
            </div>
            <textarea
              placeholder="Motivo del cambio, observaciones, etc."
              value={steelChangeData.comments}
              onChange={(e) => setSteelChangeData({ ...steelChangeData, comments: e.target.value })}
              rows={3}
            />
          </section>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              className="btn-add"
              onClick={() => setCurrentPage('reporte')}
              style={{ flex: 1 }}
            >
              ← VOLVER
            </button>
            <button
              className={`btn-save btn-save-steel ${hasDraftSteel ? 'pulse-red' : ''}`}
              onClick={handleSaveSteelChange}
              style={{ flex: 2 }}
            >
              <Save size={24} />
              GUARDAR REGISTRO
            </button>
          </div>
        </main>
      )}

      {/* Página Medición de Aceros */}
      {currentPage === 'medicionAceros' && (
        <main className="container">
          <section className="card">
            <div className="card-title">
              <Activity size={20} />
              <span>MEDICIÓN DE ACEROS</span>
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Registre las mediciones de los aceros
            </p>
          </section>

          {/* Información General */}
          <section className="card">
            <div className="card-title">
              <ClipboardList size={20} />
              <span>INFORMACIÓN GENERAL</span>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="form-group">
                <label>FECHA</label>
                <input
                  type="date"
                  value={steelMeasurementData.date}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>TURNO</label>
                <select
                  value={steelMeasurementData.shift}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, shift: e.target.value })}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </div>
              <div className="form-group">
                <label>Perforadora</label>
                <select
                  value={steelMeasurementData.drillNumber}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, drillNumber: e.target.value })}
                >
                  <option value="">Seleccionar...</option>
                  <option value="5">5</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="14">14</option>
                </select>
              </div>
            </div>
          </section>

          {/* 1. Adaptador Inferior */}
          <section className="card">
            <div className="card-title">
              <span style={{
                background: 'var(--success)',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                marginRight: '8px'
              }}>1</span>
              <span>ADAPTADOR INFERIOR</span>
            </div>
            <div className="form-group" style={{ maxWidth: '200px' }}>
              <label>MEDIO (PULG)</label>
              <input
                type="number"
                step="0.1"
                value={steelMeasurementData.adaptadorInferiorMedio}
                onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, adaptadorInferiorMedio: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </section>

          {/* 2. Barra Patera */}
          <section className="card">
            <div className="card-title">
              <span style={{
                background: 'var(--primary)',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                marginRight: '8px'
              }}>2</span>
              <span>BARRA PATERA</span>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="form-group">
                <label>SUPERIOR (PULG)</label>
                <input
                  type="number"
                  step="0.1"
                  value={steelMeasurementData.barraPateraSuperior}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, barraPateraSuperior: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label>MEDIO (PULG)</label>
                <input
                  type="number"
                  step="0.1"
                  value={steelMeasurementData.barraPateraMedio}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, barraPateraMedio: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label style={{ color: 'var(--danger)' }}>INFERIOR (PULG)</label>
                <input
                  type="number"
                  step="0.1"
                  value={steelMeasurementData.barraPateraInferior}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, barraPateraInferior: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </section>

          {/* 3. Barras Seguidoras - dinámicas según perforadora */}
          {/* Perforadoras 8, 11, 14 = 5 barras; Perforadoras 5, 9, 10, 12, 13 = 2 barras */}
          {[1, 2, 3, 4, 5].map((num) => {
            const drill = steelMeasurementData.drillNumber;
            const has5Barras = ['8', '11', '14'].includes(drill);
            const maxBarras = has5Barras ? 5 : 2;

            if (num > maxBarras) return null;

            const supKey = `barraSeguidora${num}Superior` as keyof typeof steelMeasurementData;
            const medKey = `barraSeguidora${num}Medio` as keyof typeof steelMeasurementData;
            const infKey = `barraSeguidora${num}Inferior` as keyof typeof steelMeasurementData;

            return (
              <section key={num} className="card">
                <div className="card-title">
                  <span style={{
                    background: 'var(--primary)',
                    color: 'white',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    marginRight: '8px'
                  }}>{num + 2}</span>
                  <span>BARRA SEGUIDORA {num}</span>
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="form-group">
                    <label>SUPERIOR (PULG)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={steelMeasurementData[supKey] as number}
                      onChange={(e) => setSteelMeasurementData({
                        ...steelMeasurementData,
                        [supKey]: parseFloat(e.target.value) || 0
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label>MEDIO (PULG)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={steelMeasurementData[medKey] as number}
                      onChange={(e) => setSteelMeasurementData({
                        ...steelMeasurementData,
                        [medKey]: parseFloat(e.target.value) || 0
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label>INFERIOR (PULG)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={steelMeasurementData[infKey] as number}
                      onChange={(e) => setSteelMeasurementData({
                        ...steelMeasurementData,
                        [infKey]: parseFloat(e.target.value) || 0
                      })}
                    />
                  </div>
                </div>
              </section>
            );
          })}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              className="btn-add"
              onClick={() => setCurrentPage('reporte')}
              style={{ flex: 1 }}
            >
              ← VOLVER
            </button>
            <button
              className={`btn-save btn-save-measurement ${hasDraftMeasurement ? 'pulse-red' : ''}`}
              onClick={handleSaveSteelMeasurement}
              style={{ flex: 2 }}
            >
              <Save size={24} />
              GUARDAR MEDICIONES
            </button>
          </div>
        </main>
      )}

      {/* Página Lista de Eventos */}
      {currentPage === 'eventos' && (
        <main className="container">
          <section className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={20} />
                <span>EVENTOS</span>
              </div>
              <button
                onClick={loadOpenEvents}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}
              >
                ↻
              </button>
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Registro de eventos e incidentes
            </p>
          </section>

          <button
            className="btn-save"
            onClick={() => setCurrentPage('nuevoEvento')}
            style={{ marginBottom: '1rem' }}
          >
            <PlusCircle size={20} />
            NUEVO EVENTO
          </button>

          {/* Lista de eventos abiertos */}
          {openEvents.length === 0 ? (
            <section className="card">
              <p style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                No hay eventos abiertos. Presiona "NUEVO EVENTO" para crear uno.
              </p>
            </section>
          ) : (
            openEvents.map((event) => (
              <section key={event.id} className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>{event.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                      {new Date(event.date).toLocaleDateString('es-CL')}
                    </span>
                    <button
                      onClick={() => confirmDeleteEvent(event)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                        padding: '4px'
                      }}
                      title="Eliminar evento"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
                  {event.description || 'Sin descripción'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-light)' }}>
                  <span>👤</span>
                  <span>{event.responsible}</span>
                </div>
                {event.photo && (
                  <a
                    href={event.photo}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--primary)', fontSize: '0.85rem', marginTop: '0.5rem', display: 'block' }}
                  >
                    📷 Ver fotografía adjunta
                  </a>
                )}
              </section>
            ))
          )}

          <button
            className="btn-add"
            onClick={() => setCurrentPage('reporte')}
            style={{ marginTop: '1rem' }}
          >
            ← VOLVER
          </button>

          {/* Modal de confirmación de eliminación */}
          {eventToDelete && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
              }}>
                <h3 style={{ margin: '0 0 1rem', color: 'var(--danger)' }}>
                  🗑️ Eliminar Evento
                </h3>
                <p style={{ margin: '0 0 1.5rem', color: 'var(--text-light)' }}>
                  ¿Estás seguro de eliminar el evento <strong>"{eventToDelete.title}"</strong>? Esta acción no se puede deshacer.
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={cancelDeleteEvent}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'white',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteEvent}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--danger)',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* Página Nuevo Evento */}
      {currentPage === 'nuevoEvento' && (
        <main className="container">
          <section className="card">
            <div className="card-title">
              <Calendar size={20} />
              <span>NUEVO EVENTO</span>
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Registrar nuevo evento en bitácora
            </p>
          </section>

          <section className="card">
            <div className="card-title">
              <span>FECHA *</span>
            </div>
            <input
              type="date"
              value={newEventData.date}
              onChange={(e) => setNewEventData({ ...newEventData, date: e.target.value })}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <span>TÍTULO *</span>
            </div>
            <input
              type="text"
              placeholder="Ej: Fuga en amortiguador."
              value={newEventData.title}
              onChange={(e) => setNewEventData({ ...newEventData, title: e.target.value })}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <span>DESCRIPCIÓN</span>
            </div>
            <textarea
              placeholder="Describe el evento o incidente en detalle..."
              value={newEventData.description}
              onChange={(e) => setNewEventData({ ...newEventData, description: e.target.value })}
              rows={4}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <span>RESPONSABLE *</span>
            </div>
            <input
              type="text"
              placeholder="Nombre del responsable"
              value={newEventData.responsible}
              onChange={(e) => setNewEventData({ ...newEventData, responsible: e.target.value })}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <span>📷 FOTOGRAFÍA</span>
            </div>
            <div style={{
              border: '2px dashed var(--border)',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              background: 'var(--card-bg)'
            }}>
              {newEventData.photo ? (
                <img
                  src={newEventData.photo}
                  alt="Preview"
                  style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }}
                />
              ) : (
                <p style={{ color: 'var(--text-light)', margin: '0 0 1rem 0' }}>
                  Captura o selecciona una imagen
                </p>
              )}
              {uploadingPhoto ? (
                <div style={{
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: 'white',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  ⏳ SUBIENDO FOTO...
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <label className="btn-save" style={{ flex: 1, display: 'inline-flex', cursor: 'pointer', background: 'var(--primary)' }}>
                    <Camera size={20} style={{ marginRight: '8px' }} />
                    CÁMARA
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <label className="btn-save" style={{ flex: 1, display: 'inline-flex', cursor: 'pointer', background: 'var(--secondary)', color: 'var(--white)' }}>
                    <ImageIcon size={20} style={{ marginRight: '8px' }} />
                    GALERÍA
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              )}
            </div>
          </section>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              className="btn-add"
              onClick={() => setCurrentPage('eventos')}
              style={{ flex: 1 }}
            >
              ← CANCELAR
            </button>
            <button
              className={`btn-save btn-save-event ${hasDraftEvent ? 'pulse-red' : ''}`}
              onClick={handleSaveEvent}
              style={{ flex: 2 }}
            >
              <Save size={24} />
              GUARDAR EVENTO
            </button>
          </div>
        </main>
      )}

      {/* Panel Técnico */}
      {currentPage === 'analista' && (
        <main className="container">
          <section className="card">
            <div className="card-title">
              <FileText size={20} />
              <span>PANEL TÉCNICO</span>
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Herramientas de gestión y control
            </p>
          </section>

          {/* Grid de opciones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {/* Inventario */}
            <section
              className="card"
              style={{ cursor: 'pointer', textAlign: 'center' }}
              onClick={() => { loadLastInventory(); setCurrentPage('inventario'); }}
            >
              <div style={{
                background: 'rgba(74, 144, 217, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <ClipboardList size={32} style={{ color: 'var(--primary)' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>Inventario</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Gestión de stock de aceros y triconos
              </p>
            </section>

            {/* Descarte de Aceros */}
            <section
              className="card"
              onClick={() => setCurrentPage('descarteAceros')}
              style={{ cursor: 'pointer', textAlign: 'center' }}>
              <div style={{
                background: 'rgba(255, 193, 7, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <Trash2 size={32} style={{ color: '#ffc107' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>Descarte de Aceros</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Registro de componentes fuera de servicio
              </p>
            </section>

            {/* Control de Diámetros */}
            <section className="card" style={{ cursor: 'pointer', textAlign: 'center', opacity: 0.6 }}>
              <div style={{
                background: 'rgba(40, 167, 69, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <Activity size={32} style={{ color: 'var(--success)' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>Control de Diámetros</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Próximamente
              </p>
            </section>

            {/* Estadística de Aceros */}
            <section className="card" style={{ cursor: 'pointer', textAlign: 'center', opacity: 0.6 }}>
              <div style={{
                background: 'rgba(128, 0, 128, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <Activity size={32} style={{ color: '#800080' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>Estadística de Aceros</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Próximamente
              </p>
            </section>
          </div>

          <button
            className="btn-add"
            onClick={() => setCurrentPage('reporte')}
            style={{ marginTop: '1rem' }}
          >
            ← VOLVER
          </button>
        </main>
      )}

      {/* Página Inventario - Tabla completa */}
      {currentPage === 'inventario' && (
        <main className="container">
          <section className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} />
                <span>INVENTARIO</span>
              </div>
              <input
                type="date"
                value={inventoryDate}
                onChange={(e) => setInventoryDate(e.target.value)}
                style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
              />
            </div>
            {lastInventoryDate && (
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                Último registro: {new Date(lastInventoryDate).toLocaleDateString('es-CL')}
              </p>
            )}
          </section>

          {/* Tabla de inventario */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: 'white' }}>
              <thead>
                <tr style={{ background: 'var(--primary)', color: 'white' }}>
                  <th style={{ padding: '0.5rem', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--primary)', minWidth: '80px' }}>Categoría</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left', minWidth: '200px' }}>Item</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', minWidth: '70px' }}>N° SAP</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', minWidth: '80px' }}>Bod. Central</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', minWidth: '80px' }}>Bod. Mina</th>
                </tr>
              </thead>
              <tbody>
                {INVENTORY_CATEGORIES.map((category, catIdx) => {
                  const hasExpandedChild = category.items.some(i => i.key === openSnRow);
                  const newRowSpan = category.items.length + (hasExpandedChild ? 1 : 0);

                  return category.items.map((item, itemIdx) => (
                    <React.Fragment key={item.key}>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: catIdx % 2 === 0 ? '#f8f9fa' : 'white' }}>
                        {itemIdx === 0 && (
                          <td
                            rowSpan={newRowSpan}
                            style={{
                              padding: '0.5rem',
                              fontWeight: 'bold',
                              verticalAlign: 'middle',
                              background: catIdx % 2 === 0 ? '#e9ecef' : '#f8f9fa',
                              position: 'sticky',
                              left: 0,
                              fontSize: '0.75rem'
                            }}
                          >
                            {category.name}
                          </td>
                        )}
                        <td style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}>{item.name}</td>
                        <td style={{ padding: '0.3rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-light)' }}>{item.sap}</td>
                        <td style={{ padding: '0.2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              onClick={() => setInventoryData({
                                ...inventoryData,
                                [`${item.key}_central`]: Math.max(0, (inventoryData[`${item.key}_central`] || 0) - 1)
                              })}
                              style={{
                                width: '28px',
                                height: '28px',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: '#f8f9fa',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '1rem'
                              }}
                            >−</button>
                            <input
                              type="number"
                              min="0"
                              value={inventoryData[`${item.key}_central`] || 0}
                              onChange={(e) => setInventoryData({
                                ...inventoryData,
                                [`${item.key}_central`]: parseInt(e.target.value) || 0
                              })}
                              style={{
                                width: '45px',
                                padding: '0.25rem',
                                textAlign: 'center',
                                border: '1px solid var(--border)',
                                borderRadius: '4px'
                              }}
                            />
                            <button
                              onClick={() => setInventoryData({
                                ...inventoryData,
                                [`${item.key}_central`]: (inventoryData[`${item.key}_central`] || 0) + 1
                              })}
                              style={{
                                width: '28px',
                                height: '28px',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: '#f8f9fa',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '1rem'
                              }}
                            >+</button>

                            <button
                              onClick={() => setOpenSnRow(openSnRow === item.key ? null : item.key)}
                              style={{
                                marginLeft: '6px',
                                width: '28px',
                                height: '28px',
                                border: '1px solid var(--primary)',
                                borderRadius: '4px',
                                background: openSnRow === item.key ? 'var(--primary)' : 'white',
                                color: openSnRow === item.key ? 'white' : 'var(--primary)',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '0.75rem',
                                padding: 0
                              }}
                            >
                              SN
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '0.2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              onClick={() => setInventoryData({
                                ...inventoryData,
                                [`${item.key}_mina`]: Math.max(0, (inventoryData[`${item.key}_mina`] || 0) - 1)
                              })}
                              style={{
                                width: '28px',
                                height: '28px',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: '#f8f9fa',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '1rem'
                              }}
                            >−</button>
                            <input
                              type="number"
                              min="0"
                              value={inventoryData[`${item.key}_mina`] || 0}
                              onChange={(e) => setInventoryData({
                                ...inventoryData,
                                [`${item.key}_mina`]: parseInt(e.target.value) || 0
                              })}
                              style={{
                                width: '45px',
                                padding: '0.25rem',
                                textAlign: 'center',
                                border: '1px solid var(--border)',
                                borderRadius: '4px'
                              }}
                            />
                            <button
                              onClick={() => setInventoryData({
                                ...inventoryData,
                                [`${item.key}_mina`]: (inventoryData[`${item.key}_mina`] || 0) + 1
                              })}
                              style={{
                                width: '28px',
                                height: '28px',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: '#f8f9fa',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '1rem'
                              }}
                            >+</button>
                          </div>
                        </td>
                      </tr>
                      {openSnRow === item.key && (
                        <tr style={{ background: '#fffbcc' }}>
                          <td colSpan={4} style={{ padding: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#856404' }}>
                                Observaciones / N° Serie para {item.name}:
                              </label>
                              <input 
                                type="text" 
                                placeholder="Ingrese números de serie u observaciones..." 
                                value={inventoryObs[item.key] || ''}
                                onChange={(e) => setInventoryObs({ ...inventoryObs, [item.key]: e.target.value })}
                                style={{ 
                                  width: '100%', 
                                  padding: '0.4rem', 
                                  border: '1px solid #ffe066', 
                                  borderRadius: '4px', 
                                  fontSize: '0.85rem' 
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ));
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              className="btn-add"
              onClick={() => setCurrentPage('analista')}
              style={{ flex: 1 }}
            >
              ← VOLVER
            </button>
            <button
              className="btn-save btn-save-inventory"
              onClick={handleSaveInventory}
              style={{ flex: 2 }}
            >
              <Save size={24} />
              ACTUALIZAR STOCK
            </button>
          </div>
        </main>
      )}

      {/* Página Descarte de Aceros */}
      {currentPage === 'descarteAceros' && (
        <main className="container">
          <section className="card">
            <div className="card-title">
              <Trash2 size={20} />
              <span>DESCARTE DE ACEROS</span>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Fecha</label>
                <input
                  type="date"
                  value={discardData.date}
                  onChange={(e) => setDiscardData({ ...discardData, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Serie</label>
                <input
                  type="text"
                  placeholder="Ej: S12345"
                  value={discardData.serie}
                  onChange={(e) => setDiscardData({ ...discardData, serie: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Equipo</label>
                <input
                  type="text"
                  placeholder="Ej: PV-05"
                  value={discardData.equipo}
                  onChange={(e) => setDiscardData({ ...discardData, equipo: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Diámetro</label>
                <input
                  type="text"
                  placeholder="Ej: 10 5/8"
                  value={discardData.diametro}
                  onChange={(e) => setDiscardData({ ...discardData, diametro: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Fecha de Postura</label>
                <input
                  type="date"
                  value={discardData.fechaPostura}
                  onChange={(e) => setDiscardData({ ...discardData, fechaPostura: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Fecha de Descarte</label>
                <input
                  type="date"
                  value={discardData.fechaDescarte}
                  onChange={(e) => setDiscardData({ ...discardData, fechaDescarte: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Tipo Acero</label>
                <select
                  value={discardData.tipoAcero}
                  onChange={(e) => setDiscardData({ ...discardData, tipoAcero: e.target.value as any })}
                >
                  <option value="Bit">Bit</option>
                  <option value="Martillo">Martillo</option>
                  <option value="Tricono">Tricono</option>
                </select>
              </div>
              <div className="form-group">
                <label>Terreno</label>
                <select
                  value={discardData.terreno}
                  onChange={(e) => setDiscardData({ ...discardData, terreno: e.target.value as any })}
                >
                  <option value="Blando">Blando</option>
                  <option value="Medio">Medio</option>
                  <option value="Duro">Duro</option>
                </select>
              </div>
              <div className="form-group">
                <label>Metros</label>
                <input
                  type="number"
                  value={discardData.metros}
                  onChange={(e) => setDiscardData({ ...discardData, metros: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="form-group full-width">
                <label>Causa de Descarte</label>
                <textarea
                  placeholder="Escriba la razón del descarte..."
                  value={discardData.causaDescarte}
                  onChange={(e) => setDiscardData({ ...discardData, causaDescarte: e.target.value })}
                  style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              {/* Campos específicos según el tipo */}
              {discardData.tipoAcero === 'Bit' && (
                <>
                  <div className="form-group">
                    <label>Medida entre Insertos</label>
                    <input
                      type="text"
                      value={discardData.medidaEntreInsertos || ''}
                      onChange={(e) => setDiscardData({ ...discardData, medidaEntreInsertos: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Medida de matriz</label>
                    <input
                      type="text"
                      value={discardData.medidaMatriz || ''}
                      onChange={(e) => setDiscardData({ ...discardData, medidaMatriz: e.target.value })}
                    />
                  </div>
                </>
              )}

              {discardData.tipoAcero === 'Martillo' && (
                <>
                  <div className="form-group">
                    <label>Diámetro lado Culata</label>
                    <input
                      type="text"
                      value={discardData.diametroCulata || ''}
                      onChange={(e) => setDiscardData({ ...discardData, diametroCulata: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Diámetro lado portabit</label>
                    <input
                      type="text"
                      value={discardData.diametroPortabit || ''}
                      onChange={(e) => setDiscardData({ ...discardData, diametroPortabit: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Sección de Fotos */}
          <section className="card">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--secondary)' }}>📸 REGISTRO FOTOGRÁFICO</h3>
            <div className="form-grid">
              {/* Fotos Comunes/Bit/Martillo */}
              {(discardData.tipoAcero === 'Bit' || discardData.tipoAcero === 'Martillo') && (
                <>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Foto Serie</label>
                      {discardData.fotoSerie && <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ LISTA</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '0.3rem' }}>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--primary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <Camera size={14} style={{ marginRight: '4px' }}/> Cámara
                         <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange('fotoSerie')} style={{ display: 'none' }} />
                      </label>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <ImageIcon size={14} style={{ marginRight: '4px' }}/> Galería
                         <input type="file" accept="image/*" onChange={handleDiscardPhotoChange('fotoSerie')} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Foto Cuerpo</label>
                      {discardData.fotoCuerpo && <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ LISTA</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '0.3rem' }}>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--primary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <Camera size={14} style={{ marginRight: '4px' }}/> Cámara
                         <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange('fotoCuerpo')} style={{ display: 'none' }} />
                      </label>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <ImageIcon size={14} style={{ marginRight: '4px' }}/> Galería
                         <input type="file" accept="image/*" onChange={handleDiscardPhotoChange('fotoCuerpo')} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                </>
              )}
              {discardData.tipoAcero === 'Bit' && (
                <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Foto Botones</label>
                      {discardData.fotoBotones && <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ LISTA</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '0.3rem' }}>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--primary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <Camera size={14} style={{ marginRight: '4px' }}/> Cámara
                         <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange('fotoBotones')} style={{ display: 'none' }} />
                      </label>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <ImageIcon size={14} style={{ marginRight: '4px' }}/> Galería
                         <input type="file" accept="image/*" onChange={handleDiscardPhotoChange('fotoBotones')} style={{ display: 'none' }} />
                      </label>
                    </div>
                </div>
              )}

              {/* Fotos específicas para Tricono */}
              {discardData.tipoAcero === 'Tricono' && (
                <>
                  {[
                    { key: 'fotoSerie', obsKey: 'obsSerie', label: 'Serie' },
                    { key: 'fotoCuerpoFaldon1', obsKey: 'obsCuerpoFaldon1', label: 'Cuerpo/Faldon 1' },
                    { key: 'fotoCuerpoFaldon2', obsKey: 'obsCuerpoFaldon2', label: 'Cuerpo/Faldon 2' },
                    { key: 'fotoCuerpoFaldon3', obsKey: 'obsCuerpoFaldon3', label: 'Cuerpo/Faldon 3' },
                    { key: 'fotoCono1', obsKey: 'obsCono1', label: 'Cono 1' },
                    { key: 'fotoCono2', obsKey: 'obsCono2', label: 'Cono 2' },
                    { key: 'fotoCono3', obsKey: 'obsCono3', label: 'Cono 3' },
                    { key: 'fotoNozzles', obsKey: 'obsNozzles', label: 'Nozzles' },
                    { key: 'fotoConos', obsKey: 'obsConos', label: 'Conos' },
                  ].map((item) => (
                    <div key={item.key} className="form-group" style={{ border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label>{item.label}</label>
                        {discardData[item.key as keyof typeof discardData] && <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ LISTA</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '0.3rem' }}>
                        <label style={{ flex: 1, padding: '6px', background: 'var(--primary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <Camera size={14} style={{ marginRight: '4px' }}/> Cámara
                           <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange(item.key)} style={{ display: 'none' }} />
                        </label>
                        <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <ImageIcon size={14} style={{ marginRight: '4px' }}/> Galería
                           <input type="file" accept="image/*" onChange={handleDiscardPhotoChange(item.key)} style={{ display: 'none' }} />
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="Observaciones"
                        style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.2rem' }}
                        value={(discardData as any)[item.obsKey] || ''}
                        onChange={(e) => setDiscardData({ ...discardData, [item.obsKey]: e.target.value })}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
            {uploadingDiscardPhoto && <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)' }}>Subiendo fotografía...</p>}
          </section>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button
              className="btn-add"
              onClick={() => { resetDiscardForm(); setCurrentPage('tecnico'); }}
              style={{ flex: 1 }}
            >
              CANCELAR
            </button>
            <button
              className={`btn-save btn-save-discard ${hasDraftDiscard ? 'pulse-red' : ''}`}
              onClick={handleSaveDiscard}
              style={{ flex: 2 }}
              disabled={uploadingDiscardPhoto}
            >
              <Save size={24} />
              {uploadingDiscardPhoto ? 'SUBIENDO...' : 'GUARDAR REGISTRO'}
            </button>
          </div>
        </main>
      )}

      <nav className="bottom-nav">
        <a
          href="#"
          className={`nav-item ${currentPage === 'reporte' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('reporte'); }}
        >
          <Home size={24} />
          <span>Inicio</span>
        </a>
        <a
          href="#"
          className={`nav-item ${currentPage === 'cambioAceros' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('cambioAceros'); }}
        >
          <HardHat size={24} />
          <span>CambioAceros</span>
        </a>
        <a
          href="#"
          className={`nav-item ${currentPage === 'medicionAceros' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('medicionAceros'); }}
        >
          <Activity size={24} />
          <span>MediciónAceros</span>
        </a>
        <a
          href="#"
          className={`nav-item ${currentPage === 'eventos' || currentPage === 'nuevoEvento' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); loadOpenEvents(); setCurrentPage('eventos'); }}
        >
          <Calendar size={24} />
          <span>Evento</span>
        </a>
        <a
          href="#"
          className={`nav-item ${currentPage === 'analista' || currentPage === 'inventario' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('analista'); }}
        >
          <FileText size={24} />
          <span>Técnico</span>
        </a>
      </nav>
    </div>
  );
};

export default App;
