import React from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';

interface InventoryPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  fileName: string;
  onDownload: () => void;
}

export const InventoryPdfModal: React.FC<InventoryPdfModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  fileName,
  onDownload,
}) => {
  if (!isOpen || !pdfUrl) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '0.75rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '920px',
        height: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* Barra Superior */}
        <div style={{
          padding: '0.85rem 1.25rem',
          background: '#0b2b45',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid #0284c7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#38bdf8" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '0.2px' }}>
                Previsualización de Reporte de Inventario
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {fileName}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                textDecoration: 'none',
                fontWeight: 600,
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Abrir en pestaña nueva"
            >
              <ExternalLink size={14} />
              <span className="hide-on-mobile">Visor</span>
            </a>

            <button
              onClick={onDownload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#16a34a',
                color: '#ffffff',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
              }}
            >
              <Download size={16} />
              <span>Descargar PDF</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px'
              }}
              title="Cerrar"
            >
              <X size={22} color="#ffffff" />
            </button>
          </div>
        </div>

        {/* Visor PDF (iframe con blobUrl) */}
        <div style={{
          flex: 1,
          backgroundColor: '#525659',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <iframe
            src={`${pdfUrl}#toolbar=1&navpanes=0`}
            title="Previsualización PDF"
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
          />
        </div>

        {/* Barra Inferior */}
        <div style={{
          padding: '0.6rem 1.25rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Revise los datos antes de exportar el documento oficial.
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
                gap: '5px'
              }}
            >
              <Download size={14} />
              Confirmar y Descargar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
