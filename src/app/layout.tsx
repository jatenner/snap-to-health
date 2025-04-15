import './globals.css'
import type { Metadata } from 'next'
import React from 'react'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import AuthWrapper from '@/components/AuthWrapper'
import LoadingProvider from '@/components/LoadingProvider'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'Snap2Health | Meal Analysis for Your Health Goals',
  description: 'Analyze meals instantly with AI and get personalized nutrition insights for your health goals - Updated for Vercel deployment',
  keywords: ['nutrition', 'health tracking', 'AI analysis', 'meal tracking', 'personalized health'],
  authors: [{ name: 'Snap2Health Team' }],
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#10b981',
  manifest: '/manifest.json',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://snap2health.com',
    title: 'Snap2Health | Meal Analysis for Your Health Goals',
    description: 'Analyze meals instantly with AI and get personalized nutrition insights for your health goals - Updated for Vercel deployment',
    siteName: 'Snap2Health',
    images: [{
      url: '/og-image.jpg',
      width: 1200,
      height: 630,
      alt: 'Snap2Health'
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Snap2Health | Meal Analysis for Your Health Goals',
    description: 'Analyze meals instantly with AI and get personalized nutrition insights for your health goals',
    images: ['/twitter-image.jpg'],
  },
  appleWebApp: {
    title: 'Snap2Health',
    statusBarStyle: 'black-translucent',
    capable: true
  },
  applicationName: 'Snap2Health',
  formatDetection: {
    telephone: false
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#10b981',
    'msapplication-tap-highlight': 'no'
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.svg" />
        <link rel="icon" type="image/svg+xml" sizes="32x32" href="/icons/favicon-32x32.svg" />
        <link rel="icon" type="image/svg+xml" sizes="16x16" href="/icons/favicon-16x16.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="bg-background min-h-screen flex flex-col">
        <AuthWrapper>
          <LoadingProvider>
            <Toaster 
              position="top-center"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '12px 16px',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#4ade80',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
            <header className="px-4 py-4 md:py-6 max-w-lg mx-auto w-full">
              <Link href="/" className="block">
                <h1 className="text-xl md:text-2xl font-bold text-primary">Snap2Health</h1>
                <p className="text-xs md:text-sm text-gray-600">Analyze meals for your health goals</p>
              </Link>
            </header>
            <main className="px-4 pb-20 md:pb-12 flex-grow">
              {children}
            </main>
            <Navbar />
            <footer className="px-4 py-4 border-t border-gray-200 bg-white mt-auto">
              <div className="max-w-lg mx-auto text-center">
                <p className="text-xs text-gray-500">
                  <span className="text-primary font-medium">Snap2Health</span> &middot; Analyze your meals for better health
                </p>
              </div>
            </footer>
          </LoadingProvider>
        </AuthWrapper>
      </body>
    </html>
  )
} 