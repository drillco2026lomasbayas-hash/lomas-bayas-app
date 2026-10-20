import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { syncEngine, type SyncStatus } from './syncEngine';
import { Wifi, WifiOff, RefreshCw, User, LogOut, CheckCircle2, CloudUpload } from 'lucide-react';
import { AuthModal } from './AuthModal';

export const SyncStatusBar: React.FC = () => {
  const { user, profile, isOffline, signOut } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    error: null,
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const handleManualSync = () => {
    if (!isOffline && !syncStatus.isSyncing) {
      syncEngine.syncAll();
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

          {syncStatus.isSyncing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#38bdf8' }}>
              <RefreshCw size={13} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              <span>Sincronizando con Supabase...</span>
            </div>
          ) : syncStatus.pendingCount > 0 ? (
            <button
              onClick={handleManualSync}
              disabled={isOffline}
              title="Clic para sincronizar con Supabase"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: isOffline ? '#334155' : '#f59e0b',
                color: isOffline ? '#94a3b8' : '#1a252f',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                cursor: isOffline ? 'not-allowed' : 'pointer'
              }}
            >
              <CloudUpload size={13} />
              <span>{syncStatus.pendingCount} pendiente{syncStatus.pendingCount > 1 ? 's' : ''}</span>
            </button>
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
    </>
  );
};
