import React, { useState } from 'react';
import { X, Download, ExternalLink, FileText, Smartphone, Monitor, AlertTriangle, CheckCircle } from 'lucide-react';
import { INVENTORY_CATEGORIES, type InventorySubModel } from './inventoryData';

interface InventoryPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  fileName: string;
  onDownload: () => void;
  reportDate?: string;
  inventoryData?: Record<string, number>;
  inventoryObs?: Record<string, string>;
  subModelsData?: Record<string, InventorySubModel[]>;
  minStocksData?: Record<string, number>;
}

export const InventoryPdfModal: React.FC<InventoryPdfModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  fileName,
  onDownload,
  reportDate,
  inventoryData = {},
  inventoryObs = {},
  subModelsData = {},
  minStocksData = {},
}) => {
  const isMobileInitial = typeof window !== 'undefined'
    ? (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768)
    : false;

  const [viewMode, setViewMode] = useState<'document' | 'pdf'>(isMobileInitial ? 'document' : 'pdf');

  if (!isOpen || !pdfUrl) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '0.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1000px',
        height: '94vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* Barra Superior */}
        <div style={{
          padding: '0.75rem 1rem',
          background: '#0b2b45',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '2px solid #0284c7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <FileText size={20} color="#38bdf8" />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Previsualización de Reporte de Inventario
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {fileName}
              </span>
            </div>
          </div>

          {/* Selector de Modo: Vista Documento (Mobile Friendly) vs Visor PDF */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: '2px',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <button
                type="button"
                onClick={() => setViewMode('document')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: viewMode === 'document' ? '#0284c7' : 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Vista interactiva compatible con celulares y tablets"
              >
                <Smartphone size={13} />
                <span>Vista Documento</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('pdf')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: viewMode === 'pdf' ? '#0284c7' : 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Visor PDF integrado para computadores"
              >
                <Monitor size={13} />
                <span>Visor PDF</span>
              </button>
            </div>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#e2e8f0',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.73rem',
                textDecoration: 'none',
                fontWeight: 600,
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Abrir en visor nativo o pestaña externa"
            >
              <ExternalLink size={13} />
              <span>Abrir</span>
            </a>

            <button
              onClick={onDownload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#16a34a',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
              }}
            >
              <Download size={14} />
              <span>Descargar</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px'
              }}
              title="Cerrar"
            >
              <X size={20} color="#ffffff" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Modal */}
        <div style={{
          flex: 1,
          backgroundColor: viewMode === 'pdf' ? '#525659' : '#f1f5f9',
          position: 'relative',
          overflowY: 'auto',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}>
          {viewMode === 'document' ? (
            /* ============================================================== */
            /* VISTA DOCUMENTO (Alta fidelidad, 100% compatible con móviles) */
            /* ============================================================== */
            <div style={{
              maxWidth: '960px',
              margin: '1rem auto',
              background: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}>
              {/* Encabezado del Documento */}
              <div style={{
                background: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
                color: '#ffffff',
                padding: '1.25rem 1.5rem',
                borderBottom: '3px solid #007aff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <img
                  src="/drillco.png"
                  alt="Drillco"
                  style={{ height: '36px', objectFit: 'contain' }}
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <div style={{ textAlign: 'center', flex: 1, minWidth: '220px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.5px' }}>
                    REPORTE OFICIAL DE INVENTARIO
                  </h2>
                  <div style={{ fontSize: '0.82rem', color: '#93c5fd', marginTop: '2px', fontWeight: 600 }}>
                    Área Técnica • Faena Lomas Bayas
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '4px' }}>
                    Fecha registro: <strong>{reportDate || 'Actual'}</strong> • Generado: {new Date().toLocaleDateString('es-CL')}
                  </div>
                </div>
                <img
                  src="/lomasbayas.png"
                  alt="Lomas Bayas"
                  style={{ height: '36px', objectFit: 'contain' }}
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>

              {/* Tabla del Inventario con todas las columnas */}
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.78rem',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <thead>
                    <tr style={{ background: '#0284c7', color: '#ffffff', textAlign: 'center' }}>
                      <th style={{ padding: '8px 10px', border: '1px solid #0369a1', textAlign: 'left', minWidth: '130px' }}>Categoría</th>
                      <th style={{ padding: '8px 10px', border: '1px solid #0369a1', textAlign: 'left', minWidth: '220px' }}>Item / Modelo</th>
                      <th style={{ padding: '8px 8px', border: '1px solid #0369a1', minWidth: '85px' }}>N° SAP</th>
                      <th style={{ padding: '8px 8px', border: '1px solid #0369a1', minWidth: '75px' }}>Bod. Central</th>
                      <th style={{ padding: '8px 8px', border: '1px solid #0369a1', minWidth: '75px' }}>Bod. Mina</th>
                      <th style={{ padding: '8px 8px', border: '1px solid #0369a1', minWidth: '75px', background: '#0369a1' }}>Dif. Mina</th>
                      <th style={{ padding: '8px 8px', border: '1px solid #0369a1', minWidth: '70px', background: '#075985' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INVENTORY_CATEGORIES.map((cat) => {
                      return cat.items.map((item, itemIdx) => {
                        const centralKey = `${item.key}_central`;
                        const minaKey = `${item.key}_mina`;
                        const centralVal = inventoryData[centralKey] || 0;
                        const minaVal = inventoryData[minaKey] || 0;
                        const total = centralVal + minaVal;
                        const models = subModelsData[item.key] || [];
                        const hasModels = models.length > 0;
                        const itemMinStock = minStocksData[item.key] !== undefined ? minStocksData[item.key] : item.minStock;
                        const hasMinStock = itemMinStock !== undefined && itemMinStock !== null;
                        const diffMina = hasMinStock ? minaVal - itemMinStock : null;

                        const rowBg = hasModels ? '#fffbeb' : itemIdx % 2 === 0 ? '#ffffff' : '#f8fafc';

                        return (
                          <React.Fragment key={item.key}>
                            {/* Fila del Ítem Madre */}
                            <tr style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                              {itemIdx === 0 ? (
                                <td
                                  rowSpan={cat.items.reduce((acc, curr) => acc + 1 + (subModelsData[curr.key]?.length || 0), 0)}
                                  style={{
                                    padding: '8px 10px',
                                    fontWeight: 800,
                                    color: '#0f172a',
                                    verticalAlign: 'top',
                                    background: '#f1f5f9',
                                    borderRight: '1px solid #cbd5e1',
                                    fontSize: '0.78rem'
                                  }}
                                >
                                  {cat.name}
                                </td>
                              ) : null}
                              <td style={{ padding: '8px 10px', fontWeight: hasModels ? 800 : 600, color: '#1e293b' }}>
                                {item.name}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                                {item.sap}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: hasModels ? 800 : 600 }}>
                                {centralVal}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: hasModels ? 800 : 600, color: '#047857' }}>
                                {minaVal}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {diffMina !== null ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    background: diffMina >= 0 ? '#d1fae5' : '#fee2e2',
                                    color: diffMina >= 0 ? '#065f46' : '#991b1b',
                                    border: `1px solid ${diffMina >= 0 ? '#a7f3d0' : '#fecaca'}`
                                  }}>
                                    {diffMina >= 0 ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                                    {diffMina > 0 ? `+${diffMina}` : diffMina}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                                {total}
                              </td>
                            </tr>

                            {/* Desglose de Submodelos */}
                            {hasModels && models.map((m) => {
                              const mCentral = m.central || 0;
                              const mMina = m.mina || 0;
                              const mTotal = mCentral + mMina;

                              return (
                                <tr key={m.id} style={{ background: '#fefce8', borderBottom: '1px dashed #fef08a', fontSize: '0.74rem' }}>
                                  <td style={{ padding: '5px 10px 5px 22px', color: '#475569' }}>
                                    ↳ {m.name} {m.brand ? `(${m.brand})` : ''}
                                  </td>
                                  <td style={{ padding: '5px', textAlign: 'center', color: '#64748b' }}>
                                    {item.sap}
                                  </td>
                                  <td style={{ padding: '5px', textAlign: 'center', color: '#334155' }}>
                                    {mCentral}
                                  </td>
                                  <td style={{ padding: '5px', textAlign: 'center', color: '#047857' }}>
                                    {mMina}
                                  </td>
                                  <td style={{ padding: '5px', textAlign: 'center', color: '#94a3b8' }}>
                                    —
                                  </td>
                                  <td style={{ padding: '5px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                                    {mTotal}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sección de Observaciones si existen */}
              {Object.keys(inventoryObs).length > 0 && (
                <div style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#0f172a', fontWeight: 700 }}>
                    Observaciones registradas:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem', fontSize: '0.74rem' }}>
                    {Object.entries(inventoryObs).map(([key, obs]) => {
                      if (!obs) return null;
                      return (
                        <div key={key} style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                          <strong style={{ color: '#0369a1' }}>{key}:</strong> {obs}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* VISOR PDF (iframe estándar con aviso para celulares)          */
            /* ============================================================== */
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Aviso si se visualiza en celular */}
              <div style={{
                background: '#fef3c7',
                color: '#92400e',
                padding: '0.5rem 1rem',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                borderBottom: '1px solid #fde68a'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={15} />
                  <span>¿Tu teléfono no muestra el visor integrado? Usa la pestaña <strong>Vista Documento</strong> o pulsa aquí:</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(pdfUrl, '_blank')}
                  style={{
                    background: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '3px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Abrir visor externo
                </button>
              </div>

              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0`}
                title="Previsualización PDF"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  flex: 1
                }}
              />
            </div>
          )}
        </div>

        {/* Barra Inferior */}
        <div style={{
          padding: '0.65rem 1.25rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
            Revise los datos antes de exportar o descargar el documento oficial.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cerrar
            </button>
            <button
              onClick={onDownload}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#0b2b45',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <Download size={14} />
              Confirmar y Descargar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
