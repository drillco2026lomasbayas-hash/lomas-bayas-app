import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Image as ImageIcon,
  History,
  Plus,
  Pencil,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { db, type WellRecord, type ShiftReport, type SteelChange, type SteelMeasurement, type Event, type InventoryRecord, type SteelDiscard, type DrillStatusRecord } from './db';
import { INVENTORY_CATEGORIES, createEmptyInventory, DEFAULT_MIN_STOCKS, type InventorySubModel } from './inventoryData';
import './index.css';
import DrillReportModal from './DrillReportModal';
import { ChecklistPage } from './ChecklistPage';
import { SyncStatusBar } from './SyncStatusBar';
import { syncEngine } from './syncEngine';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { LoginView } from './LoginView';
import { AdminPanel } from './AdminPanel';
import { RecentRecordsModal } from './RecentRecordsModal';
import { InventoryPdfModal } from './InventoryPdfModal';
import { InventoryModelModal } from './InventoryModelModal';
import { getDrillWorstWear } from './utils/steelUtils';
import { formatDateSafe } from './utils/dateUtils';

// Utilidad para comprimir imágenes y reducir su peso a ~1MB o menos
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 1280;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(event.target?.result as string);
        
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};


// Sanitiza el texto mientras se escribe: permite solo dígitos y un único separador (punto o coma)
const cleanDecimalInput = (raw: string): string => {
  if (!raw) return '';
  // Elimina caracteres que no sean dígitos, punto o coma
  let s = raw.replace(/[^0-9.,]/g, '');
  // Encuentra la primera coma o punto
  const firstSepIdx = s.search(/[.,]/);
  if (firstSepIdx !== -1) {
    const sepChar = s[firstSepIdx];
    const before = s.slice(0, firstSepIdx).replace(/[.,]/g, '');
    const after = s.slice(firstSepIdx + 1).replace(/[.,]/g, '');
    return `${before}${sepChar}${after}`;
  }
  return s;
};

// Permite dígitos, punto, coma, barra '/' y espacios para ingresar medidas en decimales o fracciones (ej: "8 5/8", "4.25")
const cleanMeasurementInput = (raw: string): string => {
  if (!raw) return '';
  return raw.replace(/[^0-9.,/ -]/g, '');
};

// Parsea tanto números decimales (con coma o punto) como fracciones compuestas o simples (ej: "8 5/8" -> 8.625, "10 3/4" -> 10.75)
export const parseMeasurementInput = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let s = String(val).trim().replace(',', '.');

  // Fracciones compuestas: ej. "8 5/8", "8-5/8", "8 + 5/8"
  const compMatch = s.match(/^(\d+)\s*[-+ ]\s*(\d+)\/(\d+)$/);
  if (compMatch) {
    const whole = parseFloat(compMatch[1]);
    const num = parseFloat(compMatch[2]);
    const den = parseFloat(compMatch[3]);
    if (den !== 0) return whole + (num / den);
  }

  // Fracción simple: ej. "5/8", "1/2"
  const simpleMatch = s.match(/^(\d+)\/(\d+)$/);
  if (simpleMatch) {
    const num = parseFloat(simpleMatch[1]);
    const den = parseFloat(simpleMatch[2]);
    if (den !== 0) return num / den;
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
};

// Estructura de detección automática de unidades
export interface MeasurementDetection {
  originalValue: number;
  unit: 'pulgadas' | 'mm' | 'vacio';
  valMm: number;
  valInches: number;
  labelMm: string;
  labelInches: string;
  inRange: boolean;
  expectedMinMm: number;
  expectedMaxMm: number;
  expectedMinInches: string;
  expectedMaxInches: string;
}

// Detección automática si la medida fue ingresada en mm o pulgadas según rangos nominales de la perforadora y componente
export const detectMeasurementUnit = (
  rawVal: string | number | undefined | null,
  drillNumber?: string,
  isMartilloOrAdaptador: boolean = false
): MeasurementDetection => {
  const val = parseMeasurementInput(rawVal);
  if (!val || val <= 0) {
    return {
      originalValue: 0,
      unit: 'vacio',
      valMm: 0,
      valInches: 0,
      labelMm: '',
      labelInches: '',
      inRange: true,
      expectedMinMm: 0,
      expectedMaxMm: 0,
      expectedMinInches: '',
      expectedMaxInches: ''
    };
  }

  // Rangos nominales esperados según la perforadora y componente
  let minMm = 108;
  let maxMm = 114.3;
  let minInchesStr = '4 1/4"';
  let maxInchesStr = '4 1/2"';

  const isDTH = ['8', '11', '14'].includes(drillNumber || '');
  const isPV275 = ['5', '6', '7', '12', '13'].includes(drillNumber || '');
  const isMD6540 = ['9', '10'].includes(drillNumber || '');

  if (isDTH) {
    if (isMartilloOrAdaptador) {
      minMm = 132;
      maxMm = 165;
      minInchesStr = '5 1/5"';
      maxInchesStr = '6 1/8"';
    } else {
      minMm = 108;
      maxMm = 114.3;
      minInchesStr = '4 1/4"';
      maxInchesStr = '4 1/2"';
    }
  } else if (isPV275) {
    minMm = 194;
    maxMm = 219;
    minInchesStr = '7 5/8"';
    maxInchesStr = '8 5/8"';
  } else if (isMD6540) {
    minMm = 248;
    maxMm = 273;
    minInchesStr = '9 3/4"';
    maxInchesStr = '10 3/4"';
  }

  // Detección automática: valores menores a 50 son en pulgadas, mayores o iguales a 50 son en milímetros
  const isPulgadas = val < 50;
  const valMm = isPulgadas ? Number((val * 25.4).toFixed(1)) : val;
  const valInches = isPulgadas ? val : Number((val / 25.4).toFixed(3));

  // Tolerancia operativa para advertir valores atípicos
  const inRange = valMm >= (minMm * 0.82) && valMm <= (maxMm * 1.08);

  return {
    originalValue: val,
    unit: isPulgadas ? 'pulgadas' : 'mm',
    valMm,
    valInches,
    labelMm: `${valMm.toFixed(1)} mm`,
    labelInches: `${valInches.toFixed(3)}"`,
    inRange,
    expectedMinMm: minMm,
    expectedMaxMm: maxMm,
    expectedMinInches: minInchesStr,
    expectedMaxInches: maxInchesStr
  };
};

// Convierte automáticamente cualquier medida (mm o pulgadas) a milímetros unificados
export const normalizeMeasurementToMm = (
  rawVal: string | number | undefined | null,
  drillNumber?: string,
  isMartilloOrAdaptador: boolean = false
): number => {
  const detected = detectMeasurementUnit(rawVal, drillNumber, isMartilloOrAdaptador);
  return detected.valMm;
};

// Componente badge visual para indicar la unidad detectada y su conversión en tiempo real
const MeasurementBadge: React.FC<{
  value: string | number | undefined | null;
  drillNumber?: string;
  isMartilloOrAdaptador?: boolean;
}> = ({ value, drillNumber, isMartilloOrAdaptador }) => {
  const det = detectMeasurementUnit(value, drillNumber, isMartilloOrAdaptador);
  if (det.unit === 'vacio') return null;

  if (!det.inRange) {
    return (
      <div style={{
        marginTop: '0.25rem',
        padding: '0.2rem 0.45rem',
        borderRadius: '4px',
        backgroundColor: '#fef3c7',
        border: '1px solid #fde68a',
        color: '#92400e',
        fontSize: '0.7rem',
        lineHeight: 1.3
      }}>
        ⚠️ <strong>{det.unit === 'pulgadas' ? `${det.valInches}"` : `${det.valMm} mm`}</strong> ({det.unit === 'pulgadas' ? `${det.valMm} mm` : `${det.valInches}"`}) — Fuera de rango esperado ({det.expectedMinInches} a {det.expectedMaxInches} / {det.expectedMinMm} a {det.expectedMaxMm} mm)
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '0.25rem',
      padding: '0.2rem 0.45rem',
      borderRadius: '4px',
      backgroundColor: det.unit === 'pulgadas' ? '#eff6ff' : '#f0fdf4',
      border: `1px solid ${det.unit === 'pulgadas' ? '#bfdbfe' : '#bbf7d0'}`,
      color: det.unit === 'pulgadas' ? '#1e40af' : '#166534',
      fontSize: '0.72rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.3rem',
      fontWeight: 600
    }}>
      <span>{det.unit === 'pulgadas' ? '📏 Pulgadas:' : '📐 Milímetros:'}</span>
      <strong>{det.unit === 'pulgadas' ? `${det.valInches}"` : `${det.valMm} mm`}</strong>
      <span style={{ color: '#64748b', fontWeight: 400 }}>➜</span>
      <span style={{ fontWeight: 700 }}>{det.unit === 'pulgadas' ? `${det.valMm} mm` : `${det.valInches}"`}</span>
    </div>
  );
};

// Convierte cualquier valor a número (soportando coma o punto)
const parseDecimal = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const normalized = String(val).trim().replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};

// Utilidad para cargar una imagen desde public/ como Base64 para usarla en jsPDF
export const loadImageForPDF = async (url: string): Promise<{ data: string, width: number, height: number } | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ data: dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch (error) {
    console.error('Error cargando imagen para PDF:', error);
    return null;
  }
};

const lastSavedDrafts: Record<string, string> = {};

export type PageType = 'inicio' | 'reporte' | 'cambioAceros' | 'medicionAceros' | 'eventos' | 'nuevoEvento' | 'analista' | 'inventario' | 'tecnico' | 'descarteAceros' | 'controlDiametros' | 'checklist' | 'admin' | 'estadoPerforadoras';

const App: React.FC = () => {
  // CONFIGURACIÓN: Pega aquí la URL de tu implementación de Google Apps Script
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyJ4sVXk3Y5geSSvvuRkIQe-AOlyrsFEvxQnwOr2zbAFI7US65O1LKvs1ZlGk9Fpgvy/exec';

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wells, setWells] = useState<WellRecord[]>(() => {
    const saved = localStorage.getItem('draft_wells');
    return saved ? JSON.parse(saved) : [];
  });
  const [pendingCount, setPendingCount] = useState(0);
  const { profile, loading: authLoading } = useAuth();

  const [currentPage, _setCurrentPage] = useState<PageType>('inicio');
  const [showExitToast, setShowExitToast] = useState(false);

  // Referencias para que el listener de popstate (botón atrás del móvil) tenga valores actuales
  const currentPageRef = useRef<PageType>(currentPage);
  currentPageRef.current = currentPage;

  const [selectedDrillForReport, setSelectedDrillForReport] = useState<string | null>(null);
  const selectedDrillForReportRef = useRef<string | null>(selectedDrillForReport);
  selectedDrillForReportRef.current = selectedDrillForReport;

  const lastBackPressRef = useRef<number>(0);

  // Navegación con pushState para registrar cada pantalla en el historial del navegador
  const setCurrentPage = useCallback((targetPage: PageType | ((prev: PageType) => PageType)) => {
    _setCurrentPage(prev => {
      const nextPage = typeof targetPage === 'function' ? targetPage(prev) : targetPage;
      if (nextPage !== prev) {
        window.history.pushState({ page: nextPage }, '', '');
      }
      return nextPage;
    });
  }, []);

  // Configuración de Perforadoras y Modelos
  const DRILL_CONFIG: Record<string, { model: string; defaultPhase?: string }> = {
    '5': { model: 'PV275' },
    '6': { model: 'PV275' },
    '7': { model: 'PV275' },
    '8': { model: 'ROC L8' },
    '9': { model: 'MD6540' },
    '10': { model: 'MD6540' },
    '11': { model: 'ROC L8' },
    '12': { model: 'PV275XC' },
    '13': { model: 'PV275XC' },
    '14': { model: 'ROC L8' },
  };

  const [drillStatuses, setDrillStatuses] = useState<Record<string, DrillStatusRecord>>({});
  const [savingDrillStatuses, setSavingDrillStatuses] = useState(false);
  const [drillStatusesSavedSuccess, setDrillStatusesSavedSuccess] = useState(false);

  // Estado para Control de Diámetros (persistido localmente para funcionamiento offline)
  type ComponentMeasurements = { pin?: number; centro?: number; box?: number };
  type ComponentChanges = { instalacion?: string; cambio?: string; metros?: string | number };
  type DrillMeasurements = {
    date?: string;
    adaptador?: ComponentMeasurements;
    barras?: ComponentMeasurements[];
    obs?: string;
    cambios?: { barras?: ComponentChanges[]; adaptador?: ComponentChanges };
    garantizados?: { barras?: number[]; adaptador?: number };
    promedioMetros?: number;
  };
  const [diametersData, setDiametersData] = useState<Record<string, DrillMeasurements>>(() => {
    try {
      const cached = localStorage.getItem('lomasbayas_cached_diametersData');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [loadingDiameters, setLoadingDiameters] = useState(false);

  // Estado para Reporte General
  const [saveOperatorName, setSaveOperatorName] = useState(() => {
    return localStorage.getItem('save_operator_name') === 'true';
  });
  const [isTotalReport, setIsTotalReport] = useState(false);
  const [showRecentHistoryModal, setShowRecentHistoryModal] = useState(false);

  const [reportData, setReportData] = useState(() => {
    const saved = localStorage.getItem('draft_reportData');
    if (saved) return JSON.parse(saved);
    const savedOp = localStorage.getItem('saved_operator_name') || '';
    return {
      date: new Date().toISOString().split('T')[0],
      shift: 'TURNO A',
      drillNumber: '',
      operator: savedOp,
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
      barraSeguidora5Inferior: 0,
      comentarios: ''
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
  const [subModelsData, setSubModelsData] = useState<Record<string, InventorySubModel[]>>(() => {
    try {
      // Limpiar versiones anteriores de ejemplos hardcodeados si existen
      if (!localStorage.getItem('lomasbayas_legacy_models_cleaned_v4')) {
        localStorage.removeItem('lomasbayas_cached_inventory');
        localStorage.removeItem('lomasbayas_inventory_submodels');
        localStorage.removeItem('lomasbayas_configured_submodels');
        localStorage.setItem('lomasbayas_legacy_models_cleaned_v4', 'true');
        return {};
      }
      const saved = localStorage.getItem('lomasbayas_configured_submodels');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return {};
  });

  const [minStocksData, setMinStocksData] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('lomasbayas_inventory_min_stocks');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return { ...DEFAULT_MIN_STOCKS };
  });

  const [minStockModalData, setMinStockModalData] = useState<{
    isOpen: boolean;
    itemKey: string;
    itemName: string;
    currentMin: number;
  }>({
    isOpen: false,
    itemKey: '',
    itemName: '',
    currentMin: 0
  });

  const [collapsedModelGroups, setCollapsedModelGroups] = useState<Record<string, boolean>>({});
  const [modelModalData, setModelModalData] = useState<{
    isOpen: boolean;
    itemKey: string;
    itemName: string;
    itemSap?: string;
    model: InventorySubModel | null;
  }>({
    isOpen: false,
    itemKey: '',
    itemName: '',
    itemSap: '',
    model: null
  });
  const [pdfPreviewModal, setPdfPreviewModal] = useState<{
    isOpen: boolean;
    url: string | null;
    fileName: string;
    doc: any | null;
  }>({
    isOpen: false,
    url: null,
    fileName: '',
    doc: null
  });
  const [inventoryObs, setInventoryObs] = useState<Record<string, string>>({});
  const [openSnRow, setOpenSnRow] = useState<string | null>(null);
  const [inventoryDate, setInventoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [lastInventoryDate, setLastInventoryDate] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Estado para modal de confirmación de eliminación
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const eventToDeleteRef = useRef<Event | null>(eventToDelete);
  eventToDeleteRef.current = eventToDelete;

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

  const safeSaveDraft = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn(`No se pudo guardar borrador ${key} en localStorage:`, e);
    }
  };

  useEffect(() => { safeSaveDraft('draft_reportData', reportData); }, [reportData]);
  useEffect(() => { safeSaveDraft('draft_wells', wells); }, [wells]);
  useEffect(() => { safeSaveDraft('draft_steelChangeData', steelChangeData); }, [steelChangeData]);
  useEffect(() => { safeSaveDraft('draft_steelMeasurementData', steelMeasurementData); }, [steelMeasurementData]);
  useEffect(() => { safeSaveDraft('draft_newEventData', newEventData); }, [newEventData]);
  useEffect(() => { safeSaveDraft('draft_discardData', discardData); }, [discardData]);

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

  // Helper: calcula el total de registros pendientes de sincronización
  const getTotalPendingCount = async () => {
    return await db.reports.where('synced').equals(0).count() +
      await db.steelChanges.where('synced').equals(0).count() +
      await db.steelMeasurements.where('synced').equals(0).count() +
      await db.events.where('synced').equals(0).count() +
      await db.inventoryRecords.where('synced').equals(0).count() +
      await db.steelDiscards.where('synced').equals(0).count() +
      await db.checklists.where('synced').equals(0).count() +
      await db.drillStatuses.where('synced').equals(0).count();
  };

  // Manejo del botón atrás del navegador y móvil (Android/PWA)
  useEffect(() => {
    // 1. Inicializar estado base
    window.history.replaceState({ page: 'inicio' }, '', '');
    // 2. Insertar un estado base para interceptar el botón atrás en 'inicio' y evitar cierre accidental
    window.history.pushState({ page: 'inicio' }, '', '');

    const handlePopState = () => {
      // 1. Si hay modal de reporte de perforadora abierto, cerrarlo
      if (selectedDrillForReportRef.current) {
        setSelectedDrillForReport(null);
        window.history.pushState({ page: currentPageRef.current }, '', '');
        return;
      }

      // 2. Si hay modal de confirmación de eliminación abierto, cerrarlo
      if (eventToDeleteRef.current) {
        setEventToDelete(null);
        window.history.pushState({ page: currentPageRef.current }, '', '');
        return;
      }

      // 3. Si estamos en cualquier página distinta a 'inicio', volver a la página principal 'inicio'
      if (currentPageRef.current !== 'inicio') {
        _setCurrentPage('inicio');
        return;
      }

      // 4. Si ya estamos en 'inicio': prevenir cierre por error. Requiere pulsar atrás 2 veces en 2 segundos para salir.
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        window.history.back();
      } else {
        lastBackPressRef.current = now;
        window.history.pushState({ page: 'inicio' }, '', '');
        setShowExitToast(true);
        setTimeout(() => setShowExitToast(false), 2000);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Cargar cantidad de registros pendientes y configurar listeners de conexión
  useEffect(() => {
    const updatePendingCount = async () => {
      const count = await getTotalPendingCount();
      setPendingCount(count);
    };

    const handleOnline = () => {
      setIsOnline(true);
      // Intentar sincronizar automáticamente al recuperar conexión
      syncData().then(updatePendingCount);
      syncPendingDeletions(); // Sincronizar eliminaciones pendientes
      if (currentPageRef.current === 'inicio' || currentPageRef.current === 'controlDiametros') {
        downloadSteelMeasurementsFromSheet();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cargar conteo inicial y sincronizar SOLO si hay conexión
    updatePendingCount();
    if (navigator.onLine) {
      syncData().then(updatePendingCount);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar estados de perforadoras desde IndexedDB
  const loadDrillStatuses = async () => {
    try {
      const records = await db.drillStatuses.toArray();
      const statusMap: Record<string, DrillStatusRecord> = {};
      records.forEach(r => {
        statusMap[r.drillNumber] = r;
      });
      setDrillStatuses(statusMap);
    } catch (err) {
      console.error('Error cargando estados de perforadoras:', err);
    }
  };

  // Cargar datos cuando se cambia de página (en modo offline solo usa datos locales)
  useEffect(() => {
    if (currentPage === 'inicio' || currentPage === 'estadoPerforadoras') {
      loadDrillStatuses();
      if (navigator.onLine) {
        downloadSteelMeasurementsFromSheet();
      }
    } else if (currentPage === 'inventario') {
      loadLastInventory();
    } else if (currentPage === 'eventos') {
      loadOpenEvents();
    } else if (currentPage === 'controlDiametros') {
      if (navigator.onLine) {
        downloadSteelMeasurementsFromSheet();
      }
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

  const totalMeters = wells.reduce((sum, item) => sum + (item.type === 'well' ? parseDecimal(item.meters) : 0), 0);
  const totalDelays = wells.reduce((sum, item) => sum + (item.type === 'delay' ? (item.timeMin || 0) : 0), 0);

  const handleSave = async () => {
    try {
      const recordToSave: Omit<ShiftReport, 'id'> = {
        ...reportData,
        wells: wells.map(w => ({
          ...w,
          meters: w.type === 'well' ? parseDecimal(w.meters) : 0,
        })),
        synced: 0,
        syncedGas: 0,
        syncedSupabase: 0,
        createdAt: Date.now()
      };

      const reportStr = JSON.stringify(recordToSave);
      if (lastSavedDrafts['draft_wells'] === reportStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }

      let gasSuccess = false;
      const btn = document.querySelector('.btn-save');
      const originalText = btn?.textContent || 'GUARDAR';

      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          const fd = new FormData();
          fd.append('payload', reportStr);
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) gasSuccess = true;
        } catch (e) { console.error('Error enviando a la nube (GAS):', e); }
      }

      recordToSave.syncedGas = gasSuccess ? 1 : 0;
      recordToSave.syncedSupabase = 0;
      recordToSave.synced = 0;
      await db.reports.add(recordToSave as ShiftReport);

      if (isOnline) {
        try {
          await syncEngine.syncAll();
        } catch (e) {
          console.warn('Error sincronizando con Supabase:', e);
        }
      }

      setPendingCount(await getTotalPendingCount());

      if (saveOperatorName && reportData.operator) {
        localStorage.setItem('saved_operator_name', reportData.operator);
      }

      const syncSuccess = gasSuccess || isOnline;
      if (syncSuccess) {
        setWells([]);
        localStorage.removeItem('draft_wells');
        lastSavedDrafts['draft_wells'] = '';

        setReportData({
          date: new Date().toISOString().split('T')[0],
          shift: 'TURNO A',
          drillNumber: '',
          operator: saveOperatorName ? reportData.operator : '',
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
    console.log('Iniciando sincronización completa...');
    
    // 1. Sincronizar con Supabase
    if (navigator.onLine) {
      try {
        await syncEngine.syncAll();
      } catch (err) {
        console.warn('Error sincronizando con Supabase:', err);
      }
    }

    if (!GAS_URL || GAS_URL.includes('TU_URL_DE_APPS_SCRIPT_AQUI')) {
      console.warn('Sincronización cancelada: GAS_URL no configurada.');
      return;
    }

    // 2. Helper para sincronizar registros pendientes hacia Google Sheets
    const syncTable = async (table: typeof db.reports | typeof db.steelChanges | typeof db.steelMeasurements | typeof db.events | typeof db.inventoryRecords | typeof db.steelDiscards | typeof db.checklists, fieldName: string) => {
      const unsynced = await (table as any).filter((r: any) => r.syncedGas !== 1).toArray();
      if (unsynced.length === 0) return;
      console.log(`${fieldName}: ${unsynced.length} pendiente(s) hacia GAS`);

      for (const record of unsynced) {
        try {
          const fd = new FormData();
          fd.append(fieldName, JSON.stringify(record));
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) {
            const isSupabaseDone = record.syncedSupabase === 1;
            await (table as any).update(record.id!, {
              syncedGas: 1,
              synced: isSupabaseDone ? 1 : 0
            });
            console.log(`${fieldName} sincronizado a GAS:`, record.id);
          }
        } catch (error) {
          console.error(`Error sincronizando ${fieldName} a GAS:`, record.id, error);
        }
      }
    };

    // Sincronizar todas las tablas
    await syncTable(db.reports, 'payload');
    await syncTable(db.steelChanges, 'steelChange');
    await syncTable(db.steelMeasurements, 'steelMeasurement');
    await syncTable(db.events, 'event');
    await syncTable(db.inventoryRecords, 'inventoryRecord');
    await syncTable(db.steelDiscards, 'steelDiscard');
    await syncTable(db.checklists, 'checklist');
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
      const originalText = btn?.textContent || 'GUARDAR';

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

      record.syncedGas = syncSuccess ? 1 : 0;
      record.syncedSupabase = 0;
      record.synced = 0;
      await db.steelChanges.add(record as SteelChange);

      if (isOnline) {
        try {
          await syncEngine.syncAll();
        } catch (e) {
          console.warn('Error sincronizando con Supabase:', e);
        }
      }

      setPendingCount(await getTotalPendingCount());

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

  // Guardar Medición de Aceros (convirtiendo automáticamente a mm si se ingresó en pulgadas)
  const handleSaveSteelMeasurement = async () => {
    try {
      const drill = steelMeasurementData.drillNumber;

      // Validación de rango antes de guardar (Feature 3.5)
      const valuesToCheck = [
        { name: 'Adaptador/Martillo', val: steelMeasurementData.adaptadorInferiorMedio, isMart: true },
        { name: 'Barra Patera Superior', val: steelMeasurementData.barraPateraSuperior, isMart: false },
        { name: 'Barra Patera Medio', val: steelMeasurementData.barraPateraMedio, isMart: false },
        { name: 'Barra Patera Inferior', val: steelMeasurementData.barraPateraInferior, isMart: false },
        { name: 'Barra 1 Superior', val: steelMeasurementData.barraSeguidora1Superior, isMart: false },
        { name: 'Barra 1 Medio', val: steelMeasurementData.barraSeguidora1Medio, isMart: false },
        { name: 'Barra 1 Inferior', val: steelMeasurementData.barraSeguidora1Inferior, isMart: false },
        { name: 'Barra 2 Superior', val: steelMeasurementData.barraSeguidora2Superior, isMart: false },
        { name: 'Barra 2 Medio', val: steelMeasurementData.barraSeguidora2Medio, isMart: false },
        { name: 'Barra 2 Inferior', val: steelMeasurementData.barraSeguidora2Inferior, isMart: false },
        { name: 'Barra 3 Superior', val: steelMeasurementData.barraSeguidora3Superior, isMart: false },
        { name: 'Barra 3 Medio', val: steelMeasurementData.barraSeguidora3Medio, isMart: false },
        { name: 'Barra 3 Inferior', val: steelMeasurementData.barraSeguidora3Inferior, isMart: false },
        { name: 'Barra 4 Superior', val: steelMeasurementData.barraSeguidora4Superior, isMart: false },
        { name: 'Barra 4 Medio', val: steelMeasurementData.barraSeguidora4Medio, isMart: false },
        { name: 'Barra 4 Inferior', val: steelMeasurementData.barraSeguidora4Inferior, isMart: false },
        { name: 'Barra 5 Superior', val: steelMeasurementData.barraSeguidora5Superior, isMart: false },
        { name: 'Barra 5 Medio', val: steelMeasurementData.barraSeguidora5Medio, isMart: false },
        { name: 'Barra 5 Inferior', val: steelMeasurementData.barraSeguidora5Inferior, isMart: false },
      ];

      const outOfRange = valuesToCheck.filter(v => {
        if (!v.val || v.val === 0) return false;
        const det = detectMeasurementUnit(v.val, drill, v.isMart);
        return !det.inRange;
      });

      if (outOfRange.length > 0) {
        const confirmMsg = `⚠️ Advertencia: Se detectaron ${outOfRange.length} medida(s) fuera del rango habitual de la perforadora ${drill} (${outOfRange.map(o => o.name).slice(0, 3).join(', ')}${outOfRange.length > 3 ? '...' : ''}).\n\n¿Estás seguro de que deseas guardar estos datos?`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }

      const record: Omit<SteelMeasurement, 'id'> = {
        date: steelMeasurementData.date,
        shift: steelMeasurementData.shift,
        drillNumber: drill,
        adaptadorInferiorMedio: normalizeMeasurementToMm(steelMeasurementData.adaptadorInferiorMedio, drill, true),
        barraPateraSuperior: normalizeMeasurementToMm(steelMeasurementData.barraPateraSuperior, drill, false),
        barraPateraMedio: normalizeMeasurementToMm(steelMeasurementData.barraPateraMedio, drill, false),
        barraPateraInferior: normalizeMeasurementToMm(steelMeasurementData.barraPateraInferior, drill, false),
        barraSeguidora1Superior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora1Superior, drill, false),
        barraSeguidora1Medio: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora1Medio, drill, false),
        barraSeguidora1Inferior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora1Inferior, drill, false),
        barraSeguidora2Superior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora2Superior, drill, false),
        barraSeguidora2Medio: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora2Medio, drill, false),
        barraSeguidora2Inferior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora2Inferior, drill, false),
        barraSeguidora3Superior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora3Superior, drill, false),
        barraSeguidora3Medio: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora3Medio, drill, false),
        barraSeguidora3Inferior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora3Inferior, drill, false),
        barraSeguidora4Superior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora4Superior, drill, false),
        barraSeguidora4Medio: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora4Medio, drill, false),
        barraSeguidora4Inferior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora4Inferior, drill, false),
        barraSeguidora5Superior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora5Superior, drill, false),
        barraSeguidora5Medio: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora5Medio, drill, false),
        barraSeguidora5Inferior: normalizeMeasurementToMm(steelMeasurementData.barraSeguidora5Inferior, drill, false),
        comentarios: steelMeasurementData.comentarios || '',
        synced: 0,
        syncedGas: 0,
        syncedSupabase: 0,
        createdAt: Date.now()
      };

      const recordStr = JSON.stringify(record);
      if (lastSavedDrafts['draft_steelMeasurementData'] === recordStr) {
        alert('Esta información ya ha sido guardada en este dispositivo.');
        return;
      }

      let gasSuccess = false;
      const btn = document.querySelector('.btn-save-measurement');
      const originalText = btn?.textContent || 'GUARDAR';

      if (isOnline) {
        try {
          if (btn) btn.textContent = 'Sincronizando...';
          const fd = new FormData();
          fd.append('steelMeasurement', recordStr);
          const res = await fetch(GAS_URL, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) gasSuccess = true;
        } catch (e) { console.error('Error enviando a nube:', e); }
      }

      record.syncedGas = gasSuccess ? 1 : 0;
      record.syncedSupabase = 0;
      record.synced = 0;
      await db.steelMeasurements.add(record as SteelMeasurement);

      if (isOnline) {
        try {
          await syncEngine.syncAll();
        } catch (e) {
          console.warn('Error sincronizando con Supabase:', e);
        }
      }

      setPendingCount(await getTotalPendingCount());

      const syncSuccess = gasSuccess || isOnline;
      await db.steelMeasurements.add(record);
      setPendingCount(await getTotalPendingCount());

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
          barraSeguidora5Inferior: 0,
          comentarios: ''
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



  // Descargar mediciones de acero desde Google Sheets (solo si hay conexión)
  const downloadSteelMeasurementsFromSheet = async () => {
    if (!navigator.onLine) {
      console.log('Modo sin conexión: usando mediciones de acero guardadas localmente.');
      return;
    }
    try {
      setLoadingDiameters(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(`${GAS_URL}?action=getSteelMeasurements`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const result = await response.json();
      if (result.success && result.measurements) {
        setDiametersData(result.measurements);
        try {
          localStorage.setItem('lomasbayas_cached_diametersData', JSON.stringify(result.measurements));
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.warn('No se pudo descargar mediciones de acero desde la nube (usando datos locales):', error);
    } finally {
      setLoadingDiameters(false);
    }
  };

  // Descargar eventos desde Google Sheets (solo si hay conexión)
  const downloadEventsFromSheet = async (): Promise<Event[]> => {
    if (!navigator.onLine) return [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(`${GAS_URL}?action=getEvents`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const result = await response.json();
      if (result.success && result.events) {
        console.log('Eventos descargados desde Excel:', result.events.length);
        return result.events;
      }
      return [];
    } catch (error) {
      console.warn('Error descargando eventos desde la nube:', error);
      return [];
    }
  };

  // Cargar eventos abiertos (con sincronización bidireccional)
  const loadOpenEvents = async () => {
    // 1. Siempre cargar primero los eventos locales de Dexie
    let localEvents = await db.events.where('closed').equals(0).toArray();
    setOpenEvents(localEvents);

    // 2. Si no hay internet, quedarse únicamente con los datos locales
    if (!navigator.onLine) {
      return;
    }

    // 3. Si hay conexión, descargar eventos del Excel y fusionar
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
      setOpenEvents(localEvents);
    } catch (error) {
      console.warn('Error sincronizando eventos desde Excel:', error);
    }
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
      const originalText = btn?.textContent || 'GUARDAR';

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

      eventToSync.syncedGas = syncSuccess ? 1 : 0;
      eventToSync.syncedSupabase = 0;
      eventToSync.synced = 0;
      await db.events.add(eventToSync as Event);

      if (isOnline) {
        try {
          await syncEngine.syncAll();
        } catch (e) {
          console.warn('Error sincronizando evento con Supabase:', e);
        }
      }

      setPendingCount(await getTotalPendingCount());

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
    try {
      const base64Data = await compressImage(file);

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
    } catch (err) {
      console.error("Error al comprimir la foto:", err);
    }
  };

  // Descargar último inventario desde Google Sheets (solo si hay conexión)
  const downloadLastInventoryFromSheet = async () => {
    if (!navigator.onLine) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(`${GAS_URL}?action=getLastInventory&t=${Date.now()}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const result = await response.json();
      if (result.success && result.inventory) {
        return result.inventory;
      }
      return null;
    } catch (error) {
      console.warn('Error descargando inventario desde la nube:', error);
      return null;
    }
  };

  // Persistencia de submodelos en LocalStorage, Dexie y Supabase
  const persistSubModels = async (updated: Record<string, InventorySubModel[]>) => {
    setSubModelsData(updated);
    try {
      localStorage.setItem('lomasbayas_configured_submodels', JSON.stringify(updated));
      const cachedInv = localStorage.getItem('lomasbayas_cached_inventory');
      if (cachedInv) {
        const parsed = JSON.parse(cachedInv);
        parsed.subModels = updated;
        localStorage.setItem('lomasbayas_cached_inventory', JSON.stringify(parsed));
      }
      const lastLocal = await db.inventoryRecords.orderBy('id').last();
      if (lastLocal && lastLocal.id) {
        await db.inventoryRecords.update(lastLocal.id, { subModels: updated });
      }
      if (navigator.onLine) {
        const { data } = await supabase
          .from('inventory_records')
          .select('id, stock_data')
          .order('date', { ascending: false })
          .limit(1);
        if (data && data[0]) {
          const updatedStock = {
            ...(data[0].stock_data || {}),
            subModels: updated,
            minStocks: minStocksData
          };
          await supabase
            .from('inventory_records')
            .update({ stock_data: updatedStock })
            .eq('id', data[0].id);
        }
      }
    } catch (e) {
      console.warn('Error al persistir submodelos:', e);
    }
  };

  // Persistencia de stocks mínimos en LocalStorage, Dexie y Supabase
  const persistMinStocks = async (updated: Record<string, number>) => {
    setMinStocksData(updated);
    try {
      localStorage.setItem('lomasbayas_inventory_min_stocks', JSON.stringify(updated));
      const cachedInv = localStorage.getItem('lomasbayas_cached_inventory');
      if (cachedInv) {
        const parsed = JSON.parse(cachedInv);
        parsed.minStocks = updated;
        localStorage.setItem('lomasbayas_cached_inventory', JSON.stringify(parsed));
      }
      const lastLocal = await db.inventoryRecords.orderBy('id').last();
      if (lastLocal && lastLocal.id) {
        await db.inventoryRecords.update(lastLocal.id, { minStocks: updated } as any);
      }
      if (navigator.onLine) {
        const { data } = await supabase
          .from('inventory_records')
          .select('id, stock_data')
          .order('date', { ascending: false })
          .limit(1);
        if (data && data[0]) {
          const updatedStock = {
            ...(data[0].stock_data || {}),
            minStocks: updated,
            subModels: subModelsData
          };
          await supabase
            .from('inventory_records')
            .update({ stock_data: updatedStock })
            .eq('id', data[0].id);
        }
      }
    } catch (e) {
      console.warn('Error al persistir stocks mínimos:', e);
    }
  };

  // Manejadores para Modelos de Inventario
  const toggleCollapseModelGroup = (itemKey: string) => {
    setCollapsedModelGroups(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const handleUpdateSubModelStock = async (itemKey: string, modelId: string, delta: number) => {
    const currentList = subModelsData[itemKey] || [];
    const updatedList = currentList.map(m => {
      if (m.id === modelId) {
        const newMina = Math.max(0, (m.mina || 0) + delta);
        return { ...m, mina: newMina };
      }
      return m;
    });

    const updatedAll = {
      ...subModelsData,
      [itemKey]: updatedList
    };

    await persistSubModels(updatedAll);

    const totalMina = updatedList.reduce((sum, m) => sum + (m.mina || 0), 0);
    setInventoryData(inv => ({
      ...inv,
      [`${itemKey}_mina`]: totalMina
    }));
  };

  const handleSaveSubModel = async (itemKey: string, model: InventorySubModel) => {
    const currentList = subModelsData[itemKey] || [];
    const existsIndex = currentList.findIndex(m => m.id === model.id);
    let updatedList: InventorySubModel[];

    if (existsIndex >= 0) {
      updatedList = [...currentList];
      updatedList[existsIndex] = model;
    } else {
      updatedList = [...currentList, model];
    }

    const updatedAll = {
      ...subModelsData,
      [itemKey]: updatedList
    };

    await persistSubModels(updatedAll);

    // Recalcular totales mina y central para el item padre
    const totalMina = updatedList.reduce((sum, m) => sum + (m.mina || 0), 0);
    const totalCentral = updatedList.reduce((sum, m) => sum + (m.central || 0), 0);
    setInventoryData(inv => ({
      ...inv,
      [`${itemKey}_mina`]: totalMina,
      [`${itemKey}_central`]: totalCentral
    }));

    setModelModalData({
      isOpen: false,
      itemKey: '',
      itemName: '',
      itemSap: '',
      model: null
    });
  };

  const handleDeleteSubModel = async (itemKey: string, modelId: string) => {
    if (!confirm('¿Está seguro de eliminar este modelo del inventario?')) return;
    const currentList = subModelsData[itemKey] || [];
    const updatedList = currentList.filter(m => m.id !== modelId);

    const updatedAll = {
      ...subModelsData,
      [itemKey]: updatedList
    };

    await persistSubModels(updatedAll);

    const totalMina = updatedList.reduce((sum, m) => sum + (m.mina || 0), 0);
    const totalCentral = updatedList.reduce((sum, m) => sum + (m.central || 0), 0);
    setInventoryData(inv => ({
      ...inv,
      [`${itemKey}_mina`]: totalMina,
      [`${itemKey}_central`]: totalCentral
    }));
  };

  // Cargar último registro de inventario (en modo offline usa datos guardados localmente)
  const loadLastInventory = async () => {
    // 1. Cargar submodelos y stocks mínimos locales configurados
    try {
      const savedModels = localStorage.getItem('lomasbayas_configured_submodels');
      if (savedModels) {
        setSubModelsData(JSON.parse(savedModels));
      }
      const savedMins = localStorage.getItem('lomasbayas_inventory_min_stocks');
      if (savedMins) {
        setMinStocksData(JSON.parse(savedMins));
      }
    } catch {}

    if (!navigator.onLine) {
      console.log('Modo sin conexión: cargando inventario desde almacenamiento local...');
      try {
        const lastLocal = await db.inventoryRecords.orderBy('id').last();
        if (lastLocal) {
          setLastInventoryDate(`${lastLocal.date} (Local)`);
          const newData: Record<string, number> = {};
          INVENTORY_CATEGORIES.forEach(cat => {
            cat.items.forEach(item => {
              const centralKey = `${item.key}_central` as keyof InventoryRecord;
              const minaKey = `${item.key}_mina` as keyof InventoryRecord;
              newData[`${item.key}_central`] = Number(lastLocal[centralKey]) || 0;
              newData[`${item.key}_mina`] = Number(lastLocal[minaKey]) || 0;
            });
          });
          setInventoryData(newData);
          setInventoryObs(lastLocal.observations || {});
          if (lastLocal.subModels) {
            setSubModelsData(lastLocal.subModels);
          }
          if ((lastLocal as any).minStocks) {
            setMinStocksData((lastLocal as any).minStocks);
          }
        } else {
          const cachedInv = localStorage.getItem('lomasbayas_cached_inventory');
          if (cachedInv) {
            const parsed = JSON.parse(cachedInv);
            setLastInventoryDate(`${parsed.date || ''} (Caché local)`);
            setInventoryData(parsed.data || createEmptyInventory());
            setInventoryObs(parsed.observations || {});
            if (parsed.subModels) {
              setSubModelsData(parsed.subModels);
            }
            if (parsed.minStocks) {
              setMinStocksData(parsed.minStocks);
            }
          } else {
            setLastInventoryDate('Sin conexión (Sin datos locales)');
            setInventoryData(createEmptyInventory());
            setInventoryObs({});
          }
        }
      } catch (err) {
        console.warn('Error cargando inventario local:', err);
      }
      setOpenSnRow(null);
      return;
    }

    try {
      // Si estamos online, consultar también configuración remota desde Supabase
      try {
        const { data: supaInv } = await supabase
          .from('inventory_records')
          .select('stock_data')
          .order('date', { ascending: false })
          .limit(1);
        if (supaInv && supaInv[0]?.stock_data) {
          if (supaInv[0].stock_data.subModels) {
            setSubModelsData(supaInv[0].stock_data.subModels);
            localStorage.setItem('lomasbayas_configured_submodels', JSON.stringify(supaInv[0].stock_data.subModels));
          }
          if (supaInv[0].stock_data.minStocks) {
            setMinStocksData(supaInv[0].stock_data.minStocks);
            localStorage.setItem('lomasbayas_inventory_min_stocks', JSON.stringify(supaInv[0].stock_data.minStocks));
          }
        }
      } catch (e) {
        console.warn('Error cargando modelos desde Supabase:', e);
      }

      const remoteInventory = await downloadLastInventoryFromSheet();

      if (remoteInventory) {
        setLastInventoryDate(remoteInventory.date);

        const newData: Record<string, number> = {};
        INVENTORY_CATEGORIES.forEach(cat => {
          cat.items.forEach(item => {
            const centralKey = `${item.key}_central` as keyof InventoryRecord;
            const minaKey = `${item.key}_mina` as keyof InventoryRecord;

            newData[`${item.key}_central`] = Number(remoteInventory[centralKey]) || 0;
            newData[`${item.key}_mina`] = Number(remoteInventory[minaKey]) || 0;
          });
        });

        setInventoryData(newData);
        setInventoryObs(remoteInventory.observations || {});
        setOpenSnRow(null);

        // Guardar copia local en caché para soporte offline
        try {
          localStorage.setItem('lomasbayas_cached_inventory', JSON.stringify({
            date: remoteInventory.date,
            data: newData,
            observations: remoteInventory.observations || {},
            subModels: subModelsData,
            minStocks: minStocksData
          }));
        } catch {}
      } else {
        setLastInventoryDate(null);
        setInventoryData(createEmptyInventory());
        setInventoryObs({});
        setOpenSnRow(null);
      }
    } catch (error) {
      console.warn('Error obteniendo inventario desde Excel, intentando local:', error);
      try {
        const lastLocal = await db.inventoryRecords.orderBy('id').last();
        if (lastLocal) {
          setLastInventoryDate(`${lastLocal.date} (Local)`);
        } else {
          setLastInventoryDate('sin señal');
        }
      } catch {
        setLastInventoryDate('sin señal');
      }
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
        subModels: subModelsData,
        minStocks: minStocksData,
        synced: 0,
        createdAt: Date.now()
      } as any;

      console.log('Guardando inventario...', record);
      await db.inventoryRecords.add(record);

      try {
        localStorage.setItem('lomasbayas_cached_inventory', JSON.stringify({
          date: inventoryDate,
          data: inventoryData,
          observations: inventoryObs,
          subModels: subModelsData,
          minStocks: minStocksData
        }));
      } catch {}

      // Feedback visual
      const btn = document.querySelector('.btn-save-inventory');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '¡GUARDADO!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }

      // Actualizar conteo pendiente
      setPendingCount(await getTotalPendingCount());

      if (isOnline) {
        await syncData();
      }

      setLastInventoryDate(inventoryDate);
      alert('Inventario guardado correctamente');
    } catch (error) {
      console.error('Error guardando inventario:', error);
      alert('Error al guardar el inventario.');
    }
  };

  // Generar PDF del inventario actual en pantalla con previsualización
  const generateInventoryPDF = async () => {
    // Tomamos la fecha actual en la que esté seteado el calendario
    if (!inventoryDate && !lastInventoryDate) {
      alert('No hay una fecha de inventario definida para el reporte.');
      return;
    }

    const logoDrillcoData = await loadImageForPDF('/drillco.png');
    const logoLomasBayasData = await loadImageForPDF('/lomasbayas.png');

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- Header background ---
    doc.setFillColor(20, 30, 48);
    doc.rect(0, 0, pageWidth, 32, 'F');

    // Accent line
    doc.setFillColor(0, 122, 255);
    doc.rect(0, 32, pageWidth, 1.5, 'F');

    // Title centered
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE INVENTARIO', pageWidth / 2, 14, { align: 'center' });

    // Subtitle centered
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Área Técnica - Drillco', pageWidth / 2, 20, { align: 'center' });

    // Date / info centered
    const reportDate = (lastInventoryDate || inventoryDate).split('-').reverse().join('/');
    doc.setFontSize(9);
    doc.text(`Fecha registro: ${reportDate}  |  Generado: ${new Date().toLocaleDateString('es-CL')}`, pageWidth / 2, 26, { align: 'center' });

    // Draw Logos left and right maintaining aspect ratio
    const logoHeight = 14;
    if (logoDrillcoData) {
      const w = (logoDrillcoData.width / logoDrillcoData.height) * logoHeight;
      doc.addImage(logoDrillcoData.data, 'PNG', 14, 8, w, logoHeight);
    }
    if (logoLomasBayasData) {
      const w = (logoLomasBayasData.width / logoLomasBayasData.height) * logoHeight;
      doc.addImage(logoLomasBayasData.data, 'PNG', pageWidth - 14 - w, 8, w, logoHeight);
    }

    // --- Build table data ---
    const tableBody: any[] = [];

    INVENTORY_CATEGORIES.forEach((category) => {
      let catRowCount = 0;
      category.items.forEach(it => {
        const models = subModelsData[it.key];
        if (models && models.length > 0) {
          catRowCount += 1 + models.length;
        } else {
          catRowCount += 1;
        }
      });

      let isFirstInCat = true;

      category.items.forEach((item) => {
        const centralKey = `${item.key}_central`;
        const minaKey = `${item.key}_mina`;
        const models = subModelsData[item.key];
        const hasModels = models && models.length > 0;

        const centralVal = (inventoryData[centralKey] as number) || 0;
        const minaVal = (inventoryData[minaKey] as number) || 0;
        const total = centralVal + minaVal;

        const catCell = isFirstInCat
          ? { content: category.name, rowSpan: catRowCount, styles: { fontStyle: 'bold', fillColor: [235, 240, 250], valign: 'middle', cellWidth: 38 } }
          : null;
        isFirstInCat = false;

        tableBody.push([
          catCell,
          { content: item.name, styles: { fontStyle: hasModels ? 'bold' : 'normal', fillColor: hasModels ? [254, 249, 231] : undefined } },
          { content: item.sap, styles: { halign: 'center', fillColor: hasModels ? [254, 249, 231] : undefined } },
          { content: centralVal.toString(), styles: { halign: 'center', fontStyle: hasModels ? 'bold' : 'normal', fillColor: hasModels ? [254, 249, 231] : undefined } },
          { content: minaVal.toString(), styles: { halign: 'center', fontStyle: hasModels ? 'bold' : 'normal', fillColor: hasModels ? [254, 249, 231] : undefined } },
          { content: total.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: hasModels ? [254, 249, 231] : undefined } }
        ].filter(cell => cell !== null));

        if (hasModels) {
          models.forEach((m) => {
            const mCentral = m.central || 0;
            const mMina = m.mina || 0;
            const mTotal = mCentral + mMina;

            tableBody.push([
              { content: `   ↳ ${m.name}${m.brand ? ` (${m.brand})` : ''}`, styles: { textColor: [70, 70, 70], fontSize: 7.5 } },
              { content: item.sap, styles: { halign: 'center', fontSize: 7.5, textColor: [70, 70, 70] } },
              { content: mCentral.toString(), styles: { halign: 'center', fontSize: 7.5 } },
              { content: mMina.toString(), styles: { halign: 'center', fontSize: 7.5 } },
              { content: mTotal.toString(), styles: { halign: 'center', fontSize: 7.5, fontStyle: 'bold' } }
            ]);
          });
        }
      });
    });

    // --- Draw table ---
    autoTable(doc, {
      head: [[
        { content: 'Categoría', styles: { halign: 'center' } },
        { content: 'Item / Modelo', styles: { halign: 'left' } },
        { content: 'N° SAP', styles: { halign: 'center' } },
        { content: 'Bod. Central', styles: { halign: 'center' } },
        { content: 'Bod. Mina', styles: { halign: 'center' } },
        { content: 'Total', styles: { halign: 'center' } }
      ]],
      body: tableBody,
      startY: 38,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [210, 215, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [0, 122, 255],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [250, 252, 255]
      },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 26, halign: 'center' },
        5: { cellWidth: 24, halign: 'center' },
      },
      didDrawPage: () => {
        // Footer
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text('Drillco • Lomas Bayas • Reporte generado automáticamente', 14, pageHeight - 6);
        doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
      }
    });

    // Abrir modal de previsualización en vez de descarga directa
    const fileName = `Inventario_${lastInventoryDate || inventoryDate}.pdf`;
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    setPdfPreviewModal({
      isOpen: true,
      url: blobUrl,
      fileName,
      doc
    });
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
      const originalText = btn?.textContent || 'GUARDAR';

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

      dataToSync.syncedGas = syncSuccess ? 1 : 0;
      dataToSync.syncedSupabase = 0;
      dataToSync.synced = 0;
      await db.steelDiscards.add(dataToSync as SteelDiscard);

      if (isOnline) {
        try {
          await syncEngine.syncAll();
        } catch (e) {
          console.warn('Error sincronizando descarte con Supabase:', e);
        }
      }

      setPendingCount(await getTotalPendingCount());

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

    try {
      const base64Data = await compressImage(file);

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
    } catch (err) {
      console.error("Error al comprimir la foto:", err);
    }
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
  const hasDraftMeasurement = steelMeasurementData.drillNumber || parseMeasurementInput(steelMeasurementData.adaptadorInferiorMedio) > 0 || parseMeasurementInput(steelMeasurementData.barraPateraSuperior) > 0;
  const hasDraftEvent = newEventData.title || newEventData.description || newEventData.responsible;
  const hasDraftDiscard = discardData.serie || discardData.equipo || discardData.causaDescarte;

  // Date range limits: current year ±5
  const currentYear = new Date().getFullYear();
  const minDate = `${currentYear - 5}-01-01`;
  const maxDate = `${currentYear + 5}-12-31`;

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f2c12e',
        fontSize: '1.1rem',
        fontWeight: 600
      }}>
        Cargando sistema Lomas Bayas...
      </div>
    );
  }

  if (!profile) {
    return <LoginView />;
  }

  return (
    <div>
      <SyncStatusBar onOpenPending={() => setShowRecentHistoryModal(true)} />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.35rem 1rem',
        background: '#0f172a',
        color: '#94a3b8',
        fontSize: '0.78rem',
        borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
            {profile?.full_name || profile?.email || 'Usuario'}
          </span>
          {profile?.role && (
            <span style={{
              background: '#1e293b',
              color: '#f2c12e',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}>
              {profile.role}
            </span>
          )}
        </div>

        <button
          onClick={() => setShowRecentHistoryModal(true)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
          title="Ver historial de registros guardados en este dispositivo"
        >
          <History size={13} />
          <span>Mis Registros</span>
          {pendingCount > 0 && (
            <span style={{
              background: '#f59e0b',
              color: '#000',
              borderRadius: '9999px',
              padding: '0 5px',
              fontSize: '0.65rem',
              fontWeight: 800
            }}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>
      <div className="connectivity-status" style={{ display: 'none' }}>
        {isOnline ? (
          <><Wifi size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> ONLINE{pendingCount > 0 ? ` - ${pendingCount} PENDIENTE(S)` : ' - SINCRONIZADO'}</>
        ) : (
          <><WifiOff size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> OFFLINE{pendingCount > 0 ? ` - ${pendingCount} PENDIENTE(S)` : ''}</>
        )}
        {isOnline && pendingCount > 0 && (
          <button
            onClick={async () => {
              await syncData();
              setPendingCount(await getTotalPendingCount());
            }}
            style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer' }}
          >
            SINCRONIZAR AHORA
          </button>
        )}
      </div>

      <header className="header">
        <div className="logo-container">
          <img src="/drillco.png" alt="Drillco" style={{ objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
        <div className="brand-title">
          <h1>ÁREA TÉCNICA</h1>
          <p>Lomas Bayas</p>
        </div>
        <div className="logo-container">
          <img src="/lomasbayas.png" alt="Lomas Bayas" style={{ objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
      </header>

      {/* Nueva Página de Inicio: Resumen de Perforadoras */}
      {currentPage === 'inicio' && (
        <main className="container" style={{ paddingBottom: '90px' }}>
          <section className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={22} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>ESTADO PARQUE DE PERFORADORAS</span>
              </div>
              {loadingDiameters && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargando aceros...</span>}
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', margin: 0 }}>
              Resumen en tiempo real de operatividad, ubicación (fase) y desgaste de aceros.
            </p>
          </section>

          {/* Grid de Perforadoras */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '1rem',
          }}>
            {['5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map((drill) => {
              const cfg = DRILL_CONFIG[drill] || { model: 'N/A' };
              const st = drillStatuses[drill];
              const currentStatus = st?.status || 'Operativa';
              const currentPhase = st?.phase || 'Sin fase';

              // Desgaste exhaustivo de aceros evaluando todas las barras (1 a 6) y adaptador/martillo
              const wearResult = getDrillWorstWear(drill, diametersData[drill]);
              let steelColor = wearResult.badgeColor;
              let steelText = wearResult.percentage !== null
                ? `${wearResult.statusText} (${wearResult.percentage}%)`
                : 'Sin datos';
              let steelBg = wearResult.badgeBg;

              // Color del Estado del equipo
              let statusBadgeBg = '#dcfce7';
              let statusBadgeColor = '#166534';
              if (currentStatus === 'Mecanica') {
                statusBadgeBg = '#ffedd5';
                statusBadgeColor = '#9a3412';
              } else if (currentStatus === 'Fuera de servicio') {
                statusBadgeBg = '#fee2e2';
                statusBadgeColor = '#991b1b';
              }

              return (
                <div
                  key={drill}
                  className="card"
                  onClick={() => {
                    if (diametersData[drill]) {
                      setSelectedDrillForReport(drill);
                    }
                  }}
                  style={{
                    padding: '1rem',
                    marginBottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    cursor: diametersData[drill] ? 'pointer' : 'default',
                  }}
                  title={diametersData[drill] ? `Ver reporte de aceros de P${drill}` : undefined}
                >
                  {/* Encabezado: Número y Modelo */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--secondary)' }}>
                        P{drill}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: statusBadgeBg,
                        color: statusBadgeColor,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '9999px',
                      }}>
                        {currentStatus}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      marginTop: '0.15rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}>
                      {cfg.model}
                    </div>
                  </div>

                  {/* Detalles: Fase y Aceros */}
                  <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Fase */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.78rem',
                      borderBottom: '1px dashed #e2e8f0',
                      paddingBottom: '0.3rem',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>Fase / Ubic:</span>
                      <strong style={{ color: 'var(--text-main)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentPhase}
                      </strong>
                    </div>

                    {/* Aceros con semáforo */}
                    <div style={{ fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Aceros:</span>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          backgroundColor: steelBg,
                          color: steelColor,
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                        }}>
                          {steelText}
                        </span>
                      </div>
                      {wearResult.percentage !== null && (
                        <div style={{
                          width: '100%',
                          height: '5px',
                          backgroundColor: '#e5e7eb',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${wearResult.percentage}%`,
                            height: '100%',
                            backgroundColor: steelColor,
                            borderRadius: '3px',
                          }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

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
                <input type="date" min={minDate} max={maxDate} value={reportData.date} onChange={(e) => setReportData({ ...reportData, date: e.target.value })} />
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
                <select
                  value={reportData.drillNumber}
                  onChange={(e) => {
                    const drillVal = e.target.value;
                    const stPhase = drillStatuses[drillVal]?.phase || '';
                    setReportData((prev: typeof reportData) => ({
                      ...prev,
                      drillNumber: drillVal,
                      phase: stPhase || prev.phase
                    }));
                  }}
                >
                  <option value="">Seleccionar...</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
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
                <input
                  type="text"
                  placeholder="Nombre"
                  value={reportData.operator}
                  onChange={(e) => {
                    const newOp = e.target.value;
                    setReportData((prev: typeof reportData) => ({ ...prev, operator: newOp }));
                    if (saveOperatorName) {
                      localStorage.setItem('saved_operator_name', newOp);
                    }
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="saveName"
                    checked={saveOperatorName}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSaveOperatorName(checked);
                      localStorage.setItem('save_operator_name', String(checked));
                      if (checked && reportData.operator) {
                        localStorage.setItem('saved_operator_name', reportData.operator);
                      }
                    }}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="saveName" style={{ textTransform: 'none', fontSize: '0.7rem', cursor: 'pointer' }}>Guardar nombre</label>
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
                  <option>6 1/2"</option>
                </select>
              </div>
            </div>
          </section>

          {/* Registro de Pozos */}
          <div className="well-section-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              REGISTRO DE TRABAJO
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'none', fontSize: '0.8rem', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  id="reporteTotal"
                  checked={isTotalReport}
                  onChange={(e) => setIsTotalReport(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="reporteTotal" style={{ cursor: 'pointer' }}>REPORTE TOTAL</label>
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
                      type="text"
                      inputMode="decimal"
                      onFocus={(e) => e.target.select()}
                      value={item.meters !== undefined && item.meters !== null ? String(item.meters) : ''}
                      onChange={(e) => updateWell(index, 'meters', cleanDecimalInput(e.target.value))}
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
                      ? wells.slice(0, index + 1).filter(w => w.type === 'well').reduce((s, w) => s + parseDecimal(w.meters), 0).toFixed(1) + ' M'
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
            GUARDAR
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
              min={minDate}
              max={maxDate}
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
                  onChange={(e) => {
                    const newDrill = e.target.value;
                    const isBitDrill = ['8', '11', '14'].includes(newDrill);
                    const currentComponent = steelChangeData.component;
                    // Auto-correct Tricono/Bit based on drill type
                    let updatedComponent = currentComponent;
                    if (currentComponent === 'Tricono' && isBitDrill) {
                      updatedComponent = 'Bit';
                    } else if (currentComponent === 'Bit' && !isBitDrill) {
                      updatedComponent = 'Tricono';
                    }
                    setSteelChangeData({ ...steelChangeData, drillNumber: newDrill, component: updatedComponent });
                  }}
                >
                  <option value="">Seleccionar...</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
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
              {(() => {
                const drill = steelChangeData.drillNumber;
                if (['8', '11', '14'].includes(drill)) {
                  return (
                    <>
                      <option value="Amortiguador">Amortiguador</option>
                      <option value="Adaptador superior">Adaptador superior</option>
                      <option value="Barra 1">Barra 1</option>
                      <option value="Barra 2">Barra 2</option>
                      <option value="Barra 3">Barra 3</option>
                      <option value="Barra 4">Barra 4</option>
                      <option value="Barra 5">Barra 5</option>
                      <option value="Barra 6">Barra 6</option>
                      <option value="Martillo">Martillo</option>
                      <option value="Bit">Bit</option>
                    </>
                  );
                } else if (drill === '5') {
                  return (
                    <>
                      <option value="Amortiguador">Amortiguador</option>
                      <option value="Adaptador superior">Adaptador superior</option>
                      <option value="Barra Seguidora">Barra Seguidora</option>
                      <option value="Barra Patera">Barra Patera</option>
                      <option value="Adaptador Inferior">Adaptador Inferior</option>
                      <option value="Anillo Guia">Anillo Guia</option>
                      <option value="Tricono">Tricono</option>
                    </>
                  );
                } else {
                  return (
                    <>
                      <option value="Amortiguador">Amortiguador</option>
                      <option value="Adaptador superior">Adaptador superior</option>
                      <option value="Barra Seguidora 1">Barra Seguidora 1</option>
                      <option value="Barra Seguidora 2">Barra Seguidora 2</option>
                      <option value="Barra Patera">Barra Patera</option>
                      <option value="Adaptador Inferior">Adaptador Inferior</option>
                      <option value="Anillo Guia">Anillo Guia</option>
                      <option value="Tricono">Tricono</option>
                    </>
                  );
                }
              })()}
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
              GUARDAR
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
                  min={minDate}
                  max={maxDate}
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
                  <option value="6">6</option>
                  <option value="7">7</option>
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

          {/* Banner de Rango Operativo y Detección Automática */}
          {steelMeasurementData.drillNumber ? (
            <div style={{
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.82rem',
              color: '#0369a1'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span>🎯 DETECCIÓN AUTOMÁTICA — PERFORADORA P{steelMeasurementData.drillNumber}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#0284c7', color: 'white', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                  {DRILL_CONFIG[steelMeasurementData.drillNumber]?.model || 'Perforadora'}
                </span>
              </div>
              <div style={{ color: '#0c4a6e', lineHeight: 1.45 }}>
                {['8', '11', '14'].includes(steelMeasurementData.drillNumber) ? (
                  <>
                    • <strong>Barras (Patera y Seguidoras):</strong> 4 1/4" a 4 1/2" (108.0 a 114.3 mm)<br />
                    • <strong>Martillo DTH:</strong> 5 1/5" a 6 1/8" (132.0 a 165.0 mm)
                  </>
                ) : ['9', '10'].includes(steelMeasurementData.drillNumber) ? (
                  <>
                    • <strong>Barras y Adaptador:</strong> 9 3/4" a 10 3/4" (248.0 a 273.0 mm)
                  </>
                ) : (
                  <>
                    • <strong>Barras y Adaptador:</strong> 7 5/8" a 8 5/8" (194.0 a 219.0 mm)
                  </>
                )}
                <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#475569' }}>
                  💡 Puedes ingresar las medidas tanto en <strong>milímetros</strong> (ej: 215 o 113.3) como en <strong>pulgadas</strong> decimales o fraccionarias (ej: 8.5 o 8 5/8). El sistema detecta y convierte automáticamente.
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.65rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: '#64748b'
            }}>
              ℹ️ Selecciona una perforadora para ver los rangos esperados de sus aceros (mm y pulgadas) y activar la detección automática.
            </div>
          )}

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
            <div className="form-group" style={{ maxWidth: '280px' }}>
              <label>MEDIO (mm o ")</label>
              <input
                type="text"
                inputMode="text"
                onFocus={(e) => e.target.select()}
                placeholder='Ej: 8.5" o 215mm'
                value={steelMeasurementData.adaptadorInferiorMedio !== undefined && steelMeasurementData.adaptadorInferiorMedio !== null ? String(steelMeasurementData.adaptadorInferiorMedio) : ''}
                onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, adaptadorInferiorMedio: cleanMeasurementInput(e.target.value) as any })}
              />
              <MeasurementBadge
                value={steelMeasurementData.adaptadorInferiorMedio}
                drillNumber={steelMeasurementData.drillNumber}
                isMartilloOrAdaptador={true}
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
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="form-group">
                <label>SUPERIOR (mm o ")</label>
                <input
                  type="text"
                  inputMode="text"
                  onFocus={(e) => e.target.select()}
                  placeholder='Ej: 8.5" o 215mm'
                  value={steelMeasurementData.barraPateraSuperior !== undefined && steelMeasurementData.barraPateraSuperior !== null ? String(steelMeasurementData.barraPateraSuperior) : ''}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, barraPateraSuperior: cleanMeasurementInput(e.target.value) as any })}
                />
                <MeasurementBadge
                  value={steelMeasurementData.barraPateraSuperior}
                  drillNumber={steelMeasurementData.drillNumber}
                  isMartilloOrAdaptador={false}
                />
              </div>
              <div className="form-group">
                <label>MEDIO (mm o ")</label>
                <input
                  type="text"
                  inputMode="text"
                  onFocus={(e) => e.target.select()}
                  placeholder='Ej: 8.5" o 215mm'
                  value={steelMeasurementData.barraPateraMedio !== undefined && steelMeasurementData.barraPateraMedio !== null ? String(steelMeasurementData.barraPateraMedio) : ''}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, barraPateraMedio: cleanMeasurementInput(e.target.value) as any })}
                />
                <MeasurementBadge
                  value={steelMeasurementData.barraPateraMedio}
                  drillNumber={steelMeasurementData.drillNumber}
                  isMartilloOrAdaptador={false}
                />
              </div>
              <div className="form-group">
                <label style={{ color: 'var(--danger)' }}>INFERIOR (mm o ")</label>
                <input
                  type="text"
                  inputMode="text"
                  onFocus={(e) => e.target.select()}
                  placeholder='Ej: 8.5" o 215mm'
                  value={steelMeasurementData.barraPateraInferior !== undefined && steelMeasurementData.barraPateraInferior !== null ? String(steelMeasurementData.barraPateraInferior) : ''}
                  onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, barraPateraInferior: cleanMeasurementInput(e.target.value) as any })}
                />
                <MeasurementBadge
                  value={steelMeasurementData.barraPateraInferior}
                  drillNumber={steelMeasurementData.drillNumber}
                  isMartilloOrAdaptador={false}
                />
              </div>
            </div>
          </section>

          {/* 3. Barras Seguidoras - dinámicas según perforadora */}
          {/* Perforadoras 8, 11, 14 = 5 barras; Perforadoras 5, 6, 7, 9, 10, 12, 13 = 2 barras */}
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
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div className="form-group">
                    <label>SUPERIOR (mm o ")</label>
                    <input
                      type="text"
                      inputMode="text"
                      onFocus={(e) => e.target.select()}
                      placeholder='Ej: 8.5" o 215mm'
                      value={steelMeasurementData[supKey] !== undefined && steelMeasurementData[supKey] !== null ? String(steelMeasurementData[supKey]) : ''}
                      onChange={(e) => setSteelMeasurementData({
                        ...steelMeasurementData,
                        [supKey]: cleanMeasurementInput(e.target.value) as any
                      })}
                    />
                    <MeasurementBadge
                      value={steelMeasurementData[supKey] as any}
                      drillNumber={steelMeasurementData.drillNumber}
                      isMartilloOrAdaptador={false}
                    />
                  </div>
                  <div className="form-group">
                    <label>MEDIO (mm o ")</label>
                    <input
                      type="text"
                      inputMode="text"
                      onFocus={(e) => e.target.select()}
                      placeholder='Ej: 8.5" o 215mm'
                      value={steelMeasurementData[medKey] !== undefined && steelMeasurementData[medKey] !== null ? String(steelMeasurementData[medKey]) : ''}
                      onChange={(e) => setSteelMeasurementData({
                        ...steelMeasurementData,
                        [medKey]: cleanMeasurementInput(e.target.value) as any
                      })}
                    />
                    <MeasurementBadge
                      value={steelMeasurementData[medKey] as any}
                      drillNumber={steelMeasurementData.drillNumber}
                      isMartilloOrAdaptador={false}
                    />
                  </div>
                  <div className="form-group">
                    <label>INFERIOR (mm o ")</label>
                    <input
                      type="text"
                      inputMode="text"
                      onFocus={(e) => e.target.select()}
                      placeholder='Ej: 8.5" o 215mm'
                      value={steelMeasurementData[infKey] !== undefined && steelMeasurementData[infKey] !== null ? String(steelMeasurementData[infKey]) : ''}
                      onChange={(e) => setSteelMeasurementData({
                        ...steelMeasurementData,
                        [infKey]: cleanMeasurementInput(e.target.value) as any
                      })}
                    />
                    <MeasurementBadge
                      value={steelMeasurementData[infKey] as any}
                      drillNumber={steelMeasurementData.drillNumber}
                      isMartilloOrAdaptador={false}
                    />
                  </div>
                </div>
              </section>
            );
          })}

          <section className="card">
            <div className="card-title">
              <FileText size={20} />
              <span>COMENTARIOS</span>
            </div>
            <textarea
              placeholder="Motivo del registro, observaciones, etc."
              value={steelMeasurementData.comentarios}
              onChange={(e) => setSteelMeasurementData({ ...steelMeasurementData, comentarios: e.target.value })}
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
              className={`btn-save btn-save-measurement ${hasDraftMeasurement ? 'pulse-red' : ''}`}
              onClick={handleSaveSteelMeasurement}
              style={{ flex: 2 }}
            >
              <Save size={24} />
              GUARDAR
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
                      {formatDateSafe(event.date)}
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
              min={minDate}
              max={maxDate}
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
              GUARDAR
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
            <section
              className="card"
              onClick={() => setCurrentPage('controlDiametros')}
              style={{ cursor: 'pointer', textAlign: 'center' }}>
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
                Estado de desgaste de aceros
              </p>
            </section>

            {/* Estado de Perforadoras */}
            <section
              className="card"
              onClick={() => setCurrentPage('estadoPerforadoras')}
              style={{ cursor: 'pointer', textAlign: 'center', border: '1px solid #3b82f6' }}>
              <div style={{
                background: 'rgba(59, 130, 246, 0.12)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <HardHat size={32} style={{ color: '#2563eb' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: '#1e3a8a' }}>Estado Perforadoras</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Actualizar Estado y Fase en terreno
              </p>
            </section>

            {/* Checklist de Equipos */}
            <section
              className="card"
              onClick={() => setCurrentPage('checklist')}
              style={{ cursor: 'pointer', textAlign: 'center' }}>
              <div style={{
                background: 'rgba(23, 162, 184, 0.1)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'inline-block',
                marginBottom: '0.5rem'
              }}>
                <ClipboardList size={32} style={{ color: '#17a2b8' }} />
              </div>
              <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>Checklist de Equipos</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                Inspección diaria de perforadoras
              </p>
            </section>

            {/* Panel Administrador (Solo Admin) */}
            {profile?.role === 'admin' && (
              <section
                className="card"
                onClick={() => setCurrentPage('admin')}
                style={{ cursor: 'pointer', textAlign: 'center', border: '2px solid #f2c12e' }}
              >
                <div style={{
                  background: 'rgba(242, 193, 46, 0.15)',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'inline-block',
                  marginBottom: '0.5rem'
                }}>
                  <HardHat size={32} style={{ color: '#d4a724' }} />
                </div>
                <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: '#1a252f' }}>Panel Administrador</h3>
                <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                  Gestión privada de cuentas operativas
                </p>
              </section>
            )}

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
                min={minDate}
                max={maxDate}
                value={inventoryDate}
                onChange={(e) => setInventoryDate(e.target.value)}
                style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
              />
            </div>
            {lastInventoryDate && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', margin: 0 }}>
                  Último registro: {lastInventoryDate.split('-').reverse().join('-')}
                </p>
                <button
                  onClick={generateInventoryPDF}
                  style={{
                    background: 'none',
                    border: '1.5px solid var(--success)',
                    color: 'var(--success)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <FileText size={14} />
                  PDF
                </button>
              </div>
            )}
          </section>

          {/* Lista e Inventario con Modelos y Categorías */}
          <div style={{ overflowX: 'auto', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ minWidth: '820px' }}>
              {INVENTORY_CATEGORIES.map((category) => (
                <div key={category.name} style={{ marginBottom: '6px' }}>
                  {/* Banner de Categoría */}
                  <div style={{
                    background: '#fff9db',
                    borderLeft: '4px solid #f59e0b',
                    padding: '8px 12px',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    color: '#1f2937',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {category.name}
                  </div>

                  {/* Items de la Categoría */}
                  {category.items.map((item) => {
                    const models = subModelsData[item.key] || [];
                    const hasModels = models.length > 0;
                    const isCollapsed = !!collapsedModelGroups[item.key];
                    const centralVal = (inventoryData[`${item.key}_central`] || 0);
                    const minaVal = (inventoryData[`${item.key}_mina`] || 0);
                    const actualStock = centralVal + minaVal;
                    const itemMinStock = minStocksData[item.key] !== undefined ? minStocksData[item.key] : item.minStock;
                    const hasMinStock = itemMinStock !== undefined && itemMinStock !== null;

                    const subtitleText = [
                      item.subtitle,
                      `Central: ${centralVal} • Mina: ${minaVal}`,
                      hasModels ? (isCollapsed ? `${models.length} modelos agrupados (clic para desagrupar)` : `Mostrando ${models.length} modelos (clic para agrupar)`) : null
                    ].filter(Boolean).join(' • ');

                    if (hasModels) {
                      return (
                        <React.Fragment key={item.key}>
                          {/* Fila Principal de Producto con Modelos */}
                          <div style={{
                            background: '#fff9db',
                            borderBottom: '1px solid #fef08a',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}>
                            {/* Izquierda: Chevron + SAP + Nombre y Subtítulo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <button
                                onClick={() => toggleCollapseModelGroup(item.key)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '2px',
                                  cursor: 'pointer',
                                  color: '#b45309',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title={isCollapsed ? 'Desagrupar' : 'Agrupar'}
                              >
                                {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                              </button>

                              <span style={{
                                background: '#fde047',
                                color: '#854d0e',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                letterSpacing: '0.5px',
                                whiteSpace: 'nowrap'
                              }}>
                                {item.sap}
                              </span>

                              <div style={{ minWidth: 0 }}>
                                <div style={{
                                  fontWeight: 800,
                                  fontSize: '0.9rem',
                                  color: '#111827',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#4b5563', marginTop: '1px' }}>
                                  {subtitleText}
                                </div>
                              </div>
                            </div>

                            {/* Centro y Derecha: ACTUAL, MÍNIMO, DIFF, AGRUPAR, + MODELO */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                              <div style={{ textAlign: 'center', minWidth: '50px' }}>
                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                                  {actualStock}
                                </div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px' }}>
                                  ACTUAL
                                </div>
                              </div>

                              {hasMinStock ? (
                                <>
                                  <div style={{ textAlign: 'center', minWidth: '55px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#4b5563', lineHeight: 1 }}>
                                        {itemMinStock}
                                      </span>
                                      {profile?.role === 'admin' && (
                                        <button
                                          onClick={() => setMinStockModalData({
                                            isOpen: true,
                                            itemKey: item.key,
                                            itemName: item.name,
                                            currentMin: itemMinStock
                                          })}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: '2px',
                                            color: '#f59e0b',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                          }}
                                          title="Editar stock mínimo crítico (Admin)"
                                        >
                                          <Pencil size={11} />
                                        </button>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px' }}>
                                      MÍNIMO
                                    </div>
                                  </div>

                                  {(() => {
                                    const diff = actualStock - itemMinStock;
                                    const isPos = diff >= 0;
                                    return (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        background: isPos ? '#d1fae5' : '#fee2e2',
                                        color: isPos ? '#065f46' : '#991b1b',
                                        border: `1px solid ${isPos ? '#a7f3d0' : '#fecaca'}`,
                                        minWidth: '45px',
                                        justifyContent: 'center'
                                      }}>
                                        {isPos ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                                        {diff > 0 ? `+${diff}` : diff}
                                      </div>
                                    );
                                  })()}
                                </>
                              ) : (
                                profile?.role === 'admin' ? (
                                  <div style={{ textAlign: 'center', minWidth: '70px' }}>
                                    <button
                                      onClick={() => setMinStockModalData({
                                        isOpen: true,
                                        itemKey: item.key,
                                        itemName: item.name,
                                        currentMin: 0
                                      })}
                                      style={{
                                        background: 'none',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '4px',
                                        padding: '3px 6px',
                                        fontSize: '0.68rem',
                                        color: '#64748b',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title="Configurar stock mínimo crítico (Admin)"
                                    >
                                      + Mínimo
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ minWidth: '70px' }} />
                                )
                              )}

                              <button
                                onClick={() => toggleCollapseModelGroup(item.key)}
                                style={{
                                  background: 'white',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  padding: '5px 12px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  color: '#374151',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {isCollapsed ? `Modelos (${models.length})` : 'Agrupar'}
                              </button>

                              <button
                                onClick={() => setModelModalData({
                                  isOpen: true,
                                  itemKey: item.key,
                                  itemName: item.name,
                                  itemSap: item.sap,
                                  model: null
                                })}
                                style={{
                                  background: '#f59e0b',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '5px 12px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  color: 'white',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <Plus size={14} /> Modelo
                              </button>
                            </div>
                          </div>

                          {/* Sub-modelos cuando no está colapsado */}
                          {!isCollapsed && models.map((model) => (
                            <div
                              key={model.id}
                              style={{
                                background: '#ffffff',
                                borderBottom: '1px dashed #e5e7eb',
                                padding: '7px 12px 7px 32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px'
                              }}
                            >
                              {/* Izquierda: ↳ Modelo + Nombre + Marca */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  ↳ Modelo
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{
                                    fontWeight: 800,
                                    fontSize: '0.84rem',
                                    color: '#111827',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {model.name}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                                    {model.brand || ''}
                                  </div>
                                </div>
                              </div>

                              {/* Centro y Derecha: Cantidades Central/Mina, N° SAP (del madre), Acciones */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ textAlign: 'center', minWidth: '42px' }}>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                                      {model.central || 0}
                                    </div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b' }}>
                                      CENTRAL
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'center', minWidth: '42px' }}>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#047857', lineHeight: 1 }}>
                                      {model.mina || 0}
                                    </div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#047857' }}>
                                      MINA
                                    </div>
                                  </div>
                                </div>

                                <span style={{
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap'
                                }}
                                title={`SAP de ${item.name}`}>
                                  {item.sap}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    onClick={() => handleUpdateSubModelStock(item.key, model.id, 1)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '4px 8px',
                                      background: '#ecfdf5',
                                      border: '1px solid #a7f3d0',
                                      color: '#059669',
                                      borderRadius: '5px',
                                      fontSize: '0.73rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Ingreso Mina (+1)"
                                  >
                                    <ArrowUp size={13} /> Ingreso
                                  </button>

                                  <button
                                    onClick={() => handleUpdateSubModelStock(item.key, model.id, -1)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '4px 8px',
                                      background: '#fef2f2',
                                      border: '1px solid #fecaca',
                                      color: '#dc2626',
                                      borderRadius: '5px',
                                      fontSize: '0.73rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Retiro Mina (-1)"
                                  >
                                    <ArrowDown size={13} /> Retiro
                                  </button>

                                  <button
                                    onClick={() => setModelModalData({
                                      isOpen: true,
                                      itemKey: item.key,
                                      itemName: item.name,
                                      itemSap: item.sap,
                                      model
                                    })}
                                    style={{
                                      background: 'white',
                                      border: '1px solid #d1d5db',
                                      color: '#4b5563',
                                      padding: '5px',
                                      borderRadius: '5px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    title="Editar modelo"
                                  >
                                    <Pencil size={13} />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteSubModel(item.key, model.id)}
                                    style={{
                                      background: 'white',
                                      border: '1px solid #d1d5db',
                                      color: '#ef4444',
                                      padding: '5px',
                                      borderRadius: '5px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    title="Eliminar modelo"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    }

                    // Producto normal sin modelos configurados
                    return (
                      <React.Fragment key={item.key}>
                        <div style={{
                          background: '#ffffff',
                          borderBottom: '1px solid var(--border)',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}>
                          {/* Izquierda: SAP + Nombre */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            <span style={{
                              background: '#f3f4f6',
                              color: '#374151',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap'
                            }}>
                              {item.sap}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                fontWeight: 600,
                                fontSize: '0.82rem',
                                color: '#111827',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {item.name}
                              </div>
                              {item.subtitle && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Controles Bodega Central, Bodega Mina, Mínimo y Botones */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                            {/* Bodega Central */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ fontSize: '0.7rem', color: '#6b7280', marginRight: '2px' }}>Central:</span>
                              <button
                                onClick={() => setInventoryData({
                                  ...inventoryData,
                                  [`${item.key}_central`]: Math.max(0, (inventoryData[`${item.key}_central`] || 0) - 1)
                                })}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: '#f8f9fa',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}
                              >−</button>
                              <input
                                type="number"
                                onFocus={(e) => e.target.select()}
                                min="0"
                                value={inventoryData[`${item.key}_central`] || 0}
                                onChange={(e) => setInventoryData({
                                  ...inventoryData,
                                  [`${item.key}_central`]: parseInt(e.target.value) || 0
                                })}
                                style={{
                                  width: '40px',
                                  padding: '0.2rem',
                                  textAlign: 'center',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem'
                                }}
                              />
                              <button
                                onClick={() => setInventoryData({
                                  ...inventoryData,
                                  [`${item.key}_central`]: (inventoryData[`${item.key}_central`] || 0) + 1
                                })}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: '#f8f9fa',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}
                              >+</button>
                            </div>

                            {/* Bodega Mina */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ fontSize: '0.7rem', color: '#6b7280', marginRight: '2px' }}>Mina:</span>
                              <button
                                onClick={() => setInventoryData({
                                  ...inventoryData,
                                  [`${item.key}_mina`]: Math.max(0, (inventoryData[`${item.key}_mina`] || 0) - 1)
                                })}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: '#f8f9fa',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}
                              >−</button>
                              <input
                                type="number"
                                onFocus={(e) => e.target.select()}
                                min="0"
                                value={inventoryData[`${item.key}_mina`] || 0}
                                onChange={(e) => setInventoryData({
                                  ...inventoryData,
                                  [`${item.key}_mina`]: parseInt(e.target.value) || 0
                                })}
                                style={{
                                  width: '40px',
                                  padding: '0.2rem',
                                  textAlign: 'center',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem'
                                }}
                              />
                              <button
                                onClick={() => setInventoryData({
                                  ...inventoryData,
                                  [`${item.key}_mina`]: (inventoryData[`${item.key}_mina`] || 0) + 1
                                })}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: '#f8f9fa',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}
                              >+</button>
                            </div>

                            {/* Indicador de Mínimo si existe para producto normal */}
                            {hasMinStock ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ textAlign: 'center', minWidth: '40px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4b5563' }}>
                                      {itemMinStock}
                                    </span>
                                    {profile?.role === 'admin' && (
                                      <button
                                        onClick={() => setMinStockModalData({
                                          isOpen: true,
                                          itemKey: item.key,
                                          itemName: item.name,
                                          currentMin: itemMinStock
                                        })}
                                        style={{ background: 'none', border: 'none', padding: 0, color: '#f59e0b', cursor: 'pointer' }}
                                        title="Editar mínimo crítico (Admin)"
                                      >
                                        <Pencil size={10} />
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#6b7280' }}>
                                    MÍN
                                  </div>
                                </div>

                                {(() => {
                                  const diff = actualStock - itemMinStock;
                                  const isPos = diff >= 0;
                                  return (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '2px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      background: isPos ? '#d1fae5' : '#fee2e2',
                                      color: isPos ? '#065f46' : '#991b1b',
                                      border: `1px solid ${isPos ? '#a7f3d0' : '#fecaca'}`
                                    }}>
                                      {isPos ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                                      {diff > 0 ? `+${diff}` : diff}
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : profile?.role === 'admin' ? (
                              <button
                                onClick={() => setMinStockModalData({
                                  isOpen: true,
                                  itemKey: item.key,
                                  itemName: item.name,
                                  currentMin: 0
                                })}
                                style={{
                                  background: 'none',
                                  border: '1px dashed #cbd5e1',
                                  borderRadius: '4px',
                                  padding: '2px 5px',
                                  fontSize: '0.65rem',
                                  color: '#64748b',
                                  cursor: 'pointer'
                                }}
                                title="Configurar stock mínimo crítico (Admin)"
                              >
                                + Mín
                              </button>
                            ) : null}

                            {/* Botón SN */}
                            <button
                              onClick={() => setOpenSnRow(openSnRow === item.key ? null : item.key)}
                              style={{
                                width: '28px',
                                height: '28px',
                                border: '1px solid var(--primary)',
                                borderRadius: '4px',
                                background: openSnRow === item.key ? 'var(--primary)' : 'white',
                                color: openSnRow === item.key ? 'white' : 'var(--primary)',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '0.72rem',
                                padding: 0
                              }}
                              title="N° de Serie / Observaciones"
                            >
                              SN
                            </button>

                            {/* Botón + Modelo */}
                            <button
                              onClick={() => setModelModalData({
                                isOpen: true,
                                itemKey: item.key,
                                itemName: item.name,
                                itemSap: item.sap,
                                model: null
                              })}
                              style={{
                                background: '#f59e0b',
                                border: 'none',
                                borderRadius: '5px',
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                              }}
                              title="Agregar modelo para este producto"
                            >
                              <Plus size={13} /> Modelo
                            </button>
                          </div>
                        </div>

                        {/* Campo de observaciones / SN cuando está abierto */}
                        {openSnRow === item.key && (
                          <div style={{ background: '#fffbcc', padding: '0.5rem 1rem', borderBottom: '1px solid #ffe066' }}>
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
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ))}
            </div>
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
              GUARDAR
            </button>
          </div>
        </main>
      )}

      {/* Página Checklist */}
      {currentPage === 'checklist' && <ChecklistPage 
        gasUrl={GAS_URL}
        isOnline={isOnline}
        onSave={() => {
          getTotalPendingCount().then(setPendingCount);
        }} 
      />}

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
                  min={minDate}
                  max={maxDate}
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
                <label>Equipo / Perforadora</label>
                <select
                  value={discardData.equipo}
                  onChange={(e) => setDiscardData({ ...discardData, equipo: e.target.value })}
                >
                  <option value="">Seleccionar equipo...</option>
                  {['5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map(d => (
                    <option key={d} value={`PE-${d}`}>PE-{d} ({DRILL_CONFIG[d]?.model || 'N/A'})</option>
                  ))}
                  <option value="OTRO">Otro equipo</option>
                </select>
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
                  min={minDate}
                  max={maxDate}
                  value={discardData.fechaPostura}
                  onChange={(e) => setDiscardData({ ...discardData, fechaPostura: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Fecha de Descarte</label>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
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
                      onFocus={(e) => e.target.select()}
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
                        <Camera size={14} style={{ marginRight: '4px' }} /> Cámara
                        <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange('fotoSerie')} style={{ display: 'none' }} />
                      </label>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon size={14} style={{ marginRight: '4px' }} /> Galería
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
                        <Camera size={14} style={{ marginRight: '4px' }} /> Cámara
                        <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange('fotoCuerpo')} style={{ display: 'none' }} />
                      </label>
                      <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon size={14} style={{ marginRight: '4px' }} /> Galería
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
                      <Camera size={14} style={{ marginRight: '4px' }} /> Cámara
                      <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange('fotoBotones')} style={{ display: 'none' }} />
                    </label>
                    <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={14} style={{ marginRight: '4px' }} /> Galería
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
                          <Camera size={14} style={{ marginRight: '4px' }} /> Cámara
                          <input type="file" accept="image/*" capture="environment" onChange={handleDiscardPhotoChange(item.key)} style={{ display: 'none' }} />
                        </label>
                        <label style={{ flex: 1, padding: '6px', background: 'var(--secondary)', color: 'white', borderRadius: '4px', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImageIcon size={14} style={{ marginRight: '4px' }} /> Galería
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
              {uploadingDiscardPhoto ? 'SUBIENDO...' : 'GUARDAR'}
            </button>
          </div>
        </main>
      )}

      {/* Página Control de Diámetros */}
      {currentPage === 'controlDiametros' && (
        <main className="container" style={{ paddingBottom: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
            <button 
              onClick={() => setCurrentPage('analista')}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0.5rem' }}
            >
              ← VOLVER
            </button>
            <h2 style={{ margin: 0, color: 'var(--text-dark)' }}>CONTROL DE DIÁMETROS</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Leyenda */}
            <section className="card" style={{ marginBottom: 0, padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: 'var(--text-muted)' }}>ESTADO (VIDA ÚTIL)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28a745' }}></div>
                  <span><strong>VERDE:</strong> &gt; 66%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffc107' }}></div>
                  <span><strong>AMARILLO:</strong> 33% - 66%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#dc3545' }}></div>
                  <span><strong>ROJO:</strong> &lt; 33%</span>
                </div>
              </div>
            </section>

            {/* Umbrales */}
            <section className="card" style={{ marginBottom: 0, padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: 'var(--text-muted)' }}>UMBRALES DESCARTE</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.75rem' }}>
                <div><strong>Perf 8, 11, 14 (Barras):</strong> 114.3mm → 108mm</div>
                <div><strong>Perf 8, 11, 14 (Martillo):</strong> 165mm → 132mm</div>
                <div><strong>Perf 5, 6, 7, 12, 13:</strong> 219mm → 194mm</div>
                <div><strong>Perf 9, 10:</strong> 273mm → 248mm</div>
              </div>
            </section>
          </div>

          <section className="card">
            <div className="card-title" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={20} />
                <span>ESTADO POR PERFORADORA</span>
              </div>
              {loadingDiameters && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Actualizando...</span>}
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
              gap: '1rem' 
            }}>
              {['5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map(drill => {
                const wear = getDrillWorstWear(drill, diametersData[drill]);
                const percentage = wear.percentage;
                const valMm = wear.worstMm;

                let color = wear.badgeBg;
                let colorText = wear.badgeColor;
                let stateText = wear.statusText;

                return (
                  <div key={drill} style={{
                    background: color,
                    border: `1px solid ${color !== '#f0f2f5' ? colorText : '#ddd'}`,
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.04)',
                    transition: 'transform 0.2s ease',
                    cursor: valMm > 0 ? 'pointer' : 'default'
                  }}
                  onClick={() => { if(valMm > 0) setSelectedDrillForReport(drill) }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: colorText, marginBottom: '0.2rem' }}>
                      P{drill}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: colorText, marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
                      {stateText}
                    </div>
                    {valMm > 0 ? (
                      <>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                          {valMm.toFixed(1)} <span style={{ fontSize: '0.7rem' }}>mm</span>
                        </div>
                        <div style={{ 
                          width: '100%', 
                          height: '6px', 
                          background: 'rgba(0,0,0,0.1)', 
                          borderRadius: '3px', 
                          marginTop: '0.5rem',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${percentage}%`, 
                            height: '100%', 
                            background: colorText,
                            borderRadius: '3px'
                          }}></div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'right' }}>
                          {percentage?.toFixed(0)}%
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                        -
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          
          {selectedDrillForReport && diametersData[selectedDrillForReport] && (
            <DrillReportModal 
              drill={selectedDrillForReport}
              data={diametersData[selectedDrillForReport]}
              onClose={() => setSelectedDrillForReport(null)}
            />
          )}
        </main>
      )}

      {/* Página Técnico: Gestión de Estado de Perforadoras */}
      {currentPage === 'estadoPerforadoras' && (
        <main className="container" style={{ paddingBottom: '90px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
            <button
              onClick={() => setCurrentPage('analista')}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0.5rem', fontWeight: 700 }}
            >
              ← VOLVER
            </button>
            <h2 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '1.25rem' }}>ESTADO DE PERFORADORAS</h2>
          </div>

          <section className="card" style={{ marginBottom: '1.25rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Actualice el estado operacional (Operativa / Mecánica / Fuera de servicio) y la fase actual de cada equipo. La información se guarda a nivel local y se sincroniza automáticamente con la nube.
            </p>
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {['5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map((drill) => {
              const cfg = DRILL_CONFIG[drill] || { model: 'N/A' };
              const current = drillStatuses[drill] || {
                drillNumber: drill,
                model: cfg.model,
                status: 'Operativa',
                phase: '',
                updatedAt: Date.now(),
                synced: 0,
              };

              const handleUpdate = async (field: 'status' | 'phase', val: string) => {
                const updated: DrillStatusRecord = {
                  ...current,
                  drillNumber: drill,
                  model: cfg.model,
                  [field]: val,
                  updatedAt: Date.now(),
                  updatedBy: profile?.full_name || profile?.email || 'Técnico',
                  synced: 0,
                };

                // Guardar en estado local
                setDrillStatuses(prev => ({ ...prev, [drill]: updated }));

                // Guardar en Dexie IndexedDB
                try {
                  const existing = await db.drillStatuses.where('drillNumber').equals(drill).first();
                  if (existing?.id) {
                    await db.drillStatuses.update(existing.id, updated);
                  } else {
                    await db.drillStatuses.add(updated);
                  }
                  setPendingCount(await getTotalPendingCount());
                } catch (e) {
                  console.error('Error guardando estado de perforadora en local:', e);
                }
              };

              return (
                <section
                  key={drill}
                  className="card"
                  style={{
                    padding: '1rem',
                    marginBottom: 0,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--secondary)' }}>
                        Perforadora {drill}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.5rem', fontWeight: 600 }}>
                        ({cfg.model})
                      </span>
                    </div>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Estado Operacional</label>
                      <select
                        value={current.status}
                        onChange={(e) => handleUpdate('status', e.target.value as any)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                        }}
                      >
                        <option value="Operativa">Operativa</option>
                        <option value="Mecanica">Mecánica</option>
                        <option value="Fuera de servicio">Fuera de servicio</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Fase / Ubicación</label>
                      <input
                        type="text"
                        placeholder="Ej: Fase 6, Banco 2800"
                        value={current.phase || ''}
                        onChange={(e) => handleUpdate('phase', e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* Botones Guardar y Volver */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', marginBottom: '1rem' }}>
            <button
              className="btn-add"
              onClick={() => setCurrentPage('analista')}
              style={{ flex: 1, padding: '0.85rem' }}
            >
              ← VOLVER
            </button>
            <button
              className={`btn-save ${drillStatusesSavedSuccess ? 'pulse-green' : ''}`}
              disabled={savingDrillStatuses}
              onClick={async () => {
                setSavingDrillStatuses(true);
                try {
                  // 1. Guardar todos los estados en Dexie
                  const drills = ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];
                  for (const drill of drills) {
                    const cfg = DRILL_CONFIG[drill] || { model: 'N/A' };
                    const current = drillStatuses[drill] || {
                      drillNumber: drill,
                      model: cfg.model,
                      status: 'Operativa',
                      phase: '',
                      updatedAt: Date.now(),
                      synced: 0,
                    };
                    const existing = await db.drillStatuses.where('drillNumber').equals(drill).first();
                    if (existing?.id) {
                      await db.drillStatuses.update(existing.id, { ...current, synced: 0 });
                    } else {
                      await db.drillStatuses.add({ ...current, synced: 0 });
                    }
                  }

                  // 2. Sincronizar inmediatamente con Supabase si hay conexión
                  if (navigator.onLine) {
                    await syncEngine.syncAll();
                  }

                  setPendingCount(await getTotalPendingCount());
                  setDrillStatusesSavedSuccess(true);
                  setTimeout(() => setDrillStatusesSavedSuccess(false), 2500);
                  alert(navigator.onLine ? '¡Estados de perforadoras guardados y sincronizados con Supabase!' : 'Guardado en modo sin conexión. Se sincronizará al detectar internet.');
                } catch (err) {
                  console.error('Error guardando estados de perforadoras:', err);
                  alert('Error al guardar los estados.');
                } finally {
                  setSavingDrillStatuses(false);
                }
              }}
              style={{ flex: 2, padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem' }}
            >
              <Save size={20} />
              <span>{savingDrillStatuses ? 'GUARDANDO...' : (drillStatusesSavedSuccess ? '¡GUARDADO!' : 'GUARDAR Y SINCRONIZAR')}</span>
            </button>
          </div>
        </main>
      )}

      {/* Panel Privado Administrador */}
      {currentPage === 'admin' && (
        <AdminPanel onBack={() => setCurrentPage('analista')} />
      )}

      <nav className="bottom-nav">
        <a
          href="#"
          className={`nav-item ${currentPage === 'inicio' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('inicio'); }}
        >
          <Home size={24} />
          <span>Inicio</span>
        </a>
        <a
          href="#"
          className={`nav-item ${currentPage === 'reporte' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('reporte'); }}
        >
          <ClipboardList size={24} />
          <span>Reporte</span>
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
          className={`nav-item ${currentPage === 'analista' || currentPage === 'inventario' || currentPage === 'estadoPerforadoras' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setCurrentPage('analista'); }}
        >
          <FileText size={24} />
          <span>Técnico</span>
        </a>
      </nav>

      {/* Notificación flotante para evitar cierre accidental al pulsar Atrás en la pantalla de inicio */}
      {showExitToast && (
        <div style={{
          position: 'fixed',
          bottom: '75px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          color: '#f8fafc',
          padding: '0.6rem 1.25rem',
          borderRadius: '9999px',
          fontSize: '0.85rem',
          fontWeight: 700,
          zIndex: 99999,
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          border: '1px solid #334155'
        }}>
          Presiona atrás nuevamente para salir
        </div>
      )}

      {/* Modal Historial de Registros en Dispositivo */}
      {showRecentHistoryModal && (
        <RecentRecordsModal
          isOnline={isOnline}
          onClose={() => setShowRecentHistoryModal(false)}
          onSyncTriggered={async () => {
            setPendingCount(await getTotalPendingCount());
          }}
        />
      )}

      {/* Modal Previsualización de PDF de Inventario */}
      <InventoryPdfModal
        isOpen={pdfPreviewModal.isOpen}
        onClose={() => {
          if (pdfPreviewModal.url) {
            URL.revokeObjectURL(pdfPreviewModal.url);
          }
          setPdfPreviewModal({ isOpen: false, url: null, fileName: '', doc: null });
        }}
        pdfUrl={pdfPreviewModal.url}
        fileName={pdfPreviewModal.fileName}
        onDownload={() => {
          if (pdfPreviewModal.doc) {
            pdfPreviewModal.doc.save(pdfPreviewModal.fileName);
          }
        }}
      />

      {/* Modal Agregar / Editar Modelo de Producto */}
      <InventoryModelModal
        isOpen={modelModalData.isOpen}
        onClose={() => setModelModalData({ isOpen: false, itemKey: '', itemName: '', itemSap: '', model: null })}
        itemKey={modelModalData.itemKey}
        itemName={modelModalData.itemName}
        itemSap={modelModalData.itemSap}
        modelToEdit={modelModalData.model}
        onSave={handleSaveSubModel}
      />

      {/* Modal Configurar / Editar Stock Mínimo Crítico (Solo Admin) */}
      {minStockModalData.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '380px',
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1rem', color: '#0f172a' }}>
              Configurar Stock Mínimo Crítico
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#64748b' }}>
              {minStockModalData.itemName}
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Cantidad Mínima Requerida
              </label>
              <input
                type="number"
                min="0"
                value={minStockModalData.currentMin}
                onChange={(e) => setMinStockModalData({
                  ...minStockModalData,
                  currentMin: Math.max(0, parseInt(e.target.value) || 0)
                })}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}
                autoFocus
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '5px', display: 'block' }}>
                Si el stock total es inferior a este valor, se activará la alerta crítica de déficit.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMinStockModalData({ isOpen: false, itemKey: '', itemName: '', currentMin: 0 })}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#475569',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const updated = {
                    ...minStocksData,
                    [minStockModalData.itemKey]: minStockModalData.currentMin
                  };
                  await persistMinStocks(updated);
                  setMinStockModalData({ isOpen: false, itemKey: '', itemName: '', currentMin: 0 });
                }}
                style={{
                  padding: '0.5rem 1.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#f59e0b',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Guardar Mínimo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
