import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { X, FileText } from 'lucide-react';

interface ComponentMeasurements {
  pin?: number;
  centro?: number;
  box?: number;
}
interface ComponentChanges {
  instalacion?: string;
  cambio?: string;
  metros?: string | number;
}
export interface DrillMeasurements {
  date?: string;
  adaptador?: ComponentMeasurements;
  patera?: ComponentMeasurements;
  seguidora?: ComponentMeasurements;
  obs?: string;
  cambios?: {
    patera?: ComponentChanges;
    seguidora?: ComponentChanges;
    adaptador?: ComponentChanges;
  };
  garantizados?: { patera?: number; seguidora?: number; adaptador?: number };
  promedioMetros?: number;
}

interface DrillReportModalProps {
  drill: string;
  data: DrillMeasurements;
  onClose: () => void;
}

const DrillReportModal: React.FC<DrillReportModalProps> = ({ drill, data, onClose }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const calculatePercentage = (val?: number, drillName?: string) => {
    if (!val || !drillName) return null;
    let valMm = val;
    if (valMm < 50) valMm = valMm * 25.4;
    
    let min = 0, max = 0;
    if (['8', '11', '14'].includes(drillName)) { min = 108; max = 114.3; }
    else if (['5', '6', '7', '12', '13'].includes(drillName)) { min = 194; max = 219; }
    else if (['9', '10'].includes(drillName)) { min = 248; max = 273; }

    let percentage = ((valMm - min) / (max - min)) * 100;
    if (percentage > 100) percentage = 100;
    if (percentage < 0) percentage = 0;
    return Math.round(percentage);
  };

  const getPercentageColor = (percentage: number | null) => {
    if (percentage === null) return '#e0e0e0';
    if (percentage > 66) return '#28a745';
    if (percentage >= 33) return '#ffc107';
    return '#dc3545';
  };

  const getProjectedChangeDate = (
    measurements?: ComponentMeasurements,
    drillName?: string,
    garantizado?: number,
    promedioMetros?: number,
    medicionDateStr?: string
  ) => {
    if (!garantizado || !promedioMetros || promedioMetros <= 0 || !medicionDateStr) return null;

    const pPin = calculatePercentage(measurements?.pin, drillName);
    const pCentro = calculatePercentage(measurements?.centro, drillName);
    const pBox = calculatePercentage(measurements?.box, drillName);

    const percs = [pPin, pCentro, pBox].filter(p => p !== null) as number[];
    if (percs.length === 0) return null;

    const minPerc = Math.min(...percs);
    const remainingDays = (garantizado * (minPerc / 100)) / promedioMetros;

    const mDate = new Date(medicionDateStr);
    if (isNaN(mDate.getTime())) return null;

    mDate.setDate(mDate.getDate() + remainingDays);
    return mDate.toLocaleDateString('es-CL');
  };

  const generatePDF = async () => {
    if (!reportRef.current) return;
    try {
      setGeneratingPDF(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Reporte_Perforadora_PE${drill}.pdf`);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Hubo un error al generar el PDF.');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const CirclePercentage = ({ percentage }: { percentage: number | null }) => {
    const color = getPercentageColor(percentage);
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = percentage !== null ? circumference - (percentage / 100) * circumference : circumference;

    return (
      <div style={{ position: 'relative', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="50" height="50" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="25" cy="25" r={radius}
            fill="transparent"
            stroke="#e0e0e0"
            strokeWidth="8"
          />
          {percentage !== null && (
            <circle
              cx="25" cy="25" r={radius}
              fill="transparent"
              stroke={color}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          )}
        </svg>
        <span style={{ position: 'absolute', fontSize: '0.75rem', fontWeight: 'bold', color: '#333' }}>
          {percentage !== null ? `${percentage}%` : '-'}
        </span>
      </div>
    );
  };

  const renderComponentColumn = (title: string, imgSrc: string, measurements?: ComponentMeasurements, hasThreePoints: boolean = true) => {
    const percPin = calculatePercentage(measurements?.pin, drill);
    const percCentro = calculatePercentage(measurements?.centro, drill);
    const percBox = calculatePercentage(measurements?.box, drill);

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ background: '#0b2b45', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', marginBottom: '1rem', width: '100%', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
          {title}
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: '1rem', height: '250px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: hasThreePoints ? 'space-between' : 'center', py: '1rem' }}>
            {hasThreePoints ? (
              <>
                <CirclePercentage percentage={percPin} />
                <CirclePercentage percentage={percCentro} />
                <CirclePercentage percentage={percBox} />
              </>
            ) : (
              <CirclePercentage percentage={percCentro} />
            )}
          </div>
          <img src={imgSrc} alt={title} style={{ height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
        </div>
      </div>
    );
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-CL');
    } catch {
      return dateStr;
    }
  };

  // Determinar si el tricono es operativo
  let stateTricono = 'Sin Datos';
  const lowestAdaptadorPerc = calculatePercentage(data?.adaptador?.centro, drill);
  if (lowestAdaptadorPerc !== null) {
    if (lowestAdaptadorPerc > 33) stateTricono = 'Operativo';
    else stateTricono = 'Descarte';
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Header Modal */}
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', background: '#f8f9fa' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#333' }}>Reporte de Perforadora P{drill}</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={generatePDF}
              disabled={generatingPDF}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#dc3545', color: 'white',
                border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 'bold', cursor: generatingPDF ? 'wait' : 'pointer'
              }}
            >
              <FileText size={18} />
              {generatingPDF ? 'Generando...' : 'PDF'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Contenido del Reporte Scrollable */}
        <div style={{ overflowY: 'auto', padding: '1rem', background: '#e9ecef' }}>
          <div ref={reportRef} style={{ background: 'white', padding: '2rem', width: '210mm', minHeight: '297mm', margin: '0 auto', boxSizing: 'border-box' }}>
            
            {/* Header del Reporte */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <img src="/drillco.png" alt="Drillco" style={{ height: '40px' }} crossOrigin="anonymous" />
              <h1 style={{ color: '#0b2b45', margin: 0, fontSize: '1.5rem', textAlign: 'center' }}>CHEQUEO PERFORADORA</h1>
              <img src="/lomasbayas.png" alt="Codelco" style={{ height: '40px' }} crossOrigin="anonymous" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0b2b45', color: 'white', padding: '0.5rem', borderRadius: '4px', marginBottom: '2rem' }}>
              <div style={{ fontWeight: 'bold', paddingLeft: '0.5rem' }}>
                MEDICION DE BARRAS Y ADAPTADOR DE TRICONO<br/>
                ROTARY DRILLING TOOLS
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ background: 'white', color: 'black', padding: '0.2rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  Fecha: {formatDate(data.date)}
                </div>
                <div style={{ background: 'white', color: 'black', padding: '0.2rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  Perforadora: P{drill}
                </div>
              </div>
            </div>

            {/* Columnas Gráficas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '2rem' }}>
              {renderComponentColumn('BARRA PATERA', '/barra_rotary.png', data.patera)}
              {renderComponentColumn('BARRA SEGUIDORA', '/barra_rotary.png', data.seguidora)}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {renderComponentColumn('ADAPTADOR DE TRICONO', '/adaptador_tricono.png', data.adaptador, false)}
                <div style={{ border: '2px solid #0b2b45', borderRadius: '12px', padding: '1rem', textAlign: 'center', marginTop: '1rem' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Estado del tricono:</div>
                  <div style={{ fontWeight: 'bold', color: stateTricono === 'Operativo' ? '#0b2b45' : '#dc3545', fontSize: '1.1rem' }}>
                    {stateTricono}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabla Diámetro */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ background: '#0b2b45', color: 'white', padding: '0.4rem 1rem', borderRadius: '4px 4px 0 0', display: 'inline-block', fontWeight: 'bold' }}>
                Diámetro:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', textAlign: 'center' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #000' }}>
                    <th style={{ borderRight: '2px solid #000', padding: '0.5rem', width: '25%' }}>Medidas</th>
                    <th style={{ borderRight: '2px solid #000', padding: '0.5rem', width: '25%' }}>Barra Seguidora</th>
                    <th style={{ borderRight: '2px solid #000', padding: '0.5rem', width: '25%' }}>Barra Patera</th>
                    <th style={{ padding: '0.5rem', width: '25%' }}>Adaptador</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem', fontWeight: 'bold' }}>Pin</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.seguidora?.pin || '-'}</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.patera?.pin || '-'}</td>
                    <td style={{ padding: '0.4rem' }}>-</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem', fontWeight: 'bold' }}>Centro</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.seguidora?.centro || '-'}</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.patera?.centro || '-'}</td>
                    <td style={{ padding: '0.4rem' }}>{data.adaptador?.centro || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem', fontWeight: 'bold' }}>Box</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.seguidora?.box || '-'}</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.patera?.box || '-'}</td>
                    <td style={{ padding: '0.4rem' }}>-</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                OBS: {data.obs || 'Sin observaciones'}
              </div>
            </div>

            {/* Tabla Fechas de Cambio */}
            <div style={{ marginTop: '2rem' }}>
              <div style={{ background: '#0b2b45', color: 'white', padding: '0.4rem 1rem', borderRadius: '4px 4px 0 0', display: 'inline-block', fontWeight: 'bold' }}>
                Fechas de Cambio
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', textAlign: 'center' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #000' }}>
                    <th style={{ borderRight: '2px solid #000', padding: '0.5rem', width: '25%' }}>Aceros</th>
                    <th style={{ borderRight: '2px solid #000', padding: '0.5rem', width: '25%' }}>Metros Perforados</th>
                    <th style={{ borderRight: '2px solid #000', padding: '0.5rem', width: '25%' }}>Fecha Instalación</th>
                    <th style={{ padding: '0.5rem', width: '25%' }}>Fecha Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem', fontWeight: 'bold' }}>Barra Patera</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.cambios?.patera?.metros || 'N/A'}</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{formatDate(data.cambios?.patera?.instalacion)}</td>
                    <td style={{ padding: '0.4rem' }}>{getProjectedChangeDate(data.patera, drill, data.garantizados?.patera, data.promedioMetros, data.date) || formatDate(data.cambios?.patera?.cambio)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem', fontWeight: 'bold' }}>Barra Seguidora</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.cambios?.seguidora?.metros || 'N/A'}</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{formatDate(data.cambios?.seguidora?.instalacion)}</td>
                    <td style={{ padding: '0.4rem' }}>{getProjectedChangeDate(data.seguidora, drill, data.garantizados?.seguidora, data.promedioMetros, data.date) || formatDate(data.cambios?.seguidora?.cambio)}</td>
                  </tr>
                  <tr>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem', fontWeight: 'bold' }}>Adaptador</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{data.cambios?.adaptador?.metros || 'N/A'}</td>
                    <td style={{ borderRight: '2px solid #000', padding: '0.4rem' }}>{formatDate(data.cambios?.adaptador?.instalacion)}</td>
                    <td style={{ padding: '0.4rem' }}>{getProjectedChangeDate(data.adaptador, drill, data.garantizados?.adaptador, data.promedioMetros, data.date) || formatDate(data.cambios?.adaptador?.cambio)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Pie de informe */}
            <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', justifyContent: 'center' }}>
               <img src="/pie de informe.png" alt="Footer" style={{ width: '100%', maxWidth: '800px', objectFit: 'contain' }} crossOrigin="anonymous" />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default DrillReportModal;
