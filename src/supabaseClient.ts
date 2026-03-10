/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fuslpyhjedycqrovsxjy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7ONRZ3RCS7AZDIe3p_NeBQ_zgzwAljb';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
