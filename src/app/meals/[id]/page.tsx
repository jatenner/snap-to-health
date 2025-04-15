'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, updateDoc, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AnalysisCard from '@/components/AnalysisCard';

interface SavedMealDetails {
  id: string;
  mealName?: string;
  imageUrl: string;
  createdAt: Date;
  analysis: {
    description?: string;
    nutrients?: any[];
    feedback?: string;
    suggestions?: string[];
    goalScore?: number;
    goalName?: string;
    scoreExplanation?: string;
    positiveFoodFactors?: string[];
    negativeFoodFactors?: string[];
    sleepScore?: number;
    rawGoal?: string;
  };
  goalType?: string;
  goalScore?: number;
  goal?: string;
}

export default function MealDetailPage() {
  const [meal, setMeal] = useState<SavedMealDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<string>('init');
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMealName, setEditedMealName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const mealId = params?.id as string;

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // Check if user is logged in
    if (!currentUser) {
      router.push('/login');
      return;
    }

    const fetchMealDetails = async () => {
      if (!mealId) return;
      
      setLoadingStage('loading');
      
      // Check if we have this meal in sessionStorage cache
      try {
        const cachedMeals = sessionStorage.getItem('cachedMeals');
        if (cachedMeals) {
          const parsedMeals = JSON.parse(cachedMeals);
          const cachedMeal = parsedMeals.find((m: any) => m.id === mealId);
          
          if (cachedMeal) {
            // Hydrate the date
            cachedMeal.createdAt = new Date(cachedMeal.createdAt);
            setMeal(cachedMeal);
            setEditedMealName(cachedMeal.mealName || '');
            setLoadingStage('cached');
            
            // Continue fetching for fresh data
            console.log('Using cached meal data while fetching fresh data');
          }
        }
      } catch (err) {
        console.warn('Failed to load cached meal:', err);
        // Continue with fresh data loading
      }
      
      try {
        const firestore = db as Firestore;
        const mealRef = doc(firestore, `users/${currentUser.uid}/meals`, mealId);
        const mealSnap = await getDoc(mealRef);
        
        if (mealSnap.exists()) {
          const data = mealSnap.data();
          const mealData = {
            id: mealSnap.id,
            mealName: data.mealName || 'Unnamed Meal',
            imageUrl: data.imageUrl,
            createdAt: data.createdAt?.toDate() || new Date(),
            analysis: data.analysis || {},
            goalType: data.goalType || data.analysis?.goalName || 'General Health',
            goalScore: data.goalScore || data.analysis?.goalScore || 5,
            goal: data.goal || data.analysis?.rawGoal || 'General Health'
          };
          
          setMeal(mealData);
          setEditedMealName(mealData.mealName || '');
          setLoadingStage('complete');
        } else {
          setError('Meal not found');
          setLoadingStage('error');
        }
      } catch (error) {
        console.error('Error fetching meal details:', error);
        setError('Failed to load meal details');
        setLoadingStage('error');
      } finally {
        setLoading(false);
      }
    };

    fetchMealDetails();
  }, [currentUser, mealId, router, authLoading]);

  const handleSaveMealName = async () => {
    if (!currentUser || !mealId || !editedMealName.trim()) return;
    
    setIsSaving(true);
    try {
      const firestore = db as Firestore;
      const mealRef = doc(firestore, `users/${currentUser.uid}/meals`, mealId);
      
      // Optimistic UI update
      if (meal) {
        setMeal({
          ...meal,
          mealName: editedMealName.trim()
        });
      }
      
      await updateDoc(mealRef, {
        mealName: editedMealName.trim(),
        updatedAt: new Date()
      });
      
      // Show success indicator
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
      
      setIsEditing(false);
      
      // Update the cached meals
      try {
        const cachedMeals = sessionStorage.getItem('cachedMeals');
        if (cachedMeals) {
          const parsedMeals = JSON.parse(cachedMeals);
          const updatedMeals = parsedMeals.map((m: any) => 
            m.id === mealId ? { ...m, mealName: editedMealName.trim() } : m
          );
          sessionStorage.setItem('cachedMeals', JSON.stringify(updatedMeals));
        }
      } catch (err) {
        console.warn('Failed to update cached meals:', err);
      }
    } catch (error) {
      console.error('Error updating meal name:', error);
      setError('Failed to update meal name');
      // Revert the optimistic update
      if (meal) {
        setMeal({
          ...meal,
          mealName: meal.mealName // Revert to original
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // If auth is loading, show loading state
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Checking login status...</p>
        </div>
      </div>
    );
  }

  // Skeleton loader for meal detail
  const renderSkeletonLoader = () => {
    return (
      <div className="max-w-lg mx-auto pb-12 animate-pulse">
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          {/* Header skeleton */}
          <div className="p-4 bg-background border-b">
            <div className="flex items-center">
              <div className="w-5 h-5 bg-gray-200 rounded-full mr-4"></div>
              <div className="h-5 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>

          {/* Image skeleton */}
          <div className="w-full h-72 bg-gray-200"></div>

          {/* Content skeleton */}
          <div className="p-4 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            
            {/* Analysis card skeleton */}
            <div className="rounded-lg bg-gray-100 p-4 mt-4 space-y-3">
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-12 bg-gray-200 rounded"></div>
                <div className="h-12 bg-gray-200 rounded"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
            
            {/* Buttons skeleton */}
            <div className="flex space-x-4 mt-6">
              <div className="h-10 bg-gray-200 rounded flex-1"></div>
              <div className="h-10 bg-gray-200 rounded flex-1"></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading && !meal) {
    return renderSkeletonLoader();
  }

  if (error || !meal) {
    return (
      <div className="max-w-lg mx-auto pb-12">
        <div className="bg-white shadow-md rounded-lg p-6 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">{error || 'Something went wrong'}</h2>
          <p className="text-gray-600 mb-6">We couldn't find the meal you're looking for.</p>
          <Link 
            href="/history" 
            className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Back to Meal History
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-12">
      <div className={`bg-white shadow-zen rounded-lg overflow-hidden mb-6 transition-all duration-300 ${loading ? 'opacity-80' : 'opacity-100'}`}>
        {/* Header with navigation */}
        <div className="p-4 bg-background border-b border-stone border-opacity-30">
          <div className="flex items-center">
            <Link 
              href="/history"
              className="text-gray-600 hover:text-primary mr-4 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={editedMealName}
                    onChange={(e) => setEditedMealName(e.target.value)}
                    className="flex-1 p-1 border border-stone rounded text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter meal name"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveMealName}
                    disabled={isSaving || !editedMealName.trim()}
                    className="p-1 text-white bg-primary hover:bg-secondary rounded text-xs disabled:bg-gray-300 transition-colors"
                  >
                    {isSaving ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedMealName(meal.mealName || '');
                    }}
                    className="p-1 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <h1 className="text-lg font-medium text-secondary truncate">{meal.mealName}</h1>
                  {saveSuccess && (
                    <span className="ml-2 text-green-500 text-xs animate-fade-in">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  <button
                    onClick={() => setIsEditing(true)}
                    className="ml-2 text-gray-400 hover:text-primary transition-colors"
                    aria-label="Edit meal name"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            
            <div className="text-xs text-gray-500 ml-2">
              {meal.createdAt.toLocaleDateString()} {meal.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Meal image */}
        <div className="relative w-full h-72 bg-background">
          {meal.imageUrl ? (
            <>
              <div className={`absolute inset-0 transition-opacity duration-300 ${imageLoaded ? 'opacity-0' : 'opacity-100'}`}>
                {/* Low-quality image placeholder with blur */}
                <div className="w-full h-full animate-pulse bg-stone bg-opacity-10"></div>
              </div>
              <Image
                src={meal.imageUrl}
                alt={meal.mealName || "Meal"}
                fill
                style={{ objectFit: 'cover' }}
                className={`transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                priority
                sizes="(max-width: 768px) 100vw, 768px"
                onLoad={handleImageLoad}
              />
            </>
          ) : (
            <div className="bg-sand h-full w-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Analysis section */}
        <div className="p-5">
          {meal.analysis.description && (
            <div className="mb-6 animate-fade-in">
              <h2 className="font-medium text-secondary mb-2 flex items-center">
                <span className="inline-block w-6 h-6 rounded-full bg-accent bg-opacity-20 flex items-center justify-center mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                Nourishment Overview
              </h2>
              <p className="text-gray-700">{meal.analysis.description}</p>
            </div>
          )}
        </div>

        {/* Nutrients analysis */}
        {meal.analysis.nutrients && meal.analysis.nutrients.length > 0 && (
          <div className="border-t border-stone border-opacity-30 p-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <AnalysisCard 
              result={{
                description: meal.analysis.description || '',
                nutrients: meal.analysis.nutrients || [],
                feedback: Array.isArray(meal.analysis.feedback) 
                  ? meal.analysis.feedback 
                  : meal.analysis.feedback 
                    ? [meal.analysis.feedback] 
                    : [],
                suggestions: meal.analysis.suggestions || [],
                sleepScore: meal.analysis.sleepScore,
                goalScore: meal.goalScore || meal.analysis.goalScore,
                goalName: meal.goalType || meal.analysis.goalName,
                scoreExplanation: meal.analysis.scoreExplanation,
                positiveFoodFactors: meal.analysis.positiveFoodFactors || [],
                negativeFoodFactors: meal.analysis.negativeFoodFactors || [],
                rawGoal: meal.goal || meal.analysis.rawGoal
              }}
              previewUrl={null}
              isLoading={loading && loadingStage !== 'complete'}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-between space-x-4 p-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <Link 
            href="/history"
            className="flex-1 py-2.5 px-4 border border-stone rounded-md text-center text-secondary hover:bg-sand transition-all duration-300 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Journey Timeline
          </Link>
          <Link 
            href="/upload"
            className="flex-1 py-2.5 px-4 bg-primary hover:bg-secondary text-white rounded-md text-center transition-colors flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            New Mindful Analysis
          </Link>
        </div>
      </div>
    </div>
  );
} 