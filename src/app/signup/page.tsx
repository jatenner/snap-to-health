'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserProfile } from '@/utils/userUtils';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [healthGoal, setHealthGoal] = useState('Improve Sleep');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, currentUser } = useAuth();
  const router = useRouter();

  // Health goal options
  const HEALTH_GOALS = [
    'Improve Sleep',
    'Weight Management',
    'Build Muscle',
    'Boost Energy',
    'Support Heart Health',
    'Recovery'
  ];

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      router.push('/upload');
    }
  }, [currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      
      // Sign up with Firebase
      const user = await signUp(email, password);
      
      // Create user profile with health goal
      await updateUserProfile(user.uid, {
        email: user.email,
        healthGoal,
        createdAt: new Date()
      });
      
      // Redirect to upload page
      router.push('/upload');
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(
        err.code === 'auth/email-already-in-use' ? 'This email is already in use' :
        err.code === 'auth/invalid-email' ? 'Invalid email address' :
        err.code === 'auth/weak-password' ? 'Password is too weak' :
        'Failed to create account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h1 className="text-2xl font-bold text-primary mb-6">Create Account</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="••••••••"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>
          
          <div>
            <label htmlFor="healthGoal" className="block text-sm font-medium text-gray-700 mb-1">
              What's your primary health goal?
            </label>
            <select
              id="healthGoal"
              value={healthGoal}
              onChange={(e) => setHealthGoal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            >
              {HEALTH_GOALS.map(goal => (
                <option key={goal} value={goal}>{goal}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">We'll use this to customize your meal analysis</p>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary hover:bg-secondary text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:text-secondary font-medium">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
} 