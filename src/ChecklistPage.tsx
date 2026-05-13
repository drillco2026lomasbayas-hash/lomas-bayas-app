import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, ClipboardCheck, List, FileText, RefreshCw } from 'lucide-react';
import { db } from './db';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadImageForPDF } from './App';

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

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  // Tabs y Historial
  const [activeTab, setActiveTab] = useState<'nuevo' | 'historial'>('nuevo');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterDrill, setFilterDrill] = useState('ALL');

  const loadHistory = async () => {
    if (!isOnline || !gasUrl || gasUrl.includes('TU_URL')) {
      alert("No hay conexión a internet o no se ha configurado la URL del servidor.");
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch(`${gasUrl}?action=getChecklists`);
      const json = await res.json();
      if (json.success) {
        setHistory(json.checklists || []);
      } else {
        console.error("Error del servidor:", json.error);
        alert("Error cargando historial desde el servidor.");
      }
    } catch (error) {
      console.error(error);
      alert("Fallo al conectar con Google Sheets.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'historial') {
      loadHistory();
    }
  }, [activeTab]);

  const generatePDF = async (record: any) => {
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
        new Date(record.date).toLocaleDateString(),
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
                <input type="number" value={horometro} onChange={e => setHorometro(e.target.value)} placeholder="0.0" style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
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
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .filter(h => filterDrill === 'ALL' || h.perforadora == filterDrill)
                    .map((item, i) => (
                      <tr key={i}>
                        <td>{new Date(item.date).toLocaleDateString()}</td>
                        <td>{item.type}</td>
                        <td>PE-{item.perforadora}</td>
                        <td>{item.operador}</td>
                        <td>{item.horometro}</td>
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
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
