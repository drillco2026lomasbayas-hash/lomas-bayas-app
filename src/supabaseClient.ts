import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nejeazmulvcwfhunzjej.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_iDXrSxkgv64qhYmeRbq_2A_t05_Aff_';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Guarda el token en localStorage para funcionar offline
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
