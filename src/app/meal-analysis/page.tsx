'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface Nutrient {
  name: string;
  value: string;
  unit: string;
  isHighlight: boolean;
}

interface AnalysisResult {
  description: string;
  nutrients: Nutrient[];
  feedback: string[];
  suggestions: string[];
  sleepScore?: number;
  goalScore?: number;
  goalName?: string;
  scoreExplanation?: string;
  positiveFoodFactors?: string[];
  negativeFoodFactors?: string[];
  rawGoal?: string;
}

export default function MealAnalysisPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<string>('initializing');
  const router = useRouter();
  const { currentUser } = useAuth();

  // Check if the meal was saved
  const [mealSaved, setMealSaved] = useState<boolean>(false);
  const [savedImageUrl, setSavedImageUrl] = useState<string>('');
  const [savedMealId, setSavedMealId] = useState<string>('');
  const [animationComplete, setAnimationComplete] = useState<boolean>(false);
  
  useEffect(() => {
    // Get saved status from sessionStorage
    const savedStatus = sessionStorage.getItem('mealSaved') === 'true';
    setMealSaved(savedStatus);
    
    if (savedStatus) {
      setSavedImageUrl(sessionStorage.getItem('savedImageUrl') || '');
      setSavedMealId(sessionStorage.getItem('savedMealId') || '');
    }
  }, []);

  useEffect(() => {
    // Check if we have analysis data in sessionStorage
    const storedResult = sessionStorage.getItem('analysisResult');
    const storedPreviewUrl = sessionStorage.getItem('previewUrl');
    
    if (storedResult) {
      try {
        setLoadingStage('parsing');
        const parsedResult = JSON.parse(storedResult);
        
        // Set preview image first for perceived performance
        if (storedPreviewUrl) {
          setPreviewUrl(storedPreviewUrl);
        }
        
        // Slight delay before showing results to allow for animation
        setTimeout(() => {
          setLoadingStage('rendering');
          setAnalysisResult(parsedResult);
          
          // Complete loading after a small delay to allow for rendering
          setTimeout(() => {
            setLoadingStage('complete');
            setLoading(false);
            
            // Trigger score animations after rendering is complete
            setTimeout(() => {
              setAnimationComplete(true);
            }, 300);
          }, 100);
        }, 300);
      } catch (err) {
        console.error('Failed to parse stored analysis result:', err);
        setLoading(false);
        setLoadingStage('error');
      }
    } else {
      // No analysis data found, redirect to upload page
      router.push('/upload');
    }
  }, [router]);

  // Render loading skeleton
  if (loading && loadingStage !== 'complete') {
    return (
      <div className="max-w-2xl mx-auto pb-12 animate-fade-in">
        <div className="bg-white shadow-lab rounded-xl overflow-hidden mb-6 transition-all">
          {/* Skeleton for meal photo */}
          <div className="relative w-full h-64 bg-gray-200 animate-pulse"></div>

          <div className="p-6 space-y-6">
            {/* Skeleton for title */}
            <div className="h-7 w-1/3 bg-gray-200 rounded animate-pulse"></div>
            
            {/* Skeleton for score card */}
            <div className="h-40 w-full bg-gray-100 rounded-lg animate-pulse"></div>
            
            {/* Skeleton for sections */}
            <div className="space-y-4">
              <div className="h-6 w-2/5 bg-gray-200 rounded animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-24 w-full bg-gray-100 rounded-lg animate-pulse"></div>
              </div>
            </div>
            
            {/* Skeleton for another section */}
            <div className="space-y-4">
              <div className="h-6 w-2/5 bg-gray-200 rounded animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-24 w-full bg-gray-100 rounded-lg animate-pulse"></div>
              </div>
            </div>
            
            {/* Skeleton for buttons */}
            <div className="flex space-x-3 pt-4">
              <div className="h-12 w-1/2 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-12 w-1/2 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
          
          <div className="absolute bottom-4 right-4 text-xs text-gray-400">
            {loadingStage === 'initializing' && 'Loading data...'}
            {loadingStage === 'parsing' && 'Processing analysis...'}
            {loadingStage === 'rendering' && 'Preparing insights...'}
          </div>
        </div>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto bg-white shadow-lab rounded-xl p-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">No Analysis Found</h2>
          <p className="text-gray-600 mb-6">Please upload a meal photo to analyze.</p>
          <Link 
            href="/upload" 
            className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Upload Meal Photo
          </Link>
        </div>
      </div>
    );
  }

  // Extract the analysis data
  const { 
    description, 
    nutrients, 
    feedback, 
    suggestions, 
    goalScore = 5, 
    goalName = 'Health Impact', 
    scoreExplanation = '',
    positiveFoodFactors = [],
    negativeFoodFactors = [],
    rawGoal
  } = analysisResult;

  // Group nutrients into categories
  const macros = nutrients.filter(n => 
    ['protein', 'carbs', 'fat', 'calories'].some(
      macro => n.name.toLowerCase().includes(macro)
    )
  );
  
  const micronutrients = nutrients.filter(n => 
    !['protein', 'carbs', 'fat', 'calories'].some(
      macro => n.name.toLowerCase().includes(macro)
    ) && n.isHighlight
  );
  
  const otherNutrients = nutrients.filter(n => 
    !['protein', 'carbs', 'fat', 'calories'].some(
      macro => n.name.toLowerCase().includes(macro)
    ) && !n.isHighlight
  );

  // Generate score color based on value
  const getScoreColor = (value: number) => {
    if (value >= 8) return 'bg-green-500';
    if (value >= 5) return 'bg-yellow-400';
    return 'bg-red-500';
  };

  // Get goal icon based on goal name
  const getGoalIcon = (goalName: string) => {
    const name = goalName.toLowerCase();
    if (name.includes('sleep')) return '💤';
    if (name.includes('weight')) return '⚖️';
    if (name.includes('muscle')) return '💪';
    if (name.includes('energy')) return '⚡';
    if (name.includes('heart')) return '❤️';
    if (name.includes('recovery')) return '🔄';
    if (name.includes('run')) return '🏃';
    if (name.includes('performance')) return '🏆';
    return '🎯';
  };

  // Get score label
  const getScoreLabel = (score: number) => {
    if (score >= 9) return "Excellent";
    if (score >= 7) return "Very Good";
    if (score >= 5) return "Good";
    if (score >= 3) return "Fair";
    return "Needs Improvement";
  };

  return (
    <main className="max-w-2xl mx-auto pb-12">
      <div className={`bg-white shadow-lab rounded-xl overflow-hidden mb-6 transition-all duration-500 ${animationComplete ? 'opacity-100' : 'opacity-90'}`}>
        {/* Summary Section: Photo + Score */}
        <div className="relative">
          {previewUrl && (
            <div className="relative w-full h-64 bg-gray-100">
              <Image
                src={previewUrl}
                alt="Analyzed meal"
                fill
                style={{ objectFit: 'cover' }}
                className="transition-opacity duration-300"
                priority
              />
              {/* Score Overlay */}
              <div className="absolute bottom-0 right-0 p-3">
                <div className="bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lab flex items-center">
                  <div 
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${getScoreColor(goalScore)}`}
                  >
                    {goalScore}
                  </div>
                  <div className="ml-2">
                    <span className="text-xs font-medium uppercase text-gray-500">Score</span>
                    <p className="text-sm font-medium">{getScoreLabel(goalScore)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6">
          {/* Header with Goal Context */}
          <div className="mb-6">
            <div className="flex items-center mb-2">
              <span className="text-3xl mr-3">{getGoalIcon(goalName)}</span>
              <div>
                <h1 className="text-2xl font-bold text-navy">{goalName} Analysis</h1>
                <p className="text-slate text-sm">Goal: {rawGoal}</p>
              </div>
            </div>
            
            {/* Saved Status Indicator */}
            {mealSaved ? (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 mt-4 flex items-start">
                <span className="text-green-600 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <p className="text-green-800 font-medium">
                    Meal saved to your history
                  </p>
                  <Link 
                    href={`/meals/${savedMealId}`}
                    className="text-primary text-sm mt-1 inline-block hover:underline transition-colors"
                  >
                    View in meal history →
                  </Link>
                </div>
              </div>
            ) : currentUser ? (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4 flex items-start">
                <span className="text-blue-600 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <p className="text-blue-800">
                    Quick analysis only (not saved)
                  </p>
                  <Link 
                    href="/upload"
                    className="text-primary text-sm mt-1 inline-block hover:underline transition-colors"
                  >
                    Save meals to track your progress →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4 flex items-start">
                <span className="text-blue-600 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <p className="text-blue-800">
                    Quick analysis only (not saved)
                  </p>
                  <Link 
                    href="/login"
                    className="text-primary text-sm mt-1 inline-block hover:underline transition-colors"
                  >
                    Sign in to save your analysis →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Score Card with Score Explanation */}
          <div className="mb-8 bg-white rounded-xl border border-slate/20 shadow-sm p-5">
            <h2 className="font-bold text-navy text-lg mb-3">Goal Impact Score: {goalScore}/10</h2>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
              <div 
                className={`h-3 rounded-full transition-all duration-1000 ease-out ${getScoreColor(goalScore)}`}
                style={{ width: animationComplete ? `${goalScore * 10}%` : '0%' }}
              ></div>
            </div>
            
            <p className="text-slate mb-4">{scoreExplanation}</p>
            
            {/* Meal Description */}
            <p className="text-navy text-sm italic border-t border-slate/10 pt-3 mt-2">{description}</p>
          </div>

          {/* How It Helps Your Goal Section */}
          {positiveFoodFactors.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-navy text-lg mb-3 flex items-center">
                <span className="text-green-600 mr-2">✓</span>
                How This Meal Supports Your Goal
              </h2>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <ul className="space-y-2.5">
                  {positiveFoodFactors.map((factor, index) => (
                    <li key={index} className="flex">
                      <span className="text-green-600 mr-2.5 mt-0.5">•</span>
                      <span className="text-slate">{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* What May Hold You Back Section */}
          {negativeFoodFactors.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-navy text-lg mb-3 flex items-center">
                <span className="text-amber-600 mr-2">⚠️</span>
                What May Hold You Back
              </h2>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <ul className="space-y-2.5">
                  {negativeFoodFactors.map((factor, index) => (
                    <li key={index} className="flex">
                      <span className="text-amber-600 mr-2.5 mt-0.5">•</span>
                      <span className="text-slate">{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Expert Suggestions Section */}
          {suggestions && suggestions.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-navy text-lg mb-3 flex items-center">
                <span className="text-indigo mr-2">💡</span>
                Personalized Expert Suggestions
              </h2>
              <div className="bg-indigo/5 border border-indigo/20 rounded-xl p-4">
                <ul className="space-y-2.5">
                  {suggestions.map((suggestion, index) => (
                    <li key={index} className="flex">
                      <span className="text-indigo mr-2.5 mt-0.5 shrink-0">{index + 1}.</span>
                      <span className="text-slate">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Nutritional Harmony Section */}
          <div className="mb-6">
            <h2 className="font-bold text-navy text-lg mb-3 flex items-center">
              <span className="text-forest mr-2">📊</span>
              Nutritional Breakdown
            </h2>
            
            {/* Macronutrients */}
            {macros.length > 0 && (
              <div className="bg-white border border-slate/20 rounded-xl p-4 mb-4">
                <h3 className="text-navy font-medium text-sm uppercase mb-3">Macronutrients</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {macros.map((nutrient, index) => (
                    <div 
                      key={`macro-${index}`}
                      className="bg-gray-50 rounded-lg p-3 transition-all hover:shadow-sm"
                    >
                      <p className="text-xs font-medium text-slate uppercase">{nutrient.name}</p>
                      <p className="text-lg font-bold text-navy">{nutrient.value}<span className="text-xs ml-1">{nutrient.unit}</span></p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Micronutrients - Beneficial for Goal */}
            {micronutrients.length > 0 && (
              <div className="bg-white border border-slate/20 rounded-xl p-4 mb-4">
                <h3 className="text-navy font-medium text-sm uppercase mb-3 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  Key Nutrients for Your Goal
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {micronutrients.map((nutrient, index) => (
                    <div 
                      key={`micro-${index}`}
                      className="bg-green-50 rounded-lg p-3 border border-green-100"
                    >
                      <p className="text-xs font-medium text-slate uppercase">{nutrient.name}</p>
                      <p className="text-md font-bold text-navy">{nutrient.value}<span className="text-xs ml-1">{nutrient.unit}</span></p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Other Nutrients - Regular and Negative */}
            {otherNutrients.length > 0 && (
              <div className="bg-white border border-slate/20 rounded-xl p-4">
                <h3 className="text-navy font-medium text-sm uppercase mb-3">Additional Nutrients</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {otherNutrients.map((nutrient, index) => {
                    // Determine if this is a negative nutrient (like sugar, sodium, etc.)
                    const isNegative = ['sugar', 'sodium', 'caffeine', 'saturated', 'cholesterol'].some(
                      neg => nutrient.name.toLowerCase().includes(neg)
                    );
                    
                    return (
                      <div 
                        key={`other-${index}`}
                        className={`rounded-lg p-3 ${isNegative ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100'}`}
                      >
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-medium text-slate uppercase">{nutrient.name}</p>
                          {isNegative && <span className="w-2 h-2 rounded-full bg-amber-500"></span>}
                        </div>
                        <p className="text-md font-bold text-navy">{nutrient.value}<span className="text-xs ml-1">{nutrient.unit}</span></p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Link
              href="/upload"
              className="flex-1 bg-primary hover:bg-secondary text-white text-center font-medium py-3 px-4 rounded-lg transition-colors shadow-sm"
            >
              Analyze Another Meal
            </Link>
            
            {mealSaved ? (
              <Link
                href="/history"
                className="flex-1 bg-white hover:bg-gray-50 text-navy border border-gray-200 text-center font-medium py-3 px-4 rounded-lg transition-colors shadow-sm"
              >
                View Meal History
              </Link>
            ) : currentUser ? (
              <Link
                href="/upload"
                className="flex-1 bg-white hover:bg-gray-50 text-navy border border-gray-200 text-center font-medium py-3 px-4 rounded-lg transition-colors shadow-sm"
              >
                Save Meals to Track Progress
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex-1 bg-white hover:bg-gray-50 text-navy border border-gray-200 text-center font-medium py-3 px-4 rounded-lg transition-colors shadow-sm"
              >
                Sign In to Save Analysis
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
} 