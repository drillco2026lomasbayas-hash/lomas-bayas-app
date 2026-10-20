import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { LogIn, UserPlus, Shield, X, WifiOff, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp, isOffline } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'operador' | 'tecnico' | 'analista' | 'admin'>('operador');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message === 'Invalid login credentials' 
            ? 'Credenciales incorrectas. Verifica correo y contraseña.' 
            : error.message);
        } else {
          onClose();
        }
      } else {
        if (!fullName.trim()) {
          setError('Ingresa tu nombre completo.');
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName, role);
        if (error) {
          setError(error.message);
        } else {
          setSuccessMsg('Registro exitoso. Si Supabase requiere confirmación de correo, revisa tu bandeja de entrada o inicia sesión.');
          setMode('login');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Encabezado */}
        <div style={{
          backgroundColor: '#1a252f',
          color: '#ffffff',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              backgroundColor: '#f2c12e',
              color: '#1a252f',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex'
            }}>
              <Shield size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Lomas Bayas - Supabase Auth
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Alerta Offline */}
        {isOffline && (
          <div style={{
            backgroundColor: '#fffbeb',
            color: '#b45309',
            padding: '0.75rem 1rem',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            borderBottom: '1px solid #fef3c7'
          }}>
            <WifiOff size={16} />
            <span>Modo sin conexión. Si ya iniciaste sesión antes, tu acceso sigue activo.</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem'
            }}>
              {successMsg}
            </div>
          )}

          {mode === 'register' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#334155' }}>
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#334155' }}>
                  Rol / Perfil
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="operador">Operador (Terreno / Perforación)</option>
                  <option value="tecnico">Técnico (Mediciones y Control)</option>
                  <option value="analista">Analista (Reportes y Eventos)</option>
                  <option value="admin">Administrador (Control Total)</option>
                </select>
              </div>
            </>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#334155' }}>
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              placeholder="usuario@drillco.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#334155' }}>
              Contraseña
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: '#f2c12e',
              color: '#1a252f',
              fontWeight: 700,
              fontSize: '1rem',
              padding: '0.75rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              opacity: loading ? 0.7 : 1,
              transition: 'background-color 0.2s'
            }}
          >
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            <span>{loading ? 'Procesando...' : (mode === 'login' ? 'Ingresar' : 'Registrarse')}</span>
          </button>

          {/* Toggle entre Login y Register */}
          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
            {mode === 'login' ? (
              <span>
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null); }}
                  style={{
                    background: 'none',
                    color: '#2563eb',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Registrarse aquí
                </button>
              </span>
            ) : (
              <span>
                ¿Ya tienes una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  style={{
                    background: 'none',
                    color: '#2563eb',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Inicia sesión
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
