'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  User 
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  clearError: () => void;
  authInitialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Check if Firebase Auth is initialized
    if (!auth) {
      console.error("Firebase Auth is not initialized");
      if (isMounted) {
        setError("Authentication service is not available");
        setLoading(false);
        setAuthInitialized(true);
      }
      return () => { isMounted = false; };
    }

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(
      auth, 
      (user) => {
        if (isMounted) {
          setCurrentUser(user);
          setLoading(false);
          setAuthInitialized(true);
        }
      }, 
      (authError) => {
        console.error("Auth state change error:", authError);
        if (isMounted) {
          setError("Authentication error: " + authError.message);
          setLoading(false);
          setAuthInitialized(true);
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Memoize function references to prevent unnecessary re-renders
  const signIn = useCallback(async (email: string, password: string): Promise<User> => {
    try {
      if (!auth) throw new Error("Authentication service is not available");
      
      setError(null);
      const response = await signInWithEmailAndPassword(auth, email, password);
      return response.user;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to sign in";
      console.error("Sign in error:", errorMessage);
      setError(errorMessage);
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<User> => {
    try {
      if (!auth) throw new Error("Authentication service is not available");
      
      setError(null);
      const response = await createUserWithEmailAndPassword(auth, email, password);
      return response.user;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to create account";
      console.error("Sign up error:", errorMessage);
      setError(errorMessage);
      throw err;
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      if (!auth) throw new Error("Authentication service is not available");
      
      await firebaseSignOut(auth);
    } catch (err: any) {
      const errorMessage = err.message || "Failed to sign out";
      console.error("Sign out error:", errorMessage);
      setError(errorMessage);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    currentUser,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    clearError,
    authInitialized
  }), [currentUser, loading, error, signIn, signUp, signOut, clearError, authInitialized]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 