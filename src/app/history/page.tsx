'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  onSnapshot, 
  Firestore 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SavedMeal {
  id: string;
  mealName?: string;
  imageUrl: string;
  createdAt: Date;
  analysis: {
    goalName?: string;
    goalScore?: number;
    description?: string;
  };
  goalType?: string;
  goalScore?: number;
  goal?: string;
}

interface MealsByDate {
  [date: string]: SavedMeal[];
}

export default function HistoryPage() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [mealsByDate, setMealsByDate] = useState<MealsByDate>({});
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<string>('init');
  const [error, setError] = useState<string | null>(null);
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();

  // Group meals by date - extract to a memoized function
  const groupMealsByDate = useCallback((mealsList: SavedMeal[]) => {
    const groupedMeals: MealsByDate = {};
    mealsList.forEach(meal => {
      const dateStr = meal.createdAt.toLocaleDateString();
      if (!groupedMeals[dateStr]) {
        groupedMeals[dateStr] = [];
      }
      groupedMeals[dateStr].push(meal);
    });
    return groupedMeals;
  }, []);

  useEffect(() => {
    // If auth is still loading, wait
    if (authLoading) return;
    
    // Check if user is logged in
    if (!currentUser) {
      router.push('/login');
      return;
    }

    // Try to get cached meals from session storage first for instant display
    try {
      const cachedMeals = sessionStorage.getItem('cachedMeals');
      if (cachedMeals) {
        const parsedMeals = JSON.parse(cachedMeals);
        // Convert string dates back to Date objects
        const hydratedMeals = parsedMeals.map((meal: any) => ({
          ...meal,
          createdAt: new Date(meal.createdAt)
        }));
        
        setMeals(hydratedMeals);
        setMealsByDate(groupMealsByDate(hydratedMeals));
        // Show cached data but continue loading fresh data
        setLoadingStage('updating');
      }
    } catch (err) {
      console.warn('Failed to load cached meals:', err);
      // Continue with fresh data loading
    }

    setLoadingStage('loading');

    // Set up real-time listener for meals collection
    // Type assertion to Firestore since we know db is initialized as Firestore
    const firestore = db as Firestore;
    const mealsRef = collection(firestore, `users/${currentUser.uid}/meals`);
    const q = query(mealsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        if (querySnapshot.empty) {
          setLoading(false);
          setLoadingStage('complete');
          return;
        }
        
        const mealsList: SavedMeal[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          mealsList.push({
            id: doc.id,
            mealName: data.mealName || 'Unnamed Meal',
            imageUrl: data.imageUrl,
            createdAt: data.createdAt?.toDate() || new Date(),
            analysis: data.analysis || {},
            goalType: data.goalType || data.analysis?.goalName || 'General Health',
            goalScore: data.goalScore || data.analysis?.goalScore || 5,
            goal: data.goal || data.analysis?.rawGoal
          });
        });
        
        // Cache the meals for future visits
        try {
          sessionStorage.setItem('cachedMeals', JSON.stringify(mealsList));
        } catch (err) {
          console.warn('Failed to cache meals:', err);
        }
        
        setMeals(mealsList);
        setMealsByDate(groupMealsByDate(mealsList));
        setLoading(false);
        setLoadingStage('complete');
      },
      (error) => {
        console.error('Error fetching meals:', error);
        setError('Failed to load your meal history. Please try again later.');
        setLoading(false);
        setLoadingStage('error');
      }
    );

    // Clean up the listener on component unmount
    return () => unsubscribe();
  }, [currentUser, router, authLoading, groupMealsByDate]);

  // Function to get relative date string
  const getRelativeDateString = (dateStr: string) => {
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
    
    if (dateStr === today) {
      return 'Today';
    } else if (dateStr === yesterday) {
      return 'Yesterday';
    } else {
      return dateStr;
    }
  };

  // Function to get score color
  const getScoreColor = (score: number | undefined) => {
    if (!score) return 'text-gray-500';
    if (score >= 8) return 'text-leaf';
    if (score >= 5) return 'text-primary';
    return 'text-sand';
  };

  // Generate skeleton loader for meals
  const renderSkeletonLoader = () => {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2, 3].map((_, i) => (
          <div key={i} className="border-b border-stone border-opacity-20 pb-4 last:border-b-0 last:pb-0">
            <div className="h-5 w-24 bg-stone bg-opacity-20 rounded mb-3"></div>
            
            <div className="space-y-3">
              {[1, 2, 3].map((_, j) => (
                <div key={j} className="flex items-center p-3 bg-background rounded-lg">
                  <div className="h-16 w-16 rounded-md bg-stone bg-opacity-20 mr-4 flex-shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-stone bg-opacity-20 rounded w-3/4"></div>
                    <div className="h-3 bg-stone bg-opacity-20 rounded w-full"></div>
                    <div className="flex space-x-2">
                      <div className="h-3 w-16 bg-stone bg-opacity-20 rounded-full"></div>
                      <div className="h-3 w-12 bg-stone bg-opacity-20 rounded"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // If auth is still loading, show a spinner
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Finding your wellness path...</p>
        </div>
      </div>
    );
  }

  // Show meals even during loading if we already have cached data
  const showMeals = meals.length > 0;

  return (
    <div className="max-w-lg mx-auto pb-12">
      <div className="bg-white shadow-md rounded-lg overflow-hidden border border-stone border-opacity-30">
        <div className="bg-gradient-to-r from-primary to-secondary bg-opacity-10 p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-medium text-gray-800 flex items-center">
              <span className="text-2xl mr-2">🍃</span>
              Your Wellness Journey
            </h2>
            <Link 
              href="/upload" 
              className="text-sm bg-primary hover:bg-secondary text-white font-medium py-1.5 px-3 rounded-full transition-colors flex items-center"
            >
              <span className="mr-1">+</span> New Meal
            </Link>
          </div>
        </div>
        
        <div className="p-6">
          {/* Loading or Error States */}
          {loading && !showMeals && renderSkeletonLoader()}
          
          {error && (
            <div className="bg-sand bg-opacity-10 border border-sand border-opacity-30 text-gray-700 p-4 rounded-md">
              <div className="flex">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sand" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p>{error}</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-2 w-full text-center bg-white border border-sand text-gray-700 py-1 px-3 rounded text-sm hover:bg-sand hover:bg-opacity-5 transition-colors"
              >
                Restore Balance
              </button>
            </div>
          )}
          
          {/* No Meals State */}
          {!loading && !error && meals.length === 0 && (
            <div className="text-center py-8 animate-fade-in">
              <div className="w-20 h-20 bg-leaf bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🍽️</span>
              </div>
              <p className="text-gray-600 mb-6">Your wellness journey is just beginning</p>
              <Link 
                href="/upload" 
                className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                Begin Your First Entry
              </Link>
            </div>
          )}
          
          {/* Meals List */}
          {showMeals && (
            <div className="space-y-6">
              {Object.entries(mealsByDate).map(([dateStr, mealsOnDate], dateIndex) => (
                <div key={dateStr} className={`border-b border-stone border-opacity-30 pb-4 last:border-b-0 last:pb-0 animate-slide-up`} style={{ animationDelay: `${dateIndex * 0.1}s` }}>
                  <h3 className="text-md font-medium text-gray-700 mb-3 sticky top-0 bg-white flex items-center">
                    <span className="text-leaf text-sm mr-2">◇</span>
                    {getRelativeDateString(dateStr)}
                  </h3>
                  
                  <div className="space-y-3">
                    {mealsOnDate.map((meal, mealIndex) => (
                      <Link 
                        key={meal.id}
                        href={`/meals/${meal.id}`}
                        className={`flex items-center p-3 bg-background rounded-lg border border-stone border-opacity-30 hover:shadow-md hover:border-primary hover:border-opacity-50 transition-all duration-300 animate-fade-in`}
                        style={{ animationDelay: `${dateIndex * 0.1 + mealIndex * 0.05}s` }}
                      >
                        <div className="relative h-16 w-16 rounded-md overflow-hidden mr-4 flex-shrink-0 bg-gray-100">
                          {meal.imageUrl ? (
                            <Image
                              src={meal.imageUrl}
                              alt={meal.mealName || "Meal"}
                              fill
                              style={{ objectFit: 'cover' }}
                              sizes="64px"
                              loading={mealIndex < 2 ? 'eager' : 'lazy'} // Load first 2 eagerly
                            />
                          ) : (
                            <div className="bg-gradient-to-r from-leaf to-primary bg-opacity-20 h-full w-full flex items-center justify-center">
                              <span className="text-2xl">🍽️</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">
                            {meal.mealName || 'Mindful Meal'}
                          </p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {meal.analysis.description?.substring(0, 60) || 'A moment of nourishment'}{meal.analysis.description && meal.analysis.description.length > 60 ? '...' : ''}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1 items-center">
                            {(meal.goal || meal.goalType || meal.analysis.goalName) && (
                              <span className="text-xs bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded-full flex items-center">
                                <span className="text-xs mr-1">
                                  {meal.goalType?.toLowerCase().includes('sleep') ? '🌙' : 
                                   meal.goalType?.toLowerCase().includes('weight') ? '⚖️' : 
                                   meal.goalType?.toLowerCase().includes('muscle') ? '💪' : 
                                   meal.goalType?.toLowerCase().includes('energy') ? '⚡' : 
                                   meal.goalType?.toLowerCase().includes('heart') ? '❤️' : 
                                   meal.goalType?.toLowerCase().includes('mind-body') ? '☯️' : 
                                   meal.goalType?.toLowerCase().includes('recovery') ? '🔄' : '🌿'}
                                </span>
                                {meal.goal ? `${meal.goal.length > 15 ? meal.goal.substring(0, 15) + '...' : meal.goal}` : meal.goalType || meal.analysis.goalName}
                              </span>
                            )}
                            {(meal.goalScore || meal.analysis.goalScore) && (
                              <span className={`ml-2 text-xs font-medium ${getScoreColor(meal.goalScore || meal.analysis.goalScore)} flex items-center`}>
                                {meal.goalScore && meal.goalScore >= 8 ? 'Harmonious' : 
                                 meal.goalScore && meal.goalScore >= 5 ? 'Balanced' : 
                                 'Needs Balance'}
                              </span>
                            )}
                            <span className="text-xs text-gray-500 ml-auto">
                              {meal.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Loading state indicator for real-time updates */}
          {loadingStage === 'updating' && (
            <div className="mt-4 flex items-center justify-center text-xs text-gray-500">
              <svg className="animate-spin h-3 w-3 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Refreshing your journey...
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 