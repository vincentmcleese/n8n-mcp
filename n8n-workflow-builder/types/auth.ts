import { User } from '@supabase/supabase-js';

export interface AuthUser extends User {
  // Add any additional user properties here
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
}