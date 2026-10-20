import React, { useState } from 'react';
import { useAuth, type UserProfile } from './AuthContext';
import { LogIn, Eye, EyeOff, Wifi, WifiOff, AlertCircle, Shield, HardHat } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { signIn, isOffline, enterOfflineGuest } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Modo contingencia offline
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestRole, setGuestRole] = useState<UserProfile['role']>('operador');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Por favor ingresa tu usuario y contraseña.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await signIn(identifier, password);
      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Usuario o contraseña incorrectos.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Esta cuenta está pendiente de confirmación en Supabase.');
        } else {
          setError(signInError.message);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    enterOfflineGuest(guestName.trim(), guestRole);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      backgroundImage: 'radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Logos y Título */}
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
        maxWidth: '420px',
        width: '100%'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          marginBottom: '1.25rem'
        }}>
          <img
            src="/drillco.png"
            alt="Drillco"
            style={{ height: '38px', objectFit: 'contain' }}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <div style={{ width: '1px', height: '28px', backgroundColor: '#334155' }} />
          <img
            src="/lomasbayas.png"
            alt="Lomas Bayas"
            style={{ height: '34px', objectFit: 'contain' }}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>

        <h1 style={{
          fontSize: '1.4rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
          color: '#ffffff',
          textTransform: 'uppercase',
          margin: 0
        }}>
          Área Técnica
        </h1>
        <p style={{
          color: '#94a3b8',
          fontSize: '0.85rem',
          marginTop: '0.25rem'
        }}>
          Faena Minera Lomas Bayas - Control Operacional
        </p>

        {/* Indicador de Conexión */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          marginTop: '0.75rem',
          backgroundColor: isOffline ? '#451a03' : '#064e3b',
          color: isOffline ? '#f59e0b' : '#34d399',
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          border: `1px solid ${isOffline ? '#b45309' : '#059669'}`
        }}>
          {isOffline ? <WifiOff size={13} /> : <Wifi size={13} />}
          <span>{isOffline ? 'Modo Sin Conexión (Offline)' : 'Conectado a Supabase'}</span>
        </div>
      </div>

      {/* Tarjeta de Ingreso */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '16px',
        padding: '2rem',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
          <div style={{
            backgroundColor: '#f2c12e',
            color: '#0f172a',
            padding: '0.45rem',
            borderRadius: '8px',
            display: 'flex'
          }}>
            <Shield size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Iniciar Sesión
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Ingresa con tu usuario o correo asignado
            </span>
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#450a0a',
            border: '1px solid #991b1b',
            color: '#fca5a5',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Usuario */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#cbd5e1',
              marginBottom: '0.4rem'
            }}>
              Usuario o Correo
            </label>
            <input
              type="text"
              autoFocus
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Ej: drillcoadmin o applomas"
              style={{
                width: '100%',
                padding: '0.75rem 0.9rem',
                backgroundColor: '#0f172a',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#cbd5e1',
              marginBottom: '0.4rem'
            }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem 2.5rem 0.75rem 0.9rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Botón Ingresar */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: '#f2c12e',
              color: '#0f172a',
              fontWeight: 700,
              fontSize: '1rem',
              padding: '0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 6px -1px rgba(242, 193, 46, 0.2)',
              transition: 'all 0.15s ease'
            }}
          >
            <LogIn size={18} />
            <span>{loading ? 'Verificando...' : 'Ingresar al Sistema'}</span>
          </button>
        </form>

        {/* Acceso de emergencia fuera de línea */}
        {isOffline && (
          <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={() => setShowOfflineModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#f59e0b',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                textDecoration: 'underline'
              }}
            >
              <HardHat size={14} />
              <span>Ingreso rápido de emergencia (Sin Conexión)</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal Ingreso Emergencia Fuera de Línea */}
      {showOfflineModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '14px',
            padding: '1.5rem',
            maxWidth: '380px',
            width: '100%',
            border: '1px solid #475569'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b', margin: '0 0 0.5rem 0' }}>
              Modo Contingencia en Terreno
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Permite registrar datos en IndexedDB sin internet. Se sincronizarán automáticamente al regresar a la oficina o zona con cobertura.
            </p>
            <form onSubmit={handleGuestSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Nombre del Operador / Técnico
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pedro González"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Rol de Trabajo
                </label>
                <select
                  value={guestRole}
                  onChange={(e) => setGuestRole(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="operador">Operador (Terreno)</option>
                  <option value="tecnico">Técnico de Aceros</option>
                  <option value="analista">Analista Operacional</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowOfflineModal(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#334155',
                    color: '#e2e8f0',
                    border: 'none',
                    padding: '0.65rem',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    backgroundColor: '#f59e0b',
                    color: '#0f172a',
                    fontWeight: 700,
                    border: 'none',
                    padding: '0.65rem',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Continuar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
