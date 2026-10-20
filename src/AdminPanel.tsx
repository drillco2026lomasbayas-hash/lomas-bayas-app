import React, { useEffect, useState } from 'react';
import { useAuth, type UserProfile } from './AuthContext';
import { supabase } from './supabaseClient';
import { Users, UserPlus, Shield, ArrowLeft, RefreshCw, CheckCircle, AlertCircle, Key, UserCheck } from 'lucide-react';

interface AdminPanelProps {
  onBack: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const { profile, createManagedUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Formulario nueva cuenta
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserProfile['role']>('operador');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setUsers(data as UserProfile[]);
      }
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!newUsername.trim() || !newPassword || !newFullName.trim()) {
      setFormError('Todos los campos son obligatorios');
      return;
    }

    if (newPassword.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setFormLoading(true);

    try {
      const result = await createManagedUser(newUsername.trim(), newPassword, newFullName.trim(), newRole);
      if (!result.success) {
        setFormError(result.error || 'Error creando la cuenta');
      } else {
        setFormSuccess(`Cuenta "${newUsername.trim()}" creada exitosamente.`);
        setNewUsername('');
        setNewFullName('');
        setNewPassword('');
        setNewRole('operador');
        fetchUsers();
        setTimeout(() => {
          setIsModalOpen(false);
          setFormSuccess(null);
        }, 1500);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Error inesperado al crear cuenta');
    } finally {
      setFormLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return { bg: '#4c1d95', text: '#ddd6fe', label: 'Administrador' };
      case 'tecnico':
        return { bg: '#065f46', text: '#a7f3d0', label: 'Técnico' };
      case 'analista':
        return { bg: '#1e40af', text: '#bfdbfe', label: 'Analista' };
      default:
        return { bg: '#854d0e', text: '#fef08a', label: 'Operador' };
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ffffff' }}>
        <h2>Acceso Restringido</h2>
        <p>Solo usuarios con rol Administrador pueden acceder a este panel.</p>
        <button onClick={onBack} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>Volver</button>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '1.5rem',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Barra Superior */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '2rem',
        borderBottom: '1px solid #334155',
        paddingBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={onBack}
            style={{
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <ArrowLeft size={16} />
            <span>Volver a la App</span>
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={24} color="#f2c12e" />
              Panel de Administración
            </h1>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Gestión Privada de Cuentas Operativas (Supabase)
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            backgroundColor: '#f2c12e',
            color: '#0f172a',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '0.65rem 1.1rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            boxShadow: '0 4px 6px -1px rgba(242, 193, 46, 0.2)'
          }}
        >
          <UserPlus size={18} />
          <span>+ Nueva Cuenta Operativa</span>
        </button>
      </div>

      {/* Resumen de Cuentas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Usuarios</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f2c12e' }}>{users.length}</div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Operadores</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>
            {users.filter(u => u.role === 'operador').length}
          </div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Técnicos</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399' }}>
            {users.filter(u => u.role === 'tecnico').length}
          </div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Administradores</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa' }}>
            {users.filter(u => u.role === 'admin').length}
          </div>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={18} color="#94a3b8" />
            Cuentas Registradas en el Sistema
          </h2>
          <button
            onClick={fetchUsers}
            disabled={loadingUsers}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.8rem'
            }}
          >
            <RefreshCw size={14} className={loadingUsers ? 'spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>

        {loadingUsers ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Cargando lista de usuarios...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No se encontraron usuarios en Supabase.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Nombre</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Usuario / Email</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Rol</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const badge = getRoleBadge(u.role);
                  const displayUsername = u.email ? u.email.split('@')[0] : 'N/A';
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#ffffff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: '#334155',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#f2c12e'
                          }}>
                            {(u.full_name || displayUsername).charAt(0).toUpperCase()}
                          </div>
                          <span>{u.full_name || 'Sin nombre'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                        <div style={{ fontWeight: 600 }}>{displayUsername}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          backgroundColor: badge.bg,
                          color: badge.text,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          color: '#34d399',
                          fontSize: '0.8rem'
                        }}>
                          <CheckCircle size={14} />
                          <span>Activo</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear Nueva Cuenta */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 10000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            maxWidth: '460px',
            width: '100%',
            padding: '2rem',
            border: '1px solid #475569',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <div style={{
                backgroundColor: '#f2c12e',
                color: '#0f172a',
                padding: '0.4rem',
                borderRadius: '8px',
                display: 'flex'
              }}>
                <UserCheck size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Crear Cuenta Operativa
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  El usuario podrá ingresar de inmediato a la app
                </span>
              </div>
            </div>

            {formError && (
              <div style={{
                backgroundColor: '#450a0a',
                border: '1px solid #991b1b',
                color: '#fca5a5',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div style={{
                backgroundColor: '#064e3b',
                border: '1px solid #059669',
                color: '#a7f3d0',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <CheckCircle size={16} />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 600 }}>
                  Nombre y Apellido
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Marcelo Rojas"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 600 }}>
                  Nombre de Usuario (Login)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: mrojas o operadorturno"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().trim())}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  El usuario podrá ingresar escribiendo exactamente este nombre.
                </span>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 600 }}>
                  Contraseña Inicial
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.3rem', fontWeight: 600 }}>
                  Rol en Faena
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="operador">Operador (Terreno / Perforación)</option>
                  <option value="tecnico">Técnico (Medición y Control de Aceros)</option>
                  <option value="analista">Analista (Reportes e Inventario)</option>
                  <option value="admin">Administrador (Control Total)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  style={{
                    flex: 1,
                    backgroundColor: '#f2c12e',
                    color: '#0f172a',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: formLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    opacity: formLoading ? 0.7 : 1
                  }}
                >
                  <Key size={16} />
                  <span>{formLoading ? 'Creando...' : 'Crear Cuenta'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
