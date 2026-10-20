import { db } from './db';
import { supabase } from './supabaseClient';

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  error: string | null;
}

type SyncListener = (status: SyncStatus) => void;

class SyncEngine {
  private isSyncing = false;
  private listeners: Set<SyncListener> = new Set();
  private lastSyncTime: Date | null = null;
  private lastError: string | null = null;
  private autoSyncInterval: any = null;

  constructor() {
    // Escuchar cuando el dispositivo vuelve a tener conexión
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 Conexión restaurada. Iniciando sincronización...');
        this.syncAll();
      });

      // Auto-sync cada 60 segundos si hay conexión
      this.autoSyncInterval = setInterval(() => {
        if (navigator.onLine && !this.isSyncing) {
          this.syncAll();
        }
      }, 60000);
    }
  }

  public stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  public subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    this.emitStatus();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async emitStatus() {
    const pendingCount = await this.getPendingCount();
    const status: SyncStatus = {
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      error: this.lastError,
    };
    this.listeners.forEach((l) => l(status));
  }

  // Cuenta cuántos registros locales están pendientes de sincronizar
  public async getPendingCount(): Promise<number> {
    try {
      const [r, sc, sm, ev, inv, disc, chk, del] = await Promise.all([
        db.reports.where('synced').equals(0).count(),
        db.steelChanges.where('synced').equals(0).count(),
        db.steelMeasurements.where('synced').equals(0).count(),
        db.events.where('synced').equals(0).count(),
        db.inventoryRecords.where('synced').equals(0).count(),
        db.steelDiscards.where('synced').equals(0).count(),
        db.checklists.where('synced').equals(0).count(),
        db.pendingDeletions.where('synced').equals(0).count(),
      ]);
      return r + sc + sm + ev + inv + disc + chk + del;
    } catch {
      return 0;
    }
  }

  // Sube una imagen base64 al bucket de Supabase Storage
  private async uploadBase64Image(base64Data: string, folder: string): Promise<string | null> {
    try {
      if (!base64Data || !base64Data.startsWith('data:image')) {
        return base64Data; // Ya es una URL remota
      }
      const match = base64Data.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) return null;
      const mimeType = match[1];
      const byteCharacters = atob(match[2]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      const ext = mimeType.split('/')[1] || 'jpg';
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

      const { data, error } = await supabase.storage
        .from('lomasbayas-media')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        console.error('Error subiendo imagen a Supabase Storage:', error);
        return null;
      }

      const { data: publicUrlData } = supabase.storage
        .from('lomasbayas-media')
        .getPublicUrl(data.path);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error('Error procesando imagen para storage:', err);
      return null;
    }
  }

  // Sincronización completa (Push pendientes + Pull novedades)
  public async syncAll(): Promise<boolean> {
    if (!navigator.onLine || this.isSyncing) return false;

    this.isSyncing = true;
    this.lastError = null;
    this.emitStatus();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      // 1. Sincronizar REPORTES DE TURNO
      const pendingReports = await db.reports.where('synced').equals(0).toArray();
      for (const r of pendingReports) {
        const payload = {
          id: String(r.id || `rep_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
          date: r.date,
          shift: r.shift,
          drill_number: r.drillNumber,
          operator: r.operator,
          bench: r.bench,
          phase: r.phase,
          mesh: r.mesh,
          tricone_brand: r.triconeBrand,
          tricone_model: r.triconeModel,
          tricone_serial: r.triconeSerial,
          tricone_diameter: r.triconeDiameter,
          wells: r.wells,
          user_id: userId,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('shift_reports').upsert(payload);
        if (!error && r.id) {
          await db.reports.update(r.id, { synced: 1 });
        }
      }

      // 2. Sincronizar CAMBIO DE ACEROS
      const pendingSteelChanges = await db.steelChanges.where('synced').equals(0).toArray();
      for (const sc of pendingSteelChanges) {
        const payload = {
          id: String(sc.id || `sc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
          date: sc.date,
          drill_number: sc.drillNumber,
          shift: sc.shift,
          component: sc.component,
          serial_number: sc.serialNumber,
          comments: sc.comments,
          user_id: userId,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('steel_changes').upsert(payload);
        if (!error && sc.id) {
          await db.steelChanges.update(sc.id, { synced: 1 });
        }
      }

      // 3. Sincronizar MEDICIONES DE ACEROS
      const pendingSteelMeasurements = await db.steelMeasurements.where('synced').equals(0).toArray();
      for (const sm of pendingSteelMeasurements) {
        const payload = {
          id: String(sm.id || `sm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
          date: sm.date,
          shift: sm.shift,
          drill_number: sm.drillNumber,
          adaptador_inferior_medio: sm.adaptadorInferiorMedio,
          barra_patera_superior: sm.barraPateraSuperior,
          barra_patera_medio: sm.barraPateraMedio,
          barra_patera_inferior: sm.barraPateraInferior,
          barra_seguidora1_superior: sm.barraSeguidora1Superior,
          barra_seguidora1_medio: sm.barraSeguidora1Medio,
          barra_seguidora1_inferior: sm.barraSeguidora1Inferior,
          barra_seguidora2_superior: sm.barraSeguidora2Superior,
          barra_seguidora2_medio: sm.barraSeguidora2Medio,
          barra_seguidora2_inferior: sm.barraSeguidora2Inferior,
          barra_seguidora3_superior: sm.barraSeguidora3Superior,
          barra_seguidora3_medio: sm.barraSeguidora3Medio,
          barra_seguidora3_inferior: sm.barraSeguidora3Inferior,
          barra_seguidora4_superior: sm.barraSeguidora4Superior,
          barra_seguidora4_medio: sm.barraSeguidora4Medio,
          barra_seguidora4_inferior: sm.barraSeguidora4Inferior,
          barra_seguidora5_superior: sm.barraSeguidora5Superior,
          barra_seguidora5_medio: sm.barraSeguidora5Medio,
          barra_seguidora5_inferior: sm.barraSeguidora5Inferior,
          comentarios: sm.comentarios,
          user_id: userId,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('steel_measurements').upsert(payload);
        if (!error && sm.id) {
          await db.steelMeasurements.update(sm.id, { synced: 1 });
        }
      }

      // 4. Sincronizar EVENTOS / HALLAZGOS
      const pendingEvents = await db.events.where('synced').equals(0).toArray();
      for (const ev of pendingEvents) {
        let photoUrl = ev.photo || null;
        if (photoUrl && photoUrl.startsWith('data:image')) {
          const uploadedUrl = await this.uploadBase64Image(photoUrl, 'eventos');
          if (uploadedUrl) {
            photoUrl = uploadedUrl;
            if (ev.id) await db.events.update(ev.id, { photo: uploadedUrl });
          }
        }

        const payload = {
          id: String(ev.id || `ev_${Date.now()}`),
          date: ev.date,
          title: ev.title,
          description: ev.description,
          responsible: ev.responsible,
          photo_url: photoUrl,
          closed: ev.closed,
          user_id: userId,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('events').upsert(payload);
        if (!error && ev.id) {
          await db.events.update(ev.id, { synced: 1 });
        }
      }

      // 5. Sincronizar ELIMINACIONES PENDIENTES
      const pendingDeletions = await db.pendingDeletions.where('synced').equals(0).toArray();
      for (const del of pendingDeletions) {
        if (del.type === 'event') {
          const { error } = await supabase.from('events').delete().eq('id', String(del.recordId));
          if (!error && del.id) {
            await db.pendingDeletions.delete(del.id);
          }
        }
      }

      // 6. Sincronizar INVENTARIO
      const pendingInventory = await db.inventoryRecords.where('synced').equals(0).toArray();
      for (const inv of pendingInventory) {
        const { id, date, observations, synced, createdAt, ...stockData } = inv;
        const payload = {
          id: String(id || `inv_${date}`),
          date: date,
          observations: observations || {},
          stock_data: stockData,
          user_id: userId,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('inventory_records').upsert(payload);
        if (!error && id) {
          await db.inventoryRecords.update(id, { synced: 1 });
        }
      }

      // 7. Sincronizar DESCARTE DE ACEROS
      const pendingDiscards = await db.steelDiscards.where('synced').equals(0).toArray();
      for (const d of pendingDiscards) {
        // Subir fotos pendientes si vienen en base64
        const photosPayload: Record<string, string> = {};
        for (const [key, val] of Object.entries(d)) {
          if (key.startsWith('foto') && typeof val === 'string' && val.startsWith('data:image')) {
            const upUrl = await this.uploadBase64Image(val, 'descartes');
            if (upUrl) photosPayload[key] = upUrl;
          } else if (key.startsWith('foto') && typeof val === 'string') {
            photosPayload[key] = val;
          }
        }

        const payload = {
          id: String(d.id || `disc_${Date.now()}`),
          date: d.date,
          serie: d.serie,
          equipo: d.equipo,
          diametro: d.diametro,
          fecha_postura: d.fechaPostura,
          fecha_descarte: d.fechaDescarte,
          tipo_acero: d.tipoAcero,
          causa_descarte: d.causaDescarte,
          metros: d.metros,
          terreno: d.terreno,
          photos: photosPayload,
          user_id: userId,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('steel_discards').upsert(payload);
        if (!error && d.id) {
          await db.steelDiscards.update(d.id, { synced: 1 });
        }
      }

      // 8. Sincronizar CHECKLISTS
      const pendingChecklists = await db.checklists.where('synced').equals(0).toArray();
      for (const chk of pendingChecklists) {
        const payload = {
          id: String(chk.id || `chk_${Date.now()}`),
          type: chk.type,
          date: chk.date,
          horometro: chk.horometro,
          operador: chk.operador,
          perforadora: chk.perforadora,
          cantidad_aceros: chk.cantidadAceros,
          obs_aceros: chk.obsAceros,
          items: chk.items || {},
          user_id: userId,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('checklists').upsert(payload);
        if (!error && chk.id) {
          await db.checklists.update(chk.id, { synced: 1 });
        }
      }

      // 9. DESCARGA / PULL DE NOVEDADES REMOTAS (por ejemplo, eventos creados por otros)
      try {
        const { data: remoteEvents } = await supabase
          .from('events')
          .select('*')
          .order('date', { ascending: false })
          .limit(100);

        if (remoteEvents && remoteEvents.length > 0) {
          for (const rev of remoteEvents) {
            const numericId = parseInt(rev.id, 10);
            if (!isNaN(numericId)) {
              const localExisting = await db.events.get(numericId);
              if (!localExisting) {
                await db.events.put({
                  id: numericId,
                  date: rev.date,
                  title: rev.title,
                  description: rev.description || '',
                  responsible: rev.responsible || '',
                  photo: rev.photo_url || undefined,
                  closed: rev.closed || 0,
                  synced: 1,
                  createdAt: new Date(rev.created_at).getTime(),
                });
              }
            }
          }
        }
      } catch (pullErr) {
        console.warn('Pull de eventos remotos omitido:', pullErr);
      }

      this.lastSyncTime = new Date();
      return true;
    } catch (err: any) {
      console.error('Error durante la sincronización con Supabase:', err);
      this.lastError = err?.message || 'Error de sincronización';
      return false;
    } finally {
      this.isSyncing = false;
      this.emitStatus();
    }
  }
}

export const syncEngine = new SyncEngine();
