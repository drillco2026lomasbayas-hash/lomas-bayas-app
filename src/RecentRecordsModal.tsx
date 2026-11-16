import React, { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle2, Clock, ClipboardList, HardHat, Activity, Trash2, Calendar, ClipboardCheck, AlertTriangle, Package } from 'lucide-react';
import { db } from './db';
import { formatDateSafe } from './utils/dateUtils';
import { syncEngine } from './syncEngine';

interface RecentItem {
  id: string;
  rawId: number;
  type: 'report' | 'steelChange' | 'steelMeasurement' | 'discard' | 'checklist' | 'event' | 'inventory';
  title: string;
  subtitle: string;
  date: string;
  timestamp: number;
  synced: boolean;
}

interface RecentRecordsModalProps {
  onClose: () => void;
  isOnline: boolean;
  onSyncTriggered?: () => void;
}

export const RecentRecordsModal: React.FC<RecentRecordsModalProps> = ({
  onClose,
  isOnline,
  onSyncTriggered,
}) => {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [itemToDelete, setItemToDelete] = useState<RecentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRecentRecords = async () => {
    setLoading(true);
    try {
      const records: RecentItem[] = [];

      // 1. Reportes de turno
      const reports = await db.reports.orderBy('id').reverse().limit(25).toArray();
      reports.forEach(r => {
        const totalMeters = Array.isArray(r.wells)
          ? r.wells.filter(w => w.type === 'well').reduce((s, w) => s + (Number(w.meters) || 0), 0)
          : 0;
        records.push({
          id: `rep_${r.id}`,
          rawId: r.id!,
          type: 'report',
          title: `Reporte Turno - P${r.drillNumber || 'N/A'} (${r.shift || ''})`,
          subtitle: `Op: ${r.operator || 'S/N'} • ${totalMeters.toFixed(1)}m perforados • ${r.wells?.length || 0} registros`,
          date: r.date,
          timestamp: r.createdAt || Date.now(),
          synced: r.synced === 1,
        });
      });

      // 2. Cambios de aceros
      const changes = await db.steelChanges.orderBy('id').reverse().limit(25).toArray();
      changes.forEach(sc => {
        records.push({
          id: `sc_${sc.id}`,
          rawId: sc.id!,
          type: 'steelChange',
          title: `Cambio Acero - P${sc.drillNumber || 'N/A'}`,
          subtitle: `${sc.component || ''} • Serie: ${sc.serialNumber || 'S/N'} • ${sc.shift}`,
          date: sc.date,
          timestamp: sc.createdAt || Date.now(),
          synced: sc.synced === 1,
        });
      });

      // 3. Mediciones de aceros
      const measurements = await db.steelMeasurements.orderBy('id').reverse().limit(25).toArray();
      measurements.forEach(sm => {
        records.push({
          id: `sm_${sm.id}`,
          rawId: sm.id!,
          type: 'steelMeasurement',
          title: `Medición Diámetros - P${sm.drillNumber || 'N/A'}`,
          subtitle: `Turno ${sm.shift || ''} • Adaptador/Mart: ${sm.adaptadorInferiorMedio || 0}mm`,
          date: sm.date,
          timestamp: sm.createdAt || Date.now(),
          synced: sm.synced === 1,
        });
      });

      // 4. Descartes
      const discards = await db.steelDiscards.orderBy('id').reverse().limit(25).toArray();
      discards.forEach(d => {
        records.push({
          id: `disc_${d.id}`,
          rawId: d.id!,
          type: 'discard',
          title: `Descarte ${d.tipoAcero} - ${d.equipo || 'Equipo N/A'}`,
          subtitle: `Serie: ${d.serie || 'S/N'} • ${d.metros || 0}m • Causa: ${d.causaDescarte || 'N/A'}`,
          date: d.date,
          timestamp: d.createdAt || Date.now(),
          synced: d.synced === 1,
        });
      });

      // 5. Checklists
      const checklists = await db.checklists.orderBy('id').reverse().limit(25).toArray();
      checklists.forEach(chk => {
        records.push({
          id: `chk_${chk.id}`,
          rawId: chk.id!,
          type: 'checklist',
          title: `Checklist ${chk.type} - P${chk.perforadora}`,
          subtitle: `Op: ${chk.operador || 'S/N'} • Horómetro: ${chk.horometro || '0'}`,
          date: chk.date,
          timestamp: chk.createdAt || Date.now(),
          synced: chk.synced === 1,
        });
      });

      // 6. Eventos
      const events = await db.events.orderBy('id').reverse().limit(25).toArray();
      events.forEach(ev => {
        records.push({
          id: `ev_${ev.id}`,
          rawId: ev.id!,
          type: 'event',
          title: `Evento: ${ev.title}`,
          subtitle: `Resp: ${ev.responsible} • ${ev.description.substring(0, 50)}...`,
          date: ev.date,
          timestamp: ev.createdAt || Date.now(),
          synced: ev.synced === 1,
        });
      });

      // 7. Inventarios
      const inventories = await db.inventoryRecords.orderBy('id').reverse().limit(25).toArray();
      inventories.forEach(inv => {
        records.push({
          id: `inv_${inv.id}`,
          rawId: inv.id!,
          type: 'inventory',
          title: `Inventario de Bodegas`,
          subtitle: `Registro de existencias Central y Mina`,
          date: inv.date,
          timestamp: inv.createdAt || Date.now(),
          synced: inv.synced === 1,
        });
      });

      // Ordenar todo por timestamp descendente
      records.sort((a, b) => b.timestamp - a.timestamp);
      setItems(records);
    } catch (err) {
      console.error('Error cargando registros recientes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecentRecords();
  }, []);

  const handleManualSync = async () => {
    if (!navigator.onLine) {
      alert('Sin conexión a internet. Los registros se sincronizarán automáticamente al detectar red.');
      return;
    }
    setSyncing(true);
    try {
      const ok = await syncEngine.syncAll();
      if (!ok) {
        const health = await syncEngine.checkSupabaseHealth();
        if (health.isPaused) {
          alert('⚠️ Tu base de datos de Supabase está pausada por inactividad.\n\n🛡️ ¡Tus datos NO se perderán! Están guardados de forma 100% segura en la memoria de este dispositivo.\n\nPara reactivar el proyecto, ingresa a supabase.com/dashboard y haz clic en "Restore project".');
        }
      }
      if (onSyncTriggered) onSyncTriggered();
      await loadRecentRecords();
    } catch (err) {
      console.error('Error al sincronizar:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      switch (itemToDelete.type) {
        case 'report':
          await db.reports.delete(itemToDelete.rawId);
          break;
        case 'steelChange':
          await db.steelChanges.delete(itemToDelete.rawId);
          break;
        case 'steelMeasurement':
          await db.steelMeasurements.delete(itemToDelete.rawId);
          break;
        case 'discard':
          await db.steelDiscards.delete(itemToDelete.rawId);
          break;
        case 'checklist':
          await db.checklists.delete(itemToDelete.rawId);
          break;
        case 'event':
          await db.events.delete(itemToDelete.rawId);
          break;
        case 'inventory':
          await db.inventoryRecords.delete(itemToDelete.rawId);
          break;
      }

      await syncEngine.refreshStatus();
      if (onSyncTriggered) {
        onSyncTriggered();
      }

      setItemToDelete(null);
      await loadRecentRecords();
    } catch (err) {
      console.error('Error eliminando registro pendiente:', err);
      alert('Error al eliminar el registro pendiente.');
    } finally {
      setDeleting(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'report':
        return <ClipboardList size={18} color="#007aff" />;
      case 'steelChange':
        return <HardHat size={18} color="#ff9500" />;
      case 'steelMeasurement':
        return <Activity size={18} color="#5856d6" />;
      case 'discard':
        return <Trash2 size={18} color="#ff3b30" />;
      case 'checklist':
        return <ClipboardCheck size={18} color="#34c759" />;
      case 'event':
        return <Calendar size={18} color="#af52de" />;
      case 'inventory':
        return <Package size={18} color="#eab308" />;
      default:
        return <Activity size={18} />;
    }
  };

  const filteredItems = filterType === 'ALL'
    ? items
    : filterType === 'PENDING'
      ? items.filter(i => !i.synced)
      : items.filter(i => i.type === filterType);

  const pendingCount = items.filter(i => !i.synced).length;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.2rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0b2b45',
          color: '#ffffff'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
              📋 Historial de Registros en Dispositivo
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {pendingCount > 0
                ? `${pendingCount} registro(s) pendiente(s) de sincronizar`
                : 'Todos los registros están sincronizados en la nube'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Filtros rápidos */}
        <div style={{
          padding: '0.6rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0'
        }}>
          {[
            { key: 'ALL', label: 'Todos' },
            { key: 'PENDING', label: `Pendientes (${pendingCount})` },
            { key: 'report', label: 'Reportes' },
            { key: 'steelChange', label: 'Cambios' },
            { key: 'steelMeasurement', label: 'Mediciones' },
            { key: 'checklist', label: 'Checklists' },
            { key: 'discard', label: 'Descartes' },
            { key: 'event', label: 'Eventos' },
            { key: 'inventory', label: 'Inventario' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key)}
              style={{
                padding: '0.3rem 0.7rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: filterType === f.key ? 'none' : '1px solid #cbd5e1',
                background: filterType === f.key ? '#0b2b45' : '#ffffff',
                color: filterType === f.key ? '#ffffff' : '#475569',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista de Registros */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              Cargando registros locales...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              No hay registros para mostrar con el filtro actual.
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: item.synced ? '#ffffff' : '#fffbeb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                  <div style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {getIcon(item.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.subtitle}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                      {formatDateSafe(item.date)}
                    </div>
                  </div>
                </div>

                {/* Badge de Sincronización y Botón Eliminar Pendiente */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {item.synced ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#dcfce7',
                      color: '#166534',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.55rem',
                      borderRadius: '9999px',
                      whiteSpace: 'nowrap'
                    }}>
                      <CheckCircle2 size={12} />
                      Sincronizado
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#fef3c7',
                      color: '#b45309',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.55rem',
                      borderRadius: '9999px',
                      whiteSpace: 'nowrap'
                    }}>
                      <Clock size={12} />
                      Pendiente
                    </span>
                  )}

                  {/* Botón Eliminar Archivo/Registro Pendiente de Subida */}
                  {!item.synced && (
                    <button
                      onClick={() => setItemToDelete(item)}
                      style={{
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.15s ease'
                      }}
                      title="Eliminar este registro pendiente de subida"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal de confirmación para eliminar archivo/registro pendiente */}
        {itemToDelete && (
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
            zIndex: 100000,
            padding: '1rem',
            boxSizing: 'border-box'
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '430px',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>
                    ¿Eliminar registro pendiente?
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Confirmación de eliminación local
                  </span>
                </div>
              </div>

              <div style={{
                background: '#f8fafc',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                border: '1px solid #e2e8f0',
                fontSize: '0.82rem'
              }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>
                  {itemToDelete.title}
                </div>
                <div style={{ color: '#64748b', fontSize: '0.76rem' }}>
                  {itemToDelete.subtitle}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '4px' }}>
                  Fecha: {formatDateSafe(itemToDelete.date)}
                </div>
              </div>

              <p style={{
                margin: 0,
                fontSize: '0.8rem',
                color: '#b91c1c',
                background: '#fef2f2',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #fecaca',
                lineHeight: 1.4
              }}>
                ⚠️ <strong>Atención:</strong> Este registro aún no ha sido sincronizado a la nube. Al eliminarlo, se borrará definitivamente de este dispositivo y se cancelará su subida.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  onClick={() => setItemToDelete(null)}
                  disabled={deleting}
                  style={{
                    padding: '0.55rem 1rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: deleting ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  style={{
                    padding: '0.55rem 1.25rem',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#dc2626',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={15} />
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '0.9rem 1.2rem',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <button
            onClick={handleManualSync}
            disabled={syncing || !isOnline}
            style={{
              background: isOnline ? '#0b2b45' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: isOnline && !syncing ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Todo'}
          </button>

          <button
            onClick={onClose}
            style={{
              background: '#e2e8f0',
              color: '#334155',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
