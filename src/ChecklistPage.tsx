import React, { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle2, ClipboardCheck, List, FileText, RefreshCw, Camera, Image as ImageIcon, X } from 'lucide-react';
import { db } from './db';
import { loadImageForPDF, compressImage } from './App';
import { formatDateSafe } from './utils/dateUtils';
import { syncEngine } from './syncEngine';

const ROTARY_DRILLS = ['5', '6', '7', '9', '10', '12', '13'];
const DTH_DRILLS = ['8', '11', '14'];

const ROTARY_ITEMS = {
  INSTRUMENTACIÓN: [
    'Manómetro Presión Rotación',
    'Manómetro Presión Pull Down',
    'Manómetro Presión Aire',
    'Sistema Modular',
    'Indicador RPM'
  ],
  SISTEMAS: [
    'Carrusel',
    'Tazones',
    'Rod Support',
    'Rod Catcher',
    'Cilindros Estabilizadores',
    'Manillas de Control',
    'Llave Corte',
    'Llave Caimán',
    'Mordazas',
    'Estrella',
    'Alineación y ajuste de Cabezal',
    'Topes Mecánicos Superiores',
    'Piola huinche',
    'Contrapeso huinche',
    'Gancho huinche',
    'Sistema seguridad barra en pozo',
    'Olla Corta Tricono 10 5/8',
    'Olla Corta Tricono 12 1/4',
    'Gorro porta Tricono',
    'Pandeo de Barras (Fugas)',
    'Deck Hold',
    'Fusibles de Seguridad',
    'Sello Wiper',
    'Barandas seguridad'
  ]
};

const DTH_ITEMS = {
  INSTRUMENTACIÓN: [
    'Manómetro Presión Rotación',
    'Manómetro Presión Pull Down',
    'Manómetro Presión Aire',
    'Sistema Modular',
    'Indicador RPM'
  ],
  SISTEMAS: [
    'Ajuste Unidad de rotacion',
    'Deslizaderas',
    'Coplon',
    'Hilo de barras',
    'Engrase automatico',
    'Mordazas',
    'Mesa de quiebre',
    'Centralizadores',
    'Capota de polvo',
    'Manillas',
    'Reguladores de presion',
    'Botoneras',
    'Inclinometros',
    'Mirilla',
    'Pandeo de Barras (Fugas)',
    'Apriete de barras'
  ]
};

interface ChecklistPageProps {
  onSave?: () => void;
  gasUrl: string;
  isOnline: boolean;
}

export const ChecklistPage: React.FC<ChecklistPageProps> = ({ onSave, gasUrl, isOnline }) => {
  const [type, setType] = useState<'Rotary' | 'DTH'>('Rotary');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [horometro, setHorometro] = useState('');
  const [operador, setOperador] = useState('');
  const [perforadora, setPerforadora] = useState(ROTARY_DRILLS[0]);
  const [cantidadAceros, setCantidadAceros] = useState('1');
  const [obsAceros, setObsAceros] = useState('');

  // items state stores: { "Item Name": { status: 'Bueno'|'Regular'|'Malo'|'NA', obs: '' } }
  const [items, setItems] = useState<Record<string, { status: string; obs: string }>>({});

  // Fotos adjuntas al checklist
  const [photos, setPhotos] = useState<string[]>([]);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  // Tabs y Historial
  const [activeTab, setActiveTab] = useState<'nuevo' | 'historial'>('nuevo');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterDrill, setFilterDrill] = useState('ALL');

  const loadHistory = async () => {
    // Si estamos sin conexión, cargar historial exclusivamente desde almacenamiento local (Dexie)
    if (!navigator.onLine) {
      console.log('Modo sin conexión: cargando historial de checklist desde Dexie local...');
      try {
        const localChecklists = await db.checklists.toArray();
        setHistory(localChecklists || []);
      } catch (err) {
        console.error('Error cargando checklists locales:', err);
      }
      return;
    }

    if (!gasUrl || gasUrl.includes('TU_URL')) {
      return;
    }
    setLoadingHistory(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${gasUrl}?action=getChecklists`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const json = await res.json();
      if (json.success) {
        setHistory(json.checklists || []);
      } else {
        console.warn("Respuesta no exitosa del servidor:", json.error);
        const localChecklists = await db.checklists.toArray();
        setHistory(localChecklists || []);
      }
    } catch (error) {
      console.warn("Fallo al conectar con la nube, cargando historial local:", error);
      try {
        const localChecklists = await db.checklists.toArray();
        setHistory(localChecklists || []);
      } catch (err) {
        console.error(err);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'historial') {
      loadHistory();
    }
  }, [activeTab]);

  const getImageNaturalDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
      img.onerror = () => resolve({ width: 800, height: 600 });
      img.src = src;
    });
  };

  const generatePDF = async (record: any) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);
    const doc = new jsPDF();

    const logoLeft = await loadImageForPDF('/drillco reporte.jpg').catch(() => null);
    const logoRight = await loadImageForPDF('/lomasbayas.png').catch(() => null);

    if (logoLeft) doc.addImage(logoLeft.data, 'JPEG', 15, 10, 40, 15);
    if (logoRight) doc.addImage(logoRight.data, 'PNG', 165, 10, 30, 15);

    doc.setFontSize(16);
    doc.setTextColor(11, 43, 69);
    doc.text("CHECKLIST DE EQUIPOS", 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 35,
      head: [['Fecha', 'Tipo', 'Operador', 'Perforadora', 'Horómetro', 'Aceros en Equipo']],
      body: [[
        formatDateSafe(record.date),
        record.type,
        record.operador,
        `PE-${record.perforadora}`,
        record.horometro,
        record.cantidadAceros
      ]],
      theme: 'grid',
      headStyles: { fillColor: [11, 43, 69] }
    });

    let finalHeaderY = (doc as any).lastAutoTable.finalY;
    if (record.obsAceros) {
      doc.setFontSize(10);
      doc.text(`Observaciones de Aceros: ${record.obsAceros}`, 15, finalHeaderY + 7);
      finalHeaderY += 10;
    }

    const tableData: any[][] = [];
    const itemsList = record.type === 'Rotary' ? Object.values(ROTARY_ITEMS).flat() : Object.values(DTH_ITEMS).flat();

    itemsList.forEach(item => {
      let status = 'NA';
      let obs = '';
      if (record.items && record.items[item]) {
        const parts = record.items[item].split(' | ');
        status = parts[0] ? parts[0].trim() : 'NA';
        obs = parts[1] ? parts[1].trim() : '';
      }
      tableData.push([item, status, obs]);
    });

    autoTable(doc, {
      startY: finalHeaderY + 5,
      head: [['Ítem Inspeccionado', 'Estado', 'Observación']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [11, 43, 69] },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 70 }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 1) {
          const val = data.cell.raw;
          if (val === 'Bueno') { data.cell.styles.textColor = [40, 167, 69]; data.cell.styles.fontStyle = 'bold'; }
          if (val === 'Regular') { data.cell.styles.textColor = [200, 150, 0]; data.cell.styles.fontStyle = 'bold'; }
          if (val === 'Malo') { data.cell.styles.textColor = [220, 53, 69]; data.cell.styles.fontStyle = 'bold'; }
        }
      }
    });

    // Registro Fotográfico de Inspección
    const photos: string[] = Array.isArray(record.photos) && record.photos.length > 0
      ? record.photos
      : (record.items?._photos && Array.isArray(record.items._photos) ? record.items._photos : []);

    if (photos.length > 0) {
      // Iniciar en página separada para orden y presentación ejecutiva
      doc.addPage();

      if (logoLeft) doc.addImage(logoLeft.data, 'JPEG', 15, 10, 40, 15);
      if (logoRight) doc.addImage(logoRight.data, 'PNG', 165, 10, 30, 15);

      doc.setFontSize(14);
      doc.setTextColor(11, 43, 69);
      doc.text("REGISTRO FOTOGRÁFICO DE INSPECCIÓN", 105, 20, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Perforadora PE-${record.perforadora} • Fecha: ${formatDateSafe(record.date)} • Operador: ${record.operador}`, 105, 26, { align: 'center' });

      let currentY = 33;
      const marginX = 15;
      const colWidth = 85;
      const colGap = 10;
      const imgBoxHeight = 56;
      const cardHeight = imgBoxHeight + 8; // Altura total de la tarjeta con pie de foto

      for (let i = 0; i < photos.length; i++) {
        const colIndex = i % 2;
        const posX = marginX + colIndex * (colWidth + colGap);

        // Salto de página si la fila excede el límite imprimible (A4: 297mm)
        if (currentY + cardHeight > 272) {
          doc.addPage();
          if (logoLeft) doc.addImage(logoLeft.data, 'JPEG', 15, 10, 40, 15);
          if (logoRight) doc.addImage(logoRight.data, 'PNG', 165, 10, 30, 15);

          doc.setFontSize(12);
          doc.setTextColor(11, 43, 69);
          doc.text(`REGISTRO FOTOGRÁFICO (Cont.) - PE-${record.perforadora}`, 105, 20, { align: 'center' });
          currentY = 32;
        }

        const photoSrc = photos[i];
        try {
          // Marco de tarjeta
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.roundedRect(posX, currentY, colWidth, cardHeight, 2, 2, 'FD');

          // Dimensiones naturales para encaje proporcional sin distorsión
          const dims = await getImageNaturalDimensions(photoSrc);
          const boxW = colWidth - 4;
          const boxH = imgBoxHeight;
          const imgRatio = dims.width / dims.height;
          const boxRatio = boxW / boxH;

          let drawW = boxW;
          let drawH = boxH;
          let offX = 0;
          let offY = 0;

          if (imgRatio > boxRatio) {
            drawW = boxW;
            drawH = boxW / imgRatio;
            offY = (boxH - drawH) / 2;
          } else {
            drawH = boxH;
            drawW = boxH * imgRatio;
            offX = (boxW - drawW) / 2;
          }

          doc.addImage(photoSrc, 'JPEG', posX + 2 + offX, currentY + 2 + offY, drawW, drawH, undefined, 'FAST');

          // Pie de foto centrado
          doc.setFontSize(8);
          doc.setTextColor(51, 65, 85);
          doc.text(`Foto #${i + 1} - Evidencia Inspección PE-${record.perforadora}`, posX + colWidth / 2, currentY + cardHeight - 2.5, { align: 'center' });
        } catch (imgErr) {
          console.warn(`Error al renderizar foto ${i + 1} en PDF:`, imgErr);
          doc.setFillColor(241, 245, 249);
          doc.rect(posX, currentY, colWidth, cardHeight, 'F');
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(`Foto #${i + 1} (No disponible)`, posX + colWidth / 2, currentY + cardHeight / 2, { align: 'center' });
        }

        // Si completamos la columna derecha o es la última foto impar, avanzar fila
        if (colIndex === 1 || i === photos.length - 1) {
          currentY += cardHeight + 6;
        }
      }
    }

    // Pie de página en todas las páginas
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Página ${p} de ${totalPages}`, 195, 290, { align: 'right' });
      doc.text("Drillco Mining Technologies • Checklist de Equipos Lomas Bayas", 15, 290);
    }

    doc.save(`Checklist_PE${record.perforadora}_${record.date}.pdf`);
  };

  const handleTypeChange = (newType: 'Rotary' | 'DTH') => {
    setType(newType);
    setPerforadora(newType === 'Rotary' ? ROTARY_DRILLS[0] : DTH_DRILLS[0]);
    setItems({}); // reset items on change
  };

  const handleItemStatus = (item: string, status: string) => {
    setItems(prev => ({
      ...prev,
      [item]: { ...prev[item], status, obs: prev[item]?.obs || '' }
    }));
  };

  const handleItemObs = (item: string, obs: string) => {
    setItems(prev => ({
      ...prev,
      [item]: { ...prev[item], status: prev[item]?.status || 'Bueno', obs }
    }));
  };

  const handlePhotoInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setProcessingPhotos(true);
    try {
      const newPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const compressed = await compressImage(file);
          if (compressed) {
            newPhotos.push(compressed);
          }
        } catch (err) {
          console.warn('Error procesando foto de checklist:', err);
        }
      }
      setPhotos(prev => [...prev, ...newPhotos]);
    } finally {
      setProcessingPhotos(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!horometro || !operador) {
      alert('Por favor complete Horómetro y Operador.');
      return;
    }

    setSaving(true);
    try {
      // Formatear items para la base de datos
      const formattedItems: Record<string, string> = {};
      const currentList = type === 'Rotary' ? ROTARY_ITEMS : DTH_ITEMS;

      // Iterar sobre todos los ítems posibles para asegurar que no falte ninguno
      Object.values(currentList).flat().forEach(itemName => {
        const itemData = items[itemName];
        const status = itemData?.status || 'NA';
        const obs = itemData?.obs || '';
        formattedItems[itemName] = `${status} | ${obs}`;
      });

      const newRecord = {
        type,
        date,
        horometro,
        operador,
        perforadora,
        cantidadAceros,
        obsAceros,
        items: formattedItems,
        photos,
        synced: 0,
        createdAt: Date.now()
      };

      let syncSuccess = false;
      if (isOnline && gasUrl && !gasUrl.includes('TU_URL')) {
        try {
          const fd = new FormData();
          fd.append('checklist', JSON.stringify(newRecord));
          const res = await fetch(gasUrl, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) syncSuccess = true;
        } catch (error) {
          console.error("Error sincronizando checklist en tiempo real:", error);
        }
      }

      newRecord.synced = syncSuccess ? 1 : 0;
      await db.checklists.add(newRecord);

      if (isOnline) {
        syncEngine.syncAll().catch(err => console.warn('Error sincronizando checklist con Supabase:', err));
      }

      if (onSave) {
        onSave();
      }

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 4000);

      // Resetear algunos campos
      setHorometro('');
      setOperador('');
      setObsAceros('');
      setItems({});
      setPhotos([]);
    } catch (error) {
      console.error('Error al guardar checklist:', error);
      alert('Error al guardar el checklist localmente.');
    } finally {
      setSaving(false);
    }
  };

  const renderChecklist = (category: string, list: string[]) => {
    return (
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ background: '#0b2b45', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', marginTop: '1rem' }}>
          {category}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {list.map(item => {
            const currentStatus = items[item]?.status;
            return (
              <div key={item} style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontWeight: 'bold' }}>{item}</div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['Bueno', 'Regular', 'Malo', 'NA'].map(status => (
                    <button
                      key={status}
                      onClick={() => handleItemStatus(item, status)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        background: currentStatus === status ?
                          (status === 'Bueno' ? '#28a745' : status === 'Regular' ? '#ffc107' : status === 'Malo' ? '#dc3545' : '#6c757d')
                          : '#f8f9fa',
                        color: currentStatus === status ? 'white' : '#333',
                        fontWeight: currentStatus === status ? 'bold' : 'normal',
                        cursor: 'pointer',
                        flex: 1,
                        minWidth: '60px'
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Observaciones..."
                  value={items[item]?.obs || ''}
                  onChange={(e) => handleItemObs(item, e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ padding: '1rem', paddingBottom: '80px', maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div className="page-title">
          <div className="page-icon">
            <ClipboardCheck size={24} />
          </div>
          <div className="page-title-text">
            <h2>Checklist de Equipos</h2>
            <span>Inspección Diaria de Perforadoras</span>
          </div>
        </div>
      </div>

      {/* Tabs Pestañas */}
      <div style={{ display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('nuevo')}
          style={{
            flex: 1, padding: '1rem', background: 'none', border: 'none',
            borderBottom: activeTab === 'nuevo' ? '4px solid #0b2b45' : '4px solid transparent',
            color: activeTab === 'nuevo' ? '#0b2b45' : '#666',
            fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
          }}
        >
          <ClipboardCheck size={20} />
          Nuevo Checklist
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          style={{
            flex: 1, padding: '1rem', background: 'none', border: 'none',
            borderBottom: activeTab === 'historial' ? '4px solid #0b2b45' : '4px solid transparent',
            color: activeTab === 'historial' ? '#0b2b45' : '#666',
            fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
          }}
        >
          <List size={20} />
          Historial y Reportes
        </button>
      </div>

      {activeTab === 'nuevo' && (
        <>
          {successMsg && (
            <div style={{ background: '#d4edda', color: '#155724', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={20} />
              {isOnline
                ? 'Checklist guardado y enviado a la nube exitosamente.'
                : 'Checklist guardado localmente (se enviará cuando haya conexión).'}
            </div>
          )}

          {/* Selector de Tipo */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <button
              onClick={() => handleTypeChange('Rotary')}
              style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: '2px solid', borderColor: type === 'Rotary' ? '#0b2b45' : '#ddd', background: type === 'Rotary' ? '#0b2b45' : 'white', color: type === 'Rotary' ? 'white' : '#333', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ROTARY
            </button>
            <button
              onClick={() => handleTypeChange('DTH')}
              style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: '2px solid', borderColor: type === 'DTH' ? '#0b2b45' : '#ddd', background: type === 'DTH' ? '#0b2b45' : 'white', color: type === 'DTH' ? 'white' : '#333', fontWeight: 'bold', cursor: 'pointer' }}
            >
              DTH
            </button>
          </div>

          {/* Cabecera del Checklist */}
          <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Fecha</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Perforadora</label>
                <select value={perforadora} onChange={e => setPerforadora(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
                  {(type === 'Rotary' ? ROTARY_DRILLS : DTH_DRILLS).map(d => (
                    <option key={d} value={d}>P{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Horómetro *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={horometro}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, '');
                    const firstSep = raw.search(/[.,]/);
                    if (firstSep !== -1) {
                      const sep = raw[firstSep];
                      const before = raw.slice(0, firstSep).replace(/[.,]/g, '');
                      const after = raw.slice(firstSep + 1).replace(/[.,]/g, '');
                      setHorometro(`${before}${sep}${after}`);
                    } else {
                      setHorometro(raw);
                    }
                  }}
                  placeholder="0.0"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Operador *</label>
                <input type="text" value={operador} onChange={e => setOperador(e.target.value)} placeholder="Nombre" style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Aceros en Equipo</label>
                <select value={cantidadAceros} onChange={e => setCantidadAceros(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>Obs. Aceros</label>
                <input type="text" value={obsAceros} onChange={e => setObsAceros(e.target.value)} placeholder="Observaciones..." style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
            </div>
          </div>

          {/* Lista de Items */}
          {type === 'Rotary' ? (
            <>
              {renderChecklist('INSTRUMENTACIÓN', ROTARY_ITEMS.INSTRUMENTACIÓN)}
              {renderChecklist('SISTEMAS', ROTARY_ITEMS.SISTEMAS)}
            </>
          ) : (
            <>
              {renderChecklist('INSTRUMENTACIÓN', DTH_ITEMS.INSTRUMENTACIÓN)}
              {renderChecklist('SISTEMAS', DTH_ITEMS.SISTEMAS)}
            </>
          )}

          {/* Sección de Fotografías / Evidencias de Inspección */}
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            padding: '1.25rem',
            marginTop: '1.5rem',
            marginBottom: '1rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  background: '#e0f2fe',
                  color: '#0284c7',
                  borderRadius: '8px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Camera size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    Fotografías / Evidencias del Equipo
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Captura o sube imágenes de condiciones, componentes o fallas detectadas
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                background: photos.length > 0 ? '#dcfce7' : '#f1f5f9',
                color: photos.length > 0 ? '#15803d' : '#64748b',
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
                border: photos.length > 0 ? '1px solid #bbf7d0' : '1px solid #e2e8f0'
              }}>
                {photos.length} {photos.length === 1 ? 'fotografía' : 'fotografías'}
              </span>
            </div>

            {/* Inputs de archivo ocultos (Cámara nativa y Galería múltiple) */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={cameraInputRef}
              style={{ display: 'none' }}
              onChange={handlePhotoInputChange}
            />
            <input
              type="file"
              accept="image/*"
              multiple
              ref={galleryInputRef}
              style={{ display: 'none' }}
              onChange={handlePhotoInputChange}
            />

            {/* Botones de acción Cámara y Galería */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={processingPhotos}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1.5px solid #0284c7',
                  background: '#f0f9ff',
                  color: '#0284c7',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: processingPhotos ? 'wait' : 'pointer',
                  boxShadow: '0 1px 2px rgba(2, 132, 199, 0.1)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Camera size={18} />
                <span>Tomar Foto (Cámara)</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={processingPhotos}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1.5px solid #64748b',
                  background: '#f8fafc',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: processingPhotos ? 'wait' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease'
                }}
              >
                <ImageIcon size={18} />
                <span>Subir de Galería</span>
              </button>
            </div>

            {/* Indicador de procesamiento y optimización */}
            {processingPhotos && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 0.9rem',
                background: '#eff6ff',
                color: '#1d4ed8',
                borderRadius: '6px',
                fontSize: '0.82rem',
                marginBottom: '1rem',
                border: '1px solid #bfdbfe'
              }}>
                <RefreshCw size={15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Comprimiendo y optimizando fotografía(s)...</span>
              </div>
            )}

            {/* Cuadrícula de fotos adjuntas */}
            {photos.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '0.75rem',
                marginTop: '0.5rem'
              }}>
                {photos.map((photo, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #cbd5e1',
                      background: '#0f172a',
                      aspectRatio: '4/3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
                    }}
                  >
                    <img
                      src={photo}
                      alt={`Evidencia ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => setPreviewPhoto(photo)}
                      title="Clic para ampliar"
                    />
                    <span style={{
                      position: 'absolute',
                      bottom: '5px',
                      left: '5px',
                      background: 'rgba(15, 23, 42, 0.78)',
                      backdropFilter: 'blur(2px)',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      Foto #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePhoto(idx);
                      }}
                      title="Eliminar foto"
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        background: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.35)'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '1.25rem',
                textAlign: 'center',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px dashed #cbd5e1',
                color: '#94a3b8',
                fontSize: '0.82rem'
              }}>
                📷 No hay fotografías adjuntas. Puedes capturar componentes críticos, desgaste o evidencias desde la cámara o galería.
              </div>
            )}
          </div>

          {/* Botón Guardar */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '1rem', background: '#0b2b45', color: 'white', border: 'none', borderRadius: '8px',
              fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', cursor: saving ? 'wait' : 'pointer', marginTop: '1rem'
            }}
          >
            <Save size={24} />
            {saving ? 'Guardando...' : 'GUARDAR CHECKLIST'}
          </button>
        </>
      )}

      {activeTab === 'historial' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Últimos Checklists</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={filterDrill}
                onChange={(e) => setFilterDrill(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="ALL">Todas las Perforadoras</option>
                <optgroup label="Rotary">
                  {ROTARY_DRILLS.map(d => <option key={d} value={d}>PE-{d}</option>)}
                </optgroup>
                <optgroup label="DTH">
                  {DTH_DRILLS.map(d => <option key={d} value={d}>PE-{d}</option>)}
                </optgroup>
              </select>
              <button
                onClick={loadHistory}
                disabled={loadingHistory}
                style={{ padding: '0.5rem', background: '#f0f2f5', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <RefreshCw size={18} className={loadingHistory ? "spin" : ""} />
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Cargando desde Google Sheets...</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>No hay registros disponibles.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Perforadora</th>
                    <th>Operador</th>
                    <th>Horómetro</th>
                    <th>Fotos</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .filter(h => filterDrill === 'ALL' || h.perforadora == filterDrill)
                    .map((item, i) => {
                      const photoCount = Array.isArray(item.photos)
                        ? item.photos.length
                        : (item.items?._photos && Array.isArray(item.items._photos) ? item.items._photos.length : 0);

                      return (
                        <tr key={i}>
                          <td>{formatDateSafe(item.date)}</td>
                          <td>{item.type}</td>
                          <td>PE-{item.perforadora}</td>
                          <td>{item.operador}</td>
                          <td>{item.horometro}</td>
                          <td>
                            {photoCount > 0 ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '2px 7px',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}>
                                <Camera size={12} />
                                {photoCount}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={() => generatePDF(item)}
                              style={{
                                background: '#0b2b45', color: 'white', border: 'none', padding: '0.4rem 0.8rem',
                                borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem'
                              }}
                            >
                              <FileText size={16} />
                              PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de previsualización ampliada de fotografía */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            boxSizing: 'border-box'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              background: '#0f172a',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              background: '#1e293b',
              color: '#f8fafc'
            }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={16} color="#38bdf8" />
                Fotografía de Inspección
              </span>
              <button
                onClick={() => setPreviewPhoto(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              maxHeight: 'calc(90vh - 60px)'
            }}>
              <img
                src={previewPhoto}
                alt="Vista previa completa"
                style={{
                  maxWidth: '100%',
                  maxHeight: 'calc(90vh - 75px)',
                  objectFit: 'contain',
                  borderRadius: '6px'
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
