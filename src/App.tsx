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
  Trash2
} from 'lucide-react';
import { db, type WellRecord, type SteelChange, type SteelMeasurement, type Event, type InventoryRecord } from './db';
import { INVENTORY_CATEGORIES, createEmptyInventory } from './inventoryData';
import './index.css';

const App: React.FC = () => {
  // CONFIGURACIÓN: Pega aquí la URL de tu implementación de Google Apps Script
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyJ4sVXk3Y5geSSvvuRkIQe-AOlyrsFEvxQnwOr2zbAFI7US65O1LKvs1ZlGk9Fpgvy/exec';

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wells, setWells] = useState<WellRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [currentPage, setCurrentPage] = useState<'reporte' | 'cambioAceros' | 'medicionAceros' | 'eventos' | 'nuevoEvento' | 'analista' | 'inventario'>('reporte');

  // Estado para Cambio de Aceros
  const [steelChangeData, setSteelChangeData] = useState({
    date: new Date().toISOString().split('T')[0],
    drillNumber: '101',
    shift: 'TURNO A',
    component: 'Amortiguador',
    serialNumber: '',
    comments: ''
  });

  // Estado para Medición de Aceros
  const [steelMeasurementData, setSteelMeasurementData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'A',
    drillNumber: '5',
    // Adaptador Inferior (primero)
    adaptadorInferiorMedio: 0,
    // Barra Patera (segundo)
    barraPateraSuperior: 0,
    barraPateraMedio: 0,
    barraPateraInferior: 0,
    // Barras Seguidoras (hasta 5)
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

  // Estado para Eventos
  const [openEvents, setOpenEvents] = useState<Event[]>([]);
  const [newEventData, setNewEventData] = useState({
    date: new Date().toISOString().split('T')[0],
    title: '',
    description: '',
    responsible: '',
    photo: ''
  });

  // Estado para Inventario
  const [inventoryData, setInventoryData] = useState<Record<string, number>>(createEmptyInventory());
  const [inventoryDate, setInventoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [lastInventoryDate, setLastInventoryDate] = useState<string | null>(null);


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
      const reportData = {
        date: (document.querySelector('input[type="date"]') as HTMLInputElement)?.value || new Date().toISOString().split('T')[0],
        shift: (document.querySelector('select:nth-of-type(1)') as HTMLSelectElement)?.value || 'TURNO A',
        drillNumber: (document.querySelector('select:nth-of-type(2)') as HTMLSelectElement)?.value || '101',
        operator: (document.querySelector('input[placeholder="Nombre"]') as HTMLInputElement)?.value || '',
        bench: (document.querySelector('input[placeholder="2210"]') as HTMLInputElement)?.value || '',
        phase: (document.querySelector('input[placeholder="8"]') as HTMLInputElement)?.value || '',
        mesh: (document.querySelector('input[placeholder="12"]') as HTMLInputElement)?.value || '',
        triconeBrand: (document.querySelector('input[placeholder="Shareate1"]') as HTMLInputElement)?.value || '',
        triconeModel: (document.querySelector('input[placeholder="615r"]') as HTMLInputElement)?.value || '',
        triconeSerial: (document.querySelector('input[placeholder="78452211"]') as HTMLInputElement)?.value || '',
        triconeDiameter: (document.querySelector('select:nth-last-of-type(2)') as HTMLSelectElement)?.value || '10 5/8"',
        wells,
        synced: 0,
        createdAt: Date.now()
      };

      console.log('Guardando reporte localmente...', reportData);
      const id = await db.reports.add(reportData);
      console.log('Reporte guardado con ID:', id);

      // Feedback visual no bloqueante (podríamos añadir un toast aquí)
      const btn = document.querySelector('.btn-save');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '¡GUARDADO!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }

      // Actualizar conteo de pendientes
      const newCount = await db.reports.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (isOnline) {
        await syncData();
        // Actualizar conteo después de sincronizar
        const countAfterSync = await db.reports.where('synced').equals(0).count();
        setPendingCount(countAfterSync);
      }

      // Limpiar formulario para nuevo registro
      setWells([]);
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Error al guardar el registro local.');
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

      console.log('Guardando cambio de aceros...', record);
      await db.steelChanges.add(record);

      // Feedback visual
      const btn = document.querySelector('.btn-save-steel');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '¡GUARDADO!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }

      // Actualizar conteo
      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (isOnline) {
        await syncSteelChanges();
        const countAfterSync = await db.reports.where('synced').equals(0).count() +
          await db.steelChanges.where('synced').equals(0).count();
        setPendingCount(countAfterSync);
      }

      // Limpiar formulario
      setSteelChangeData({
        date: new Date().toISOString().split('T')[0],
        drillNumber: '101',
        shift: 'TURNO A',
        component: 'Amortiguador',
        serialNumber: '',
        comments: ''
      });
    } catch (error) {
      console.error('Error guardando cambio de aceros:', error);
      alert('Error al guardar el registro.');
    }
  };

  // Sincronizar Cambios de Aceros
  const syncSteelChanges = async () => {
    const unsynced = await db.steelChanges.where('synced').equals(0).toArray();
    if (unsynced.length === 0) return;

    for (const record of unsynced) {
      try {
        const iframe = document.createElement('iframe');
        iframe.name = 'sync_steel_' + Date.now();
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GAS_URL;
        form.target = iframe.name;

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'steelChange';
        input.value = JSON.stringify(record);
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 5000);

        await db.steelChanges.update(record.id!, { synced: 1 });
        console.log('Cambio de aceros sincronizado:', record.id);
      } catch (error) {
        console.error('Error sincronizando cambio de aceros:', error);
      }
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

      console.log('Guardando medición de aceros...', record);
      await db.steelMeasurements.add(record);

      // Feedback visual
      const btn = document.querySelector('.btn-save-measurement');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '¡GUARDADO!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }

      // Actualizar conteo
      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count() +
        await db.steelMeasurements.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (isOnline) {
        await syncSteelMeasurements();
        const countAfterSync = await db.reports.where('synced').equals(0).count() +
          await db.steelChanges.where('synced').equals(0).count() +
          await db.steelMeasurements.where('synced').equals(0).count();
        setPendingCount(countAfterSync);
      }

      // Limpiar formulario
      setSteelMeasurementData({
        date: new Date().toISOString().split('T')[0],
        shift: 'A',
        drillNumber: '5',
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
    } catch (error) {
      console.error('Error guardando medición de aceros:', error);
      alert('Error al guardar la medición.');
    }
  };

  // Sincronizar Mediciones de Aceros
  const syncSteelMeasurements = async () => {
    const unsynced = await db.steelMeasurements.where('synced').equals(0).toArray();
    if (unsynced.length === 0) return;

    for (const record of unsynced) {
      try {
        const iframe = document.createElement('iframe');
        iframe.name = 'sync_measurement_' + Date.now();
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GAS_URL;
        form.target = iframe.name;

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'steelMeasurement';
        input.value = JSON.stringify(record);
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 5000);

        await db.steelMeasurements.update(record.id!, { synced: 1 });
        console.log('Medición de aceros sincronizada:', record.id);
      } catch (error) {
        console.error('Error sincronizando medición de aceros:', error);
      }
    }
  };

  // Cargar eventos abiertos
  const loadOpenEvents = async () => {
    const events = await db.events.where('closed').equals(0).toArray();
    setOpenEvents(events);
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

      console.log('Guardando evento...', record);
      await db.events.add(record);

      // Feedback visual
      const btn = document.querySelector('.btn-save-event');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '¡GUARDADO!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }

      // Actualizar conteo
      const newCount = await db.reports.where('synced').equals(0).count() +
        await db.steelChanges.where('synced').equals(0).count() +
        await db.steelMeasurements.where('synced').equals(0).count() +
        await db.events.where('synced').equals(0).count();
      setPendingCount(newCount);

      if (isOnline) {
        await syncEvents();
      }

      // Limpiar formulario y volver a lista
      setNewEventData({
        date: new Date().toISOString().split('T')[0],
        title: '',
        description: '',
        responsible: '',
        photo: ''
      });
      await loadOpenEvents();
      setCurrentPage('eventos');
    } catch (error) {
      console.error('Error guardando evento:', error);
      alert('Error al guardar el evento.');
    }
  };

  // Sincronizar Eventos
  const syncEvents = async () => {
    const unsynced = await db.events.where('synced').equals(0).toArray();
    if (unsynced.length === 0) return;

    for (const record of unsynced) {
      try {
        const iframe = document.createElement('iframe');
        iframe.name = 'sync_event_' + Date.now();
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GAS_URL;
        form.target = iframe.name;

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'event';
        input.value = JSON.stringify(record);
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 5000);

        await db.events.update(record.id!, { synced: 1 });
        console.log('Evento sincronizado:', record.id);
      } catch (error) {
        console.error('Error sincronizando evento:', error);
      }
    }
  };

  // Manejar foto
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewEventData({ ...newEventData, photo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // Cargar último registro de inventario
  const loadLastInventory = async () => {
    const lastRecord = await db.inventoryRecords.orderBy('createdAt').reverse().first();
    if (lastRecord) {
      setLastInventoryDate(lastRecord.date);
      // Cargar los valores del último registro
      const newData: Record<string, number> = {};
      INVENTORY_CATEGORIES.forEach(cat => {
        cat.items.forEach(item => {
          const centralKey = `${item.key}_central` as keyof InventoryRecord;
          const minaKey = `${item.key}_mina` as keyof InventoryRecord;
          newData[`${item.key}_central`] = (lastRecord[centralKey] as number) || 0;
          newData[`${item.key}_mina`] = (lastRecord[minaKey] as number) || 0;
        });
      });
      setInventoryData(newData);
    } else {
      setLastInventoryDate(null);
      setInventoryData(createEmptyInventory());
    }
  };

  // Guardar registro de inventario
  const handleSaveInventory = async () => {
    try {
      const record = {
        date: inventoryDate,
        ...inventoryData,
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
                <input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="form-group">
                <label>Turno</label>
                <select>
                  <option>TURNO A</option>
                  <option>TURNO B</option>
                </select>
              </div>
              <div className="form-group">
                <label>N° Perforadora</label>
                <select>
                  <option>101</option>
                  <option>102</option>
                  <option>103</option>
                </select>
              </div>
              <div className="form-group">
                <label>Operador *</label>
                <input type="text" placeholder="Nombre" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                  <input type="checkbox" id="saveName" style={{ width: 'auto' }} />
                  <label htmlFor="saveName" style={{ textTransform: 'none', fontSize: '0.7rem' }}>Guardar nombre</label>
                </div>
              </div>
              <div className="form-group">
                <label>Banco</label>
                <input type="text" placeholder="2210" />
              </div>
              <div className="form-group">
                <label>Fase</label>
                <input type="text" placeholder="8" />
              </div>
              <div className="form-group">
                <label>Malla</label>
                <input type="text" className="full-width" placeholder="12" />
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
                <input type="text" placeholder="Shareate1" />
              </div>
              <div className="form-group">
                <label>Modelo</label>
                <input type="text" placeholder="615r" />
              </div>
              <div className="form-group">
                <label>Serie</label>
                <input type="text" placeholder="78452211" />
              </div>
              <div className="form-group">
                <label>Diámetro</label>
                <select>
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

          <button className="btn-save" onClick={handleSave}>
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
                <label>PERFORADORA</label>
                <select
                  value={steelChangeData.drillNumber}
                  onChange={(e) => setSteelChangeData({ ...steelChangeData, drillNumber: e.target.value })}
                >
                  <option value="101">101</option>
                  <option value="102">102</option>
                  <option value="103">103</option>
                  <option value="104">104</option>
                  <option value="105">105</option>
                  <option value="106">106</option>
                  <option value="111">111</option>
                  <option value="112">112</option>
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
              className="btn-save btn-save-steel"
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
                <label>PERFORADORA</label>
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
              className="btn-save btn-save-measurement"
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                    {new Date(event.date).toLocaleDateString('es-CL')}
                  </span>
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
              <label className="btn-save" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                📷 TOMAR FOTO / SELECCIONAR
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
              </label>
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
              className="btn-save btn-save-event"
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

            {/* Bitácora - deshabilitado */}
            <section className="card" style={{ textAlign: 'center', opacity: 0.4 }}>
              <div style={{
                background: 'rgba(128, 128, 128, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <FileText size={32} style={{ color: '#888' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: '#888' }}>Bitácora</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Acceder desde menú principal
              </p>
            </section>

            {/* Configuración */}
            <section className="card" style={{ cursor: 'pointer', textAlign: 'center', gridColumn: 'span 2', opacity: 0.6 }}>
              <div style={{
                background: 'rgba(255, 193, 7, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <HardHat size={32} style={{ color: '#ffc107' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>Configuración</h3>
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
                {INVENTORY_CATEGORIES.map((category, catIdx) => (
                  category.items.map((item, itemIdx) => (
                    <tr key={item.key} style={{ borderBottom: '1px solid var(--border)', background: catIdx % 2 === 0 ? '#f8f9fa' : 'white' }}>
                      {itemIdx === 0 && (
                        <td
                          rowSpan={category.items.length}
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
                        <input
                          type="number"
                          min="0"
                          value={inventoryData[`${item.key}_central`] || 0}
                          onChange={(e) => setInventoryData({
                            ...inventoryData,
                            [`${item.key}_central`]: parseInt(e.target.value) || 0
                          })}
                          style={{
                            width: '100%',
                            padding: '0.25rem',
                            textAlign: 'center',
                            border: '1px solid var(--border)',
                            borderRadius: '4px'
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.2rem' }}>
                        <input
                          type="number"
                          min="0"
                          value={inventoryData[`${item.key}_mina`] || 0}
                          onChange={(e) => setInventoryData({
                            ...inventoryData,
                            [`${item.key}_mina`]: parseInt(e.target.value) || 0
                          })}
                          style={{
                            width: '100%',
                            padding: '0.25rem',
                            textAlign: 'center',
                            border: '1px solid var(--border)',
                            borderRadius: '4px'
                          }}
                        />
                      </td>
                    </tr>
                  ))
                ))}
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

      <nav className="bottom-nav">
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
