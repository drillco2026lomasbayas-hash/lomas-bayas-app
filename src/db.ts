import Dexie, { type Table } from 'dexie';

export interface WellRecord {
  id?: number;
  type: 'well' | 'delay';
  wellNumber: string;
  meters?: number;
  startTime: string;
  endTime: string;
  terrain?: string;
  category?: string;
  timeMin: number;
  pulldown?: string;
  rpm?: string;
  observations: string;
}

export interface ShiftReport {
  id?: number;
  date: string;
  shift: string;
  drillNumber: string;
  operator: string;
  bench: string;
  phase: string;
  mesh: string;
  triconeBrand: string;
  triconeModel: string;
  triconeSerial: string;
  triconeDiameter: string;
  wells: WellRecord[];
  synced: number;
  createdAt: number;
}

export interface SteelChange {
  id?: number;
  date: string;
  drillNumber: string;
  shift: string;
  component: string;
  serialNumber: string;
  comments: string;
  synced: number;
  createdAt: number;
}

export interface SteelMeasurement {
  id?: number;
  date: string;
  shift: string;
  drillNumber: string;
  // Adaptador Inferior
  adaptadorInferiorMedio: number;
  // Barra Patera
  barraPateraSuperior: number;
  barraPateraMedio: number;
  barraPateraInferior: number;
  // Barras Seguidoras (hasta 5, las 3-5 son opcionales)
  barraSeguidora1Superior: number;
  barraSeguidora1Medio: number;
  barraSeguidora1Inferior: number;
  barraSeguidora2Superior: number;
  barraSeguidora2Medio: number;
  barraSeguidora2Inferior: number;
  // Barras 3, 4, 5 solo para perforadoras 8, 11, 14
  barraSeguidora3Superior?: number;
  barraSeguidora3Medio?: number;
  barraSeguidora3Inferior?: number;
  barraSeguidora4Superior?: number;
  barraSeguidora4Medio?: number;
  barraSeguidora4Inferior?: number;
  barraSeguidora5Superior?: number;
  barraSeguidora5Medio?: number;
  barraSeguidora5Inferior?: number;
  synced: number;
  createdAt: number;
}

export interface Event {
  id?: number;
  date: string;
  title: string;
  description: string;
  responsible: string;
  photo?: string;
  closed: number;
  synced: number;
  createdAt: number;
}

// Registro completo de inventario - un registro por fecha
export interface InventoryRecord {
  id?: number;
  date: string;
  observations?: Record<string, string>;
  // ROC 8,11 y 14
  roc_martPM62_central: number;
  roc_martPM62_mina: number;
  roc_bitQL6_central: number;
  roc_bitQL6_mina: number;
  roc_amortP68_central: number;
  roc_amortP68_mina: number;
  roc_adaptador114_central: number;
  roc_adaptador114_mina: number;
  roc_barras45_central: number;
  roc_barras45_mina: number;
  // TRICONOS
  tricono_10_central: number;
  tricono_10_mina: number;
  tricono_12_central: number;
  tricono_12_mina: number;
  // PV 05
  pv05_absorber_central: number;
  pv05_absorber_mina: number;
  pv05_adapter858_central: number;
  pv05_adapter858_mina: number;
  pv05_rod858_central: number;
  pv05_rod858_mina: number;
  pv05_adapter858_30_central: number;
  pv05_adapter858_30_mina: number;
  pv05_ring858_central: number;
  pv05_ring858_mina: number;
  // PE 6 Y 7 DE BAJA
  pe67_absorber_central: number;
  pe67_absorber_mina: number;
  pe67_adapter858_central: number;
  pe67_adapter858_mina: number;
  pe67_rod858_central: number;
  pe67_rod858_mina: number;
  pe67_adapter8625_central: number;
  pe67_adapter8625_mina: number;
  pe67_ring858_central: number;
  pe67_ring858_mina: number;
  // PE 9 Y 10
  pe910_amort_central: number;
  pe910_amort_mina: number;
  pe910_adapter1074_central: number;
  pe910_adapter1074_mina: number;
  pe910_rod1074_central: number;
  pe910_rod1074_mina: number;
  pe910_adapter1074_80_central: number;
  pe910_adapter1074_80_mina: number;
  pe910_ring1074_central: number;
  pe910_ring1074_mina: number;
  // PE 12 Y 13
  pe1213_absorber_central: number;
  pe1213_absorber_mina: number;
  pe1213_adapter_central: number;
  pe1213_adapter_mina: number;
  pe1213_bushing_central: number;
  pe1213_bushing_mina: number;
  pe1213_triconeAdapter_central: number;
  pe1213_triconeAdapter_mina: number;
  pe1213_deckBushing_central: number;
  pe1213_deckBushing_mina: number;
  synced: number;
  createdAt: number;
}

// Registro de eliminaciones pendientes (para sincronizar cuando vuelva conexión)
export interface PendingDeletion {
  id?: number;
  type: 'event'; // Puede extenderse a otros tipos en el futuro
  recordId: number; // ID del registro a eliminar
  recordTitle: string; // Para referencia
  createdAt: number;
  synced: number;
}

// Registro de descarte de aceros
export interface SteelDiscard {
  id?: number;
  date: string;
  serie: string;
  equipo: string;
  diametro: string;
  fechaPostura: string;
  fechaDescarte: string;
  tipoAcero: 'Bit' | 'Martillo' | 'Tricono';
  causaDescarte: string;
  metros: number;
  terreno: 'Blando' | 'Medio' | 'Duro';
  // Campos específicos de Bit
  medidaEntreInsertos?: string;
  medidaMatriz?: string;
  fotoSerie?: string;
  fotoCuerpo?: string;
  fotoBotones?: string;
  // Campos específicos de Martillo
  diametroCulata?: string;
  diametroPortabit?: string;
  // Campos específicos de Tricono (9 fotos con observaciones)
  fotoCuerpoFaldon1?: string;
  obsCuerpoFaldon1?: string;
  fotoCuerpoFaldon2?: string;
  obsCuerpoFaldon2?: string;
  fotoCuerpoFaldon3?: string;
  obsCuerpoFaldon3?: string;
  fotoCono1?: string;
  obsCono1?: string;
  fotoCono2?: string;
  obsCono2?: string;
  fotoCono3?: string;
  obsCono3?: string;
  fotoNozzles?: string;
  obsNozzles?: string;
  fotoConos?: string;
  obsConos?: string;
  obsSerie?: string;
  synced: number;
  createdAt: number;
}

export class LomasBayasDB extends Dexie {
  reports!: Table<ShiftReport>;
  steelChanges!: Table<SteelChange>;
  steelMeasurements!: Table<SteelMeasurement>;
  events!: Table<Event>;
  inventoryRecords!: Table<InventoryRecord>;
  pendingDeletions!: Table<PendingDeletion>;
  steelDiscards!: Table<SteelDiscard>;

  constructor() {
    super('LomasBayasDB');
    this.version(8).stores({
      reports: '++id, date, synced, createdAt',
      steelChanges: '++id, date, synced, createdAt',
      steelMeasurements: '++id, date, synced, createdAt',
      events: '++id, date, closed, synced, createdAt',
      inventoryRecords: '++id, date, synced, createdAt',
      pendingDeletions: '++id, type, recordId, synced, createdAt',
      steelDiscards: '++id, date, tipoAcero, synced, createdAt'
    });
  }
}

export const db = new LomasBayasDB();

