// Utilidades de formateo y manejo de fechas a prueba de zona horaria (Chile UTC-3/UTC-4)

/**
 * Formatea una fecha YYYY-MM-DD a DD/MM/YYYY sin sufrir desfase horario
 * por parsing en UTC (evita que un día se muestre como el día anterior).
 */
export const formatDateSafe = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const cleanStr = String(dateStr).trim();

  // Si viene en formato ISO YYYY-MM-DD...
  const datePart = cleanStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  // Si ya tiene '/', devolver tal cual o validar
  if (cleanStr.includes('/')) {
    return cleanStr;
  }

  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return cleanStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return cleanStr;
  }
};

/**
 * Normaliza cualquier valor de fecha a formato YYYY-MM-DD para usar en <input type="date">
 */
export const toDateInputValueSafe = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') {
    const clean = val.trim();
    const datePart = clean.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return datePart;
    }
    // Si viene como DD/MM/YYYY
    const slashParts = clean.split('/');
    if (slashParts.length === 3) {
      const [d, m, y] = slashParts;
      if (y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return String(val);
  }
};
