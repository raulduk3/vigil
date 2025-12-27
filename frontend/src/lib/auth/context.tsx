'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, type User } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      if (api.isAuthenticated()) {
        const user = await api.getCurrentUser();
        setState({
          user,
          isLoading: false,
          isAuthenticated: !!user,
        });
      } else {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    };

    // Set up auth change callback
    api.setAuthChangeCallback((user) => {
      setState((prev) => ({
        ...prev,
        user,
        isAuthenticated: !!user,
      }));
    });

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);
      if (response.user && response.tokens) {
        setState({
          user: response.user,
          isLoading: false,
          isAuthenticated: true,
        });
        return { success: true };
      }
      return { success: false, error: response.error || 'Login failed' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    try {
      const response = await api.register(email, password);
      if (response.user && response.tokens) {
        setState({
          user: response.user,
          isLoading: false,
          isAuthenticated: true,
        });
        return { success: true };
      }
      return { success: false, error: response.error || response.errors?.join(', ') || 'Registration failed' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Registration failed' 
      };
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await api.getCurrentUser();
    setState((prev) => ({
      ...prev,
      user,
      isAuthenticated: !!user,
    }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ============================================================================
// Protected Route Component
// ============================================================================

interface RequireAuthProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireAuth({ children, fallback }: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vigil-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (fallback) return <>{fallback}</>;
    
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
    return null;
  }

  return <>{children}</>;
}
