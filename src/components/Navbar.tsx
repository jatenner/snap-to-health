'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const Navbar = () => {
  const pathname = usePathname();
  const { currentUser, signOut } = useAuth();
  
  const isActive = (path: string) => {
    return pathname === path;
  };
  
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 fixed bottom-0 w-full z-10 md:top-0 md:bottom-auto">
      <div className="max-w-lg mx-auto px-2 sm:px-4">
        <div className="flex justify-around py-2 sm:py-3">
          <Link 
            href="/upload" 
            className={`text-xs sm:text-sm flex flex-col items-center px-1 transition-colors duration-250 ${isActive('/upload') ? 'text-primary' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Analyze</span>
          </Link>
          
          {currentUser ? (
            <>
              <Link 
                href="/history" 
                className={`text-xs sm:text-sm flex flex-col items-center px-1 transition-colors duration-250 ${isActive('/history') || pathname.startsWith('/meals/') ? 'text-primary' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span>History</span>
              </Link>
              
              <Link
                href="/profile"
                className={`text-xs sm:text-sm flex flex-col items-center px-1 transition-colors duration-250 ${isActive('/profile') ? 'text-primary' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Profile</span>
              </Link>
            </>
          ) : (
            <Link 
              href="/login" 
              className={`text-xs sm:text-sm flex flex-col items-center px-1 transition-colors duration-250 ${isActive('/login') || isActive('/signup') ? 'text-primary' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 