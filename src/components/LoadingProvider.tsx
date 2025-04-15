'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface LoadingContextType {
  pageReady: boolean;
}

const LoadingContext = createContext<LoadingContextType>({ pageReady: false });

export const usePageLoading = () => useContext(LoadingContext);

export default function LoadingProvider({ children }: { children: ReactNode }) {
  const [pageReady, setPageReady] = useState(false);
  const { authInitialized } = useAuth();
  
  // Mark the page as ready when auth is initialized and the component is mounted
  useEffect(() => {
    if (authInitialized) {
      // Small delay to ensure smooth transitions
      const timer = setTimeout(() => {
        setPageReady(true);
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [authInitialized]);

  return (
    <LoadingContext.Provider value={{ pageReady }}>
      {children}
    </LoadingContext.Provider>
  );
} 