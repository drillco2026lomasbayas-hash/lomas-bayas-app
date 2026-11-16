import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { syncEngine, type SyncStatus } from './syncEngine';
import { Wifi, WifiOff, RefreshCw, User, LogOut, CheckCircle2, CloudUpload, AlertTriangle, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { AuthModal } from './AuthModal';

interface SyncStatusBarProps {
  onOpenPending?: () => void;
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({ onOpenPending }) => {
  const { user, profile, isOffline, signOut } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    error: null,
    isSupabasePaused: false,
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [showPausedModal, setShowPausedModal] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthMsg, setHealthMsg] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const handleManualSync = () => {
    if (!isOffline && !syncStatus.isSyncing) {
      if (syncStatus.isSupabasePaused) {
        setShowPausedModal(true);
      } else {
        syncEngine.syncAll();
      }
    }
  };

  const handleRetryConnection = async () => {
    setCheckingHealth(true);
    setHealthMsg(null);
    try {
      const health = await syncEngine.checkSupabaseHealth();
      if (health.isPaused) {
        setHealthMsg({
          text: 'El proyecto de Supabase sigue en pausa. Asegúrate de presionar "Restore project" en la consola de Supabase y esperar unos 60-90 segundos.',
          type: 'warning',
        });
      } else if (health.error) {
        setHealthMsg({
          text: `No se pudo conectar: ${health.error}`,
          type: 'error',
        });
      } else {
        setHealthMsg({
          text: '¡Conexión exitosa! El proyecto está activo. Iniciando sincronización de registros...',
          type: 'success',
        });
        await syncEngine.syncAll();
        setTimeout(() => {
          setShowPausedModal(false);
          setHealthMsg(null);
        }, 1800);
      }
    } catch (err: any) {
      setHealthMsg({
        text: `Error al verificar: ${err?.message || 'Error de red'}`,
        type: 'error',
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <>
      <div style={{
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        padding: '0.4rem 1rem',
        fontSize: '0.8rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        borderBottom: '1px solid #1e293b'
      }}>
        {/* Estado de Red y Sincronización */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: isOffline ? '#f59e0b' : '#10b981',
            fontWeight: 600
          }}>
            {isOffline ? <WifiOff size={14} /> : <Wifi size={14} />}
            <span>{isOffline ? 'Offline' : 'Online'}</span>
          </div>

          <div style={{ height: '12px', width: '1px', backgroundColor: '#334155' }} />

          {syncStatus.isSupabasePaused ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                onClick={() => setShowPausedModal(true)}
                title="Supabase está pausado por inactividad. Clic para ver detalles."
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 0 8px rgba(220, 38, 38, 0.45)'
                }}
              >
                <AlertTriangle size={13} />
                <span>Supabase Pausado ({syncStatus.pendingCount} seguro{syncStatus.pendingCount === 1 ? '' : 's'})</span>
              </button>
            </div>
          ) : syncStatus.isSyncing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#38bdf8' }}>
              <RefreshCw size={13} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              <span>Sincronizando con Supabase...</span>
            </div>
          ) : syncStatus.pendingCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                onClick={() => {
                  if (onOpenPending) {
                    onOpenPending();
                  } else {
                    handleManualSync();
                  }
                }}
                title={onOpenPending ? "Clic para ver o gestionar registros pendientes" : "Clic para sincronizar con Supabase"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: '#f59e0b',
                  color: '#1a252f',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <CloudUpload size={13} />
                <span>{syncStatus.pendingCount} pendiente{syncStatus.pendingCount > 1 ? 's' : ''}</span>
              </button>
              {!isOffline && (
                <button
                  onClick={handleManualSync}
                  title="Sincronizar ahora con Supabase"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.12)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    padding: '0.2rem 0.4rem',
                    cursor: 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  <RefreshCw size={11} />
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#94a3b8' }}>
              <CheckCircle2 size={13} color="#10b981" />
              <span>Todo al día</span>
            </div>
          )}
        </div>

        {/* Sección de Usuario / Autenticación */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                backgroundColor: '#1e293b',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}>
                <User size={12} color="#f2c12e" />
                <strong>{profile?.full_name || user.email?.split('@')[0]}</strong>
                <span style={{
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  marginLeft: '0.2rem'
                }}>
                  ({profile?.role || 'operador'})
                </span>
              </span>
              <button
                onClick={() => signOut()}
                title="Cerrar sesión"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '2px',
                  display: 'flex',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              style={{
                backgroundColor: '#f2c12e',
                color: '#1a252f',
                border: 'none',
                borderRadius: '6px',
                padding: '0.2rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <User size={13} />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </div>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Modal Informativo de Supabase Pausado */}
      {showPausedModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
            color: '#f8fafc'
          }}>
            {/* Header */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                  Base de Datos en Pausa (Supabase)
                </h3>
              </div>
              <button
                onClick={() => setShowPausedModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Banner de Seguridad de Datos */}
              <div style={{
                backgroundColor: 'rgba(5, 150, 105, 0.15)',
                border: '1px solid #059669',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start'
              }}>
                <ShieldCheck size={22} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#a7f3d0', fontSize: '0.88rem' }}>
                    Tus datos están 100% seguros y respaldados
                  </div>
                  <div style={{ color: '#d1fae5', fontSize: '0.8rem', marginTop: '3px', lineHeight: 1.4 }}>
                    Tienes <strong>{syncStatus.pendingCount} registro(s)</strong> almacenados en este dispositivo.
                    La aplicación nunca los borrará ni perderá: se sincronizarán tan pronto como el proyecto se reanude.
                  </div>
                </div>
              </div>

              {/* Explicación */}
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                En las cuentas gratuitas de Supabase, los servidores se ponen en <strong>pausa automática</strong> tras
                aproximadamente 7 a 14 días sin actividad para ahorrar recursos.
              </p>

              {/* Guía de Reactivación */}
              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                fontSize: '0.8rem',
                color: '#e2e8f0',
                border: '1px solid #334155'
              }}>
                <div style={{ fontWeight: 700, color: '#f2c12e', marginBottom: '0.4rem' }}>
                  ¿Cómo reactivar la base de datos? (Toma 1 minuto)
                </div>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: 1.4 }}>
                  <li>Ingresa a tu cuenta en <strong>supabase.com/dashboard</strong>.</li>
                  <li>Selecciona tu proyecto y haz clic en el botón <strong>"Restore project"</strong> (Reanudar).</li>
                  <li>Espera entre 1 y 2 minutos mientras el servidor se restablece.</li>
                  <li>Vuelve a esta ventana y pulsa <strong>"Reintentar Conexión"</strong>.</li>
                </ol>
              </div>

              {/* Mensaje de Estado / Resultado de Reintento */}
              {healthMsg && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  backgroundColor:
                    healthMsg.type === 'success' ? 'rgba(16, 185, 129, 0.2)' :
                    healthMsg.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  border: `1px solid ${
                    healthMsg.type === 'success' ? '#10b981' :
                    healthMsg.type === 'warning' ? '#f59e0b' : '#ef4444'
                  }`,
                  color:
                    healthMsg.type === 'success' ? '#6ee7b7' :
                    healthMsg.type === 'warning' ? '#fde68a' : '#fca5a5',
                  lineHeight: 1.4
                }}>
                  {healthMsg.text}
                </div>
              )}
            </div>

            {/* Footer con Acciones */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              borderTop: '1px solid #334155'
            }}>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.78rem',
                  color: '#38bdf8',
                  textDecoration: 'none',
                  fontWeight: 600,
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.1)'
                }}
              >
                <ExternalLink size={14} />
                <span>Ir a Supabase Dashboard</span>
              </a>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPausedModal(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={checkingHealth}
                  onClick={handleRetryConnection}
                  style={{
                    backgroundColor: '#10b981',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.4rem 0.9rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: checkingHealth ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    opacity: checkingHealth ? 0.7 : 1
                  }}
                >
                  <RefreshCw size={13} className={checkingHealth ? 'spin' : ''} style={checkingHealth ? { animation: 'spin 1s linear infinite' } : {}} />
                  <span>{checkingHealth ? 'Verificando...' : 'Reintentar Conexión'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
