import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'operador' | 'tecnico' | 'analista' | 'admin';
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, role?: UserProfile['role']) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  createManagedUser: (username: string, password: string, fullName: string, role: UserProfile['role']) => Promise<{ success: boolean; error?: string }>;
  isOffline: boolean;
  enterOfflineGuest: (name: string, role: UserProfile['role']) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_PROFILE_KEY = 'lomasbayas_cached_profile';
const OFFLINE_SESSION_KEY = 'lomasbayas_offline_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_PROFILE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Monitor de conectividad
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar perfil desde Supabase y guardar en caché local para soporte offline
  const fetchProfile = async (userId: string) => {
    try {
      if (!navigator.onLine) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(data));
      }
    } catch (err) {
      console.warn('No se pudo obtener el perfil remoto (modo offline):', err);
    }
  };

  useEffect(() => {
    // 1. Obtener sesión activa de Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        // Revisar si había sesión offline de contingencia
        try {
          const offSession = localStorage.getItem(OFFLINE_SESSION_KEY);
          if (offSession) {
            const parsed = JSON.parse(offSession);
            setProfile(parsed);
          }
        } catch {
          // ignore
        }
      }
      setLoading(false);
    });

    // 2. Escuchar cambios de estado de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        localStorage.removeItem(OFFLINE_SESSION_KEY);
      } else {
        const offSession = localStorage.getItem(OFFLINE_SESSION_KEY);
        if (!offSession) {
          setProfile(null);
          localStorage.removeItem(LOCAL_PROFILE_KEY);
        }
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Normaliza usuario: si escribe 'drillcoadmin' o 'applomas', le añade '@lomasbayas.cl'
  const normalizeEmail = (identifier: string): string => {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.includes('@')) {
      return trimmed;
    }
    return `${trimmed}@lomasbayas.cl`;
  };

  const signIn = async (identifier: string, password: string) => {
    const email = normalizeEmail(identifier);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      await fetchProfile(data.user.id);
    }
    return { error: error as Error | null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: UserProfile['role'] = 'operador'
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });
    return { error: error as Error | null };
  };

  // Crear usuario desde el panel del Administrador
  const createManagedUser = async (
    username: string,
    password: string,
    fullName: string,
    role: UserProfile['role']
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('admin_create_user', {
        new_username: username,
        new_password: password,
        new_full_name: fullName,
        new_role: role,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && data.success === false) {
        return { success: false, error: data.error || 'Error creando usuario' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error de conexión' };
    }
  };

  const enterOfflineGuest = (name: string, role: UserProfile['role']) => {
    const fakeProfile: UserProfile = {
      id: `offline_${Date.now()}`,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@offline.local`,
      full_name: name,
      role: role,
    };
    setProfile(fakeProfile);
    localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(fakeProfile));
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    localStorage.removeItem(LOCAL_PROFILE_KEY);
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        createManagedUser,
        isOffline,
        enterOfflineGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};
