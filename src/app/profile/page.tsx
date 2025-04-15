'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function ProfilePage() {
  const { currentUser, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      setError(null);
      await signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      setError('Failed to sign out. Please try again.');
      setIsSigningOut(false);
    }
  };

  // If auth is still loading, show loading state
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-3 sm:px-4">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 sm:h-10 sm:w-10 text-primary mx-auto mb-3 sm:mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm sm:text-base text-gray-600">Checking login status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto pb-6 sm:pb-8 md:pb-12 px-3 sm:px-4">
        <div className="bg-white shadow-md rounded-lg p-4 sm:p-6 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 sm:h-16 sm:w-16 text-red-500 mx-auto mb-3 sm:mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">Error</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-md transition-colors text-sm sm:text-base"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-6 sm:pb-8 md:pb-12 px-3 sm:px-4">
      <div className="bg-white shadow-md rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-primary mb-4 sm:mb-6">Your Account</h2>
        
        {currentUser ? (
          <div className="space-y-4 sm:space-y-6">
            {/* User Info */}
            <div className="p-3 sm:p-4 bg-background rounded-lg">
              <div className="flex items-center">
                <div className="bg-primary text-white rounded-full h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center text-base sm:text-xl font-bold mr-3 sm:mr-4">
                  {currentUser.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm sm:text-base">Signed in as</p>
                  <p className="text-gray-600 text-xs sm:text-sm truncate max-w-[200px] sm:max-w-xs">{currentUser.email}</p>
                </div>
              </div>
            </div>
            
            {/* Account Actions */}
            <div className="space-y-3 sm:space-y-4">
              <Link
                href="/history"
                className="w-full py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors text-center block text-sm sm:text-base"
              >
                View Meal History
              </Link>
              
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full py-2 px-4 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors flex justify-center items-center text-sm sm:text-base"
              >
                {isSigningOut ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing Out...
                  </>
                ) : (
                  "Sign Out"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 sm:py-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Please sign in to save your meal analysis</p>
            <Link 
              href="/login" 
              className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-md transition-colors text-sm sm:text-base"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
} 