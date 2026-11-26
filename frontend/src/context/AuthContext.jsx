import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  registerUser,
  loginUser,
  loginWithGoogle as loginWithGoogleApi,
  fetchCurrentUser,
  updateUserProfile,
  logoutUser,
} from '../api/endpoints';

const TOKEN_KEY = 'wst_token';
const USER_KEY = 'wst_user';

const AuthContext = createContext(null);

export function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }, []);

  // Validate any stored token before exposing the cached session to protected routes.
  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      let storedToken = null;
      try {
        storedToken = localStorage.getItem(TOKEN_KEY);
      } catch {}

      if (!storedToken) {
        clearSession();
        if (active) setLoading(false);
        return;
      }

      setToken(storedToken);
    try {
        const data = await fetchCurrentUser();
        if (!data?.user) throw new Error('Session validation returned no user');
        setUser(data.user);
        try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch {}
      } catch {
        clearSession();
      } finally {
        if (active) setLoading(false);
      }
    };

    restoreSession();
    return () => { active = false; };
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const data = await loginUser({ email, password });
    setToken(data.token);
    setUser(data.user);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await registerUser(payload);
    setToken(data.token);
    setUser(data.user);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const data = await loginWithGoogleApi({ credential });
    setToken(data.token);
    setUser(data.user);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
    return data;
  }, []);

  const updateProfile = useCallback(async (updates) => {
    const data = await updateUserProfile(updates);
    setUser(data.user);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
    return data;
  }, []);

  const logout = useCallback(() => {
    const request = logoutUser().catch(() => undefined);
    clearSession();
    return request;
  }, [clearSession]);

  const isAuthenticated = !!user && !!token;

  const value = {
    user,
    token,
    loading,
    isAuthenticated,
    login,
    register,
    loginWithGoogle,
    updateProfile,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthContextProvider');
  }
  return context;
};

export default AuthContext;
