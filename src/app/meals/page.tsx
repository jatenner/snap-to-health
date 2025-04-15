'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Firestore } from 'firebase/firestore';

interface SavedMeal {
  id: string;
  imageUrl: string;
  createdAt: Date;
  analysis: {
    goalName?: string;
    goalScore?: number;
    description?: string;
  };
}

export default function MealsPage() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    if (!currentUser) {
      router.push('/login');
      return;
    }

    const fetchMeals = async () => {
      try {
        const mealsRef = collection(db as Firestore, `users/${currentUser.uid}/meals`);
        const q = query(mealsRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const mealsList: SavedMeal[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          mealsList.push({
            id: doc.id,
            imageUrl: data.imageUrl,
            createdAt: data.createdAt?.toDate() || new Date(),
            analysis: data.analysis || {},
          });
        });
        
        setMeals(mealsList);
      } catch (error) {
        console.error('Error fetching meals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMeals();
  }, [currentUser, router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 text-primary mx-auto mb-4 relative">
            <div className="absolute inset-0 border-t-2 border-primary rounded-full"></div>
            <div className="absolute inset-0 border-2 border-stone border-opacity-20 rounded-full"></div>
          </div>
          <p className="text-gray-600">Loading your wellness journey...</p>
        </div>
      </div>
    );
  }

  if (meals.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-12 px-4">
        <div className="text-center mb-6 mt-2">
          <h1 className="text-2xl font-medium text-secondary">Your Wellness Journey</h1>
          <p className="text-gray-600 mt-2">Reflect on your nourishment path and witness your growth</p>
        </div>
        
        <div className="bg-white shadow-zen rounded-lg overflow-hidden mb-6">
          <div className="p-4 bg-background border-b border-stone border-opacity-30 flex justify-between items-center">
            <h2 className="text-lg font-medium text-secondary">Meal History</h2>
            <Link 
              href="/upload" 
              className="inline-flex items-center text-sm py-1.5 px-3 bg-primary text-white rounded-md hover:bg-secondary transition-colors duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Analysis
            </Link>
          </div>

          <div className="divide-y divide-stone divide-opacity-30">
            <div className="py-12 text-center">
              <div className="bg-sand bg-opacity-20 w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-secondary mb-2">Begin Your Wellness Journey</h3>
              <p className="text-gray-600 max-w-xs mx-auto mb-6">Track your nutrition insights and visualize your progress towards balanced well-being.</p>
              <Link 
                href="/upload" 
                className="inline-flex items-center py-2 px-4 bg-primary hover:bg-secondary text-white rounded-md transition-colors duration-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Capture Your First Meal
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-12 px-4">
      <div className="text-center mb-6 mt-2">
        <h1 className="text-2xl font-medium text-secondary">Your Wellness Journey</h1>
        <p className="text-gray-600 mt-2">Reflect on your nourishment path and witness your growth</p>
      </div>
      
      <div className="bg-white shadow-zen rounded-lg overflow-hidden mb-6">
        <div className="p-4 bg-background border-b border-stone border-opacity-30 flex justify-between items-center">
          <h2 className="text-lg font-medium text-secondary">Meal History</h2>
          <Link 
            href="/upload" 
            className="inline-flex items-center text-sm py-1.5 px-3 bg-primary text-white rounded-md hover:bg-secondary transition-colors duration-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Analysis
          </Link>
        </div>

        <div className="divide-y divide-stone divide-opacity-30">
          {meals.map((meal) => (
            <Link 
              key={meal.id} 
              href={`/meals/${meal.id}`} 
              className="block p-4 hover:bg-background transition-colors duration-300"
            >
              <div className="flex space-x-4">
                <div className="relative w-20 h-20 rounded-md overflow-hidden bg-stone bg-opacity-10 flex-shrink-0">
                  {meal.imageUrl ? (
                    <Image
                      src={meal.imageUrl}
                      alt={meal.analysis.description?.substring(0, 20) || "Meal"}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="80px"
                      className="transition-opacity duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full w-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  <p className="font-medium text-secondary">{meal.analysis.description?.substring(0, 50) || 'Mindful Meal'}{meal.analysis.description && meal.analysis.description.length > 50 ? '...' : ''}</p>
                  <div className="flex justify-between items-center mt-1">
                    <div className="flex items-center">
                      {meal.analysis.goalName && (
                        <span className="text-xs bg-sky bg-opacity-20 text-secondary px-2 py-0.5 rounded-full">
                          {meal.analysis.goalName}
                        </span>
                      )}
                      {meal.analysis.goalScore && (
                        <span className={`ml-2 text-xs font-medium ${
                          meal.analysis.goalScore >= 8 ? 'text-green-600' : 
                          meal.analysis.goalScore >= 5 ? 'text-amber-600' : 
                          'text-rose-600'}`}>
                          Score: {meal.analysis.goalScore}/10
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {meal.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
} 