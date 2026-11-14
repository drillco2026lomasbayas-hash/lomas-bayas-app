// Utilidades para cálculos de desgaste y estados de aceros de perforación
// Operación Lomas Bayas - ROC L8 (P8, P11, P14), PV275 (P5, P6, P7, P12, P13), MD6540 (P9, P10)

export interface ComponentMeasurements {
  pin?: number;
  centro?: number;
  box?: number;
}

export interface DrillMeasurementsData {
  date?: string;
  adaptador?: ComponentMeasurements;
  barras?: ComponentMeasurements[];
  obs?: string;
  cambios?: {
    adaptador?: { instalacion?: string; cambio?: string; metros?: string | number };
    barras?: Array<{ instalacion?: string; cambio?: string; metros?: string | number }>;
  };
  garantizados?: {
    adaptador?: number;
    barras?: number[];
  };
  promedioMetros?: number;
}

/**
 * Calcula el porcentaje de vida útil remanente (100% nueva -> 0% descarte)
 * según el modelo de perforadora y componente.
 */
export const calculatePercentage = (
  val?: number,
  drillName?: string,
  isMartilloComp: boolean = false
): number | null => {
  if (val === undefined || val === null || isNaN(val) || val <= 0 || !drillName) return null;

  // Convertir a mm si viene en pulgadas (< 50)
  let valMm = val < 50 ? val * 25.4 : val;

  let min = 0;
  let max = 0;

  if (['8', '11', '14'].includes(drillName)) {
    // DTH ROC L8
    if (isMartilloComp) {
      min = 132;
      max = 165;
    } else {
      min = 108;
      max = 114.3;
    }
  } else if (['5', '6', '7', '12', '13'].includes(drillName)) {
    // Rotary PV275 / PV275XC
    min = 194;
    max = 219;
  } else if (['9', '10'].includes(drillName)) {
    // Rotary MD6540
    min = 248;
    max = 273;
  } else {
    return null;
  }

  if (max === min) return null;
  let percentage = ((valMm - min) / (max - min)) * 100;
  if (percentage > 100) percentage = 100;
  if (percentage < 0) percentage = 0;
  return Math.round(percentage);
};

export const getPercentageColor = (percentage: number | null): string => {
  if (percentage === null) return '#e0e0e0';
  if (percentage > 66) return '#28a745';
  if (percentage >= 33) return '#ffc107';
  return '#dc3545';
};

export interface WorstWearResult {
  percentage: number | null;
  worstMm: number;
  componentName: string;
  statusText: string;
  badgeBg: string;
  badgeColor: string;
}

/**
 * Evalúa exhaustivamente TODOS los componentes de la perforadora (Adaptador/Martillo
 * y todas las barras 1 a 6 con pin, centro y box) para encontrar el peor punto de desgaste.
 */
export const getDrillWorstWear = (
  drill: string,
  data?: DrillMeasurementsData
): WorstWearResult => {
  if (!data) {
    return {
      percentage: null,
      worstMm: 0,
      componentName: '',
      statusText: 'Sin datos',
      badgeBg: '#f3f4f6',
      badgeColor: '#6b7280',
    };
  }

  const isDTHDrill = ['8', '11', '14'].includes(drill);
  const items: Array<{ p: number; mm: number; name: string }> = [];

  const check = (val: number | undefined, isMart: boolean, label: string) => {
    if (val === undefined || val === null || isNaN(val) || val <= 0) return;
    const p = calculatePercentage(val, drill, isMart);
    if (p !== null) {
      const mm = val < 50 ? val * 25.4 : val;
      items.push({ p, mm, name: label });
    }
  };

  // Adaptador / Martillo
  if (data.adaptador) {
    const compLabel = isDTHDrill ? 'Martillo' : 'Adaptador';
    check(data.adaptador.pin, isDTHDrill, `${compLabel} Pin`);
    check(data.adaptador.centro, isDTHDrill, `${compLabel} Centro`);
    check(data.adaptador.box, isDTHDrill, `${compLabel} Box`);
  }

  // Barras (hasta 6 barras en DTH, 2 en Rotary)
  if (Array.isArray(data.barras)) {
    data.barras.forEach((barra, idx) => {
      const barNum = idx + 1;
      check(barra.pin, false, `Barra ${barNum} Pin`);
      check(barra.centro, false, `Barra ${barNum} Centro`);
      check(barra.box, false, `Barra ${barNum} Box`);
    });
  }

  if (items.length === 0) {
    return {
      percentage: null,
      worstMm: 0,
      componentName: '',
      statusText: 'Sin datos',
      badgeBg: '#f3f4f6',
      badgeColor: '#6b7280',
    };
  }

  const worst = items.reduce((prev, curr) => (curr.p < prev.p ? curr : prev));

  let statusText = 'OK';
  let badgeBg = '#dcfce7';
  let badgeColor = '#15803d';

  if (worst.p < 33) {
    statusText = 'CRÍTICO';
    badgeBg = '#fee2e2';
    badgeColor = '#b91c1c';
  } else if (worst.p <= 66) {
    statusText = 'PRECAUCIÓN';
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
  }

  return {
    percentage: worst.p,
    worstMm: worst.mm,
    componentName: worst.name,
    statusText,
    badgeBg,
    badgeColor,
  };
};
