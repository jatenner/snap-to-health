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
    feedback?: string[];
    suggestions?: string[];
    goalScore?: number;
    goalName?: string;
    scoreExplanation?: string;
    positiveFoodFactors?: string[];
    negativeFoodFactors?: string[];
    sleepScore?: number;
    rawGoal?: string;
    lowConfidence?: boolean;
    fallback?: boolean;
    message?: string;
    detailedIngredients?: {
      name: string;
      category: string;
      confidence: number;
      confidenceEmoji?: string;
    }[];
    reasoningLogs?: string[];
    partialResults?: boolean;
    missing?: string[];
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
          // Check if we have analysis in session storage (from meal-analysis page)
          try {
            const analysisResult = sessionStorage.getItem('analysisResult');
            const imageUrl = sessionStorage.getItem('previewUrl');
            
            if (analysisResult && imageUrl && mealId) {
              const parsedAnalysis = JSON.parse(analysisResult);
              const sessionMeal = {
                id: mealId,
                mealName: 'Unsaved Meal',
                imageUrl: imageUrl,
                createdAt: new Date(),
                analysis: parsedAnalysis,
                goalType: parsedAnalysis.goalName || 'General Health',
                goalScore: parsedAnalysis.goalScore || 5,
                goal: parsedAnalysis.rawGoal || 'General Health'
              };
              
              setMeal(sessionMeal);
              setEditedMealName(sessionMeal.mealName);
              setLoadingStage('session');
              setError('This meal is in your session but not saved to your account.');
            } else {
              setError('Meal not found');
              setLoadingStage('error');
            }
          } catch (sessionErr) {
            console.warn('Failed to load session meal:', sessionErr);
            setError('Meal not found');
            setLoadingStage('error');
          }
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

  // Component to display ingredients with confidence levels
  const IngredientsWithConfidence = ({ ingredients }: { ingredients: SavedMealDetails['analysis']['detailedIngredients'] }) => {
    if (!ingredients || ingredients.length === 0) return null;

    const getConfidenceEmoji = (confidence: number): string => {
      if (confidence >= 8) return '🟢';
      if (confidence >= 5) return '🟡';
      return '🔴';
    };

    const getConfidenceClass = (confidence: number): string => {
      if (confidence >= 8) return 'text-green-600';
      if (confidence >= 5) return 'text-amber-600';
      return 'text-rose-600';
    };

    return (
      <div className="mt-4 p-4 bg-background rounded-lg border border-stone border-opacity-30">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center">
          <span className="inline-block w-6 h-6 rounded-full bg-primary bg-opacity-20 flex items-center justify-center mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </span>
          Ingredients Detected
        </h3>
        <div className="space-y-2">
          {ingredients.map((ingredient, index) => {
            const confidenceEmoji = ingredient.confidenceEmoji || getConfidenceEmoji(ingredient.confidence);
            const confidenceClass = getConfidenceClass(ingredient.confidence);
            
            return (
              <div key={index} className="flex justify-between items-center p-2 bg-white rounded-md border border-stone border-opacity-20">
                <div className="flex items-center">
                  <span className="text-lg mr-2">{confidenceEmoji}</span>
                  <span className="font-medium text-gray-800">{ingredient.name}</span>
                  {ingredient.category && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {ingredient.category}
                    </span>
                  )}
                </div>
                <span className={`text-sm font-medium ${confidenceClass}`}>
                  {ingredient.confidence.toFixed(1)}/10
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Component to display confidence warnings
  const AnalysisConfidenceWarning = ({ analysis }: { analysis: SavedMealDetails['analysis'] }) => {
    const [expanded, setExpanded] = useState(false);
    
    if (!analysis.lowConfidence && !analysis.fallback) return null;
    
    const warningType = analysis.fallback ? 'fallback' : 'lowConfidence';
    const warningTitle = analysis.fallback ? 'Analysis Fallback' : 'Low Confidence Analysis';
    
    // Safer approach for dynamic classes
    const bgClass = analysis.fallback ? 'bg-red-50' : 'bg-yellow-50';
    const borderClass = analysis.fallback ? 'border-red-100' : 'border-yellow-100';
    const textClass = analysis.fallback ? 'text-red-800' : 'text-yellow-800';
    const iconClass = analysis.fallback ? 'text-red-500' : 'text-yellow-500';
    const buttonClass = analysis.fallback ? 'text-red-700' : 'text-yellow-700';
    
    const warningMessage = analysis.message || (
      analysis.fallback 
        ? "We had trouble analyzing your meal completely. Here's what we could detect."
        : "The image may be unclear, but we've provided our best analysis. Results might be limited."
    );
    
    const missingItems = analysis.missing?.length 
      ? analysis.missing 
      : ['Complete nutritional breakdown', 'Accurate calorie estimation'];
      
    const improvementTips = [
      "Ensure food items are clearly visible in the photo",
      "Try to capture the entire plate in the image",
      "Avoid extreme close-ups or distant shots",
      analysis.fallback ? "Try uploading a different image" : "Better lighting can improve analysis"
    ];
    
    return (
      <div className={`px-4 py-3 mb-4 ${bgClass} border ${borderClass} ${textClass} text-sm rounded-lg`}>
        <div className="flex items-start">
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 ${iconClass} mt-0.5 flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {warningType === 'fallback' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            )}
          </svg>
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <p className="font-medium">{warningTitle}</p>
              <button 
                onClick={() => setExpanded(!expanded)}
                className={`${buttonClass} text-xs ml-2 underline`}
              >
                {expanded ? 'Show Less' : 'Show More'}
              </button>
            </div>
            <p className="mt-1">{warningMessage}</p>
            
            {expanded && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="font-medium mb-1">What might be missing:</p>
                  <ul className="list-disc list-inside pl-2 space-y-1 text-xs">
                    {missingItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <p className="font-medium mb-1">Tips for better analysis:</p>
                  <ul className="list-disc list-inside pl-2 space-y-1 text-xs">
                    {improvementTips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Simple tooltip component
  const Tooltip = ({ text, children }: { text: string, children: React.ReactNode }) => {
    return (
      <div className="group relative inline-flex">
        {children}
        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
          <div className="bg-gray-800 text-white text-xs rounded py-1 px-2 max-w-xs">
            {text}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2">
              <div className="border-t-4 border-l-4 border-r-4 border-transparent border-t-gray-800 w-2 h-2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Component to display goal score with confidence indicators
  const GoalScoreDisplay = ({ score, goalName, lowConfidence, fallback }: { 
    score?: number, 
    goalName?: string,
    lowConfidence?: boolean,
    fallback?: boolean 
  }) => {
    if (!score) return null;
    
    const getScoreColor = (value: number) => {
      if (value >= 8) return 'bg-green-500';
      if (value >= 5) return 'bg-yellow-400';
      return 'bg-red-500';
    };
    
    const getScoreLabel = (value: number) => {
      if (value >= 8) return 'Excellent';
      if (value >= 6) return 'Good';
      if (value >= 4) return 'Fair';
      return 'Needs Improvement';
    };
    
    const getScoreText = () => {
      if (fallback) return "Based on limited data";
      if (lowConfidence) return "Based on partial analysis";
      return `${getScoreLabel(score)} for ${goalName || 'Health'}`;
    };
    
    const getTooltipText = () => {
      if (fallback) {
        return "This score is an estimate based on limited data. The analysis could not fully process all aspects of the meal.";
      }
      if (lowConfidence) {
        return "This score is based on a partial analysis. Some nutritional data may be incomplete or estimated.";
      }
      return `A score of ${score}/10 indicates ${getScoreLabel(score).toLowerCase()} alignment with your ${goalName || 'health'} goals.`;
    };
    
    return (
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <h3 className="text-lg font-medium text-gray-800 mr-2">
            {goalName || 'Health'} Impact Score
          </h3>
          {(lowConfidence || fallback) && (
            <Tooltip text={getTooltipText()}>
              <span className="text-yellow-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            </Tooltip>
          )}
        </div>
        
        <div className="bg-gray-200 rounded-full h-4 mb-2">
          <div 
            className={`h-4 rounded-full ${getScoreColor(score)}`} 
            style={{ width: `${score * 10}%` }}
          ></div>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">{getScoreText()}</span>
          <span className="font-medium">{score}/10</span>
        </div>
      </div>
    );
  };
  
  // Component to display reasoning logs
  const ReasoningLogs = ({ logs }: { logs?: string[] }) => {
    const [expanded, setExpanded] = useState(false);
    
    if (!logs || logs.length === 0) return null;
    
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium text-gray-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Analysis Logs
          </h3>
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-primary text-xs underline"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
        
        {expanded && (
          <div className="bg-white p-3 rounded border border-gray-200 text-xs font-mono text-gray-700 max-h-64 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="mb-2 pb-2 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                <span className="text-gray-500">Step {index + 1}:</span> {log}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Component to display suggestions and feedback
  const SuggestionsAndFeedback = ({ suggestions, feedback }: { 
    suggestions?: string[], 
    feedback?: string[] 
  }) => {
    if ((!suggestions || suggestions.length === 0) && (!feedback || feedback.length === 0)) {
      return null;
    }
    
    return (
      <div className="mt-4 space-y-4">
        {feedback && feedback.length > 0 && (
          <div className="bg-background rounded-lg p-4 border border-stone border-opacity-30">
            <h3 className="font-medium text-gray-800 mb-3 flex items-center">
              <span className="inline-block w-6 h-6 rounded-full bg-primary bg-opacity-20 flex items-center justify-center mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              Nutritional Feedback
            </h3>
            <ul className="space-y-2">
              {feedback.map((item, index) => (
                <li key={index} className="text-sm text-gray-700 pl-4 border-l-2 border-primary">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {suggestions && suggestions.length > 0 && (
          <div className="bg-background rounded-lg p-4 border border-stone border-opacity-30">
            <h3 className="font-medium text-gray-800 mb-3 flex items-center">
              <span className="inline-block w-6 h-6 rounded-full bg-accent bg-opacity-20 flex items-center justify-center mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              Wellness Suggestions
            </h3>
            <ul className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="text-sm text-gray-700 flex items-start">
                  <span className="text-accent mr-2">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Component to display a session meal banner
  const SessionMealBanner = () => {
    return (
      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4 animate-fade-in">
        <div className="flex items-start">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium">Unsaved Analysis</p>
            <p className="text-sm">This meal analysis is stored in your browser session but not yet saved to your account.</p>
          </div>
        </div>
      </div>
    );
  };

  // Helper function to check if an analysis object is essentially empty
  const isAnalysisEmpty = (analysis: SavedMealDetails['analysis']) => {
    if (!analysis) return true;
    
    // Check if any of these exist
    const hasBasicData = !!(
      analysis.description || 
      analysis.nutrients?.length || 
      (Array.isArray(analysis.feedback) && analysis.feedback.length > 0) ||
      analysis.suggestions?.length ||
      analysis.positiveFoodFactors?.length ||
      analysis.negativeFoodFactors?.length ||
      analysis.detailedIngredients?.length ||
      analysis.goalScore
    );
    
    return !hasBasicData;
  };
  
  // Component to display when no analysis data is available
  const NoAnalysisData = () => {
    return (
      <div className="p-6 bg-background rounded-md text-center">
        <div className="rounded-full bg-gray-200 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-800 mb-2">No Analysis Available</h3>
        <p className="text-gray-600 mb-4">
          We couldn't find any nutritional analysis data for this meal.
        </p>
        <p className="text-sm text-gray-500">
          Try uploading a new image or check if there was an error during analysis.
        </p>
      </div>
    );
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
          <p className="text-gray-600 mb-6">{!meal ? 'We couldn\'t find the meal you\'re looking for.' : 'There was a problem loading this meal\'s data.'}</p>
          
          {/* Try to recover from session storage if available */}
          {loadingStage === 'session' && meal && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg text-left">
              <p className="text-blue-800 font-medium mb-2">Displaying cached data</p>
              <p className="text-blue-700 text-sm mb-2">This meal analysis is available in your browser session but hasn't been saved to your account.</p>
              <button
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-3 rounded transition-colors"
                onClick={() => {
                  // Logic for saving the meal would go here
                  alert('This would save the meal to your account');
                }}
              >
                Save to Account
              </button>
            </div>
          )}
          
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

        {/* Display session meal banner if needed */}
        {loadingStage === 'session' && (
          <div className="px-5 pt-5">
            <SessionMealBanner />
          </div>
        )}

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
          {/* Confidence warning for the entire analysis */}
          {(meal.analysis.lowConfidence || meal.analysis.fallback) && (
            <AnalysisConfidenceWarning analysis={meal.analysis} />
          )}
          
          {/* Display analysis content if available, otherwise fallback display */}
          {isAnalysisEmpty(meal.analysis) ? (
            <NoAnalysisData />
          ) : (
            <>
              {/* Goal score display */}
              {(meal.goalScore || meal.analysis.goalScore) && (
                <div className="mb-4 animate-fade-in">
                  <GoalScoreDisplay 
                    score={meal.goalScore || meal.analysis.goalScore} 
                    goalName={meal.goalType || meal.analysis.goalName}
                    lowConfidence={meal.analysis.lowConfidence}
                    fallback={meal.analysis.fallback}
                  />
                </div>
              )}
              
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
              
              {/* Positive and negative influences */}
              {((meal.analysis.positiveFoodFactors && meal.analysis.positiveFoodFactors.length > 0) || 
                (meal.analysis.negativeFoodFactors && meal.analysis.negativeFoodFactors.length > 0)) && (
                <div className="grid grid-cols-1 gap-4 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                  {meal.analysis.positiveFoodFactors && meal.analysis.positiveFoodFactors.length > 0 && (
                    <div className="bg-leaf bg-opacity-10 rounded-md p-4 border border-leaf border-opacity-30">
                      <h3 className="font-medium text-gray-800 mb-2 flex items-center">
                        <span className="text-leaf mr-2">✨</span>
                        Nourishing Elements
                      </h3>
                      <ul className="space-y-1">
                        {meal.analysis.positiveFoodFactors.map((factor, index) => (
                          <li key={index} className="text-sm text-gray-600 flex items-start">
                            <span className="text-leaf text-xs mr-2 mt-1">●</span>
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {meal.analysis.negativeFoodFactors && meal.analysis.negativeFoodFactors.length > 0 && (
                    <div className="bg-sand bg-opacity-10 rounded-md p-4 border border-sand border-opacity-30">
                      <h3 className="font-medium text-gray-800 mb-2 flex items-center">
                        <span className="text-sand mr-2">⚠️</span>
                        Mindful Considerations
                      </h3>
                      <ul className="space-y-1">
                        {meal.analysis.negativeFoodFactors.map((factor, index) => (
                          <li key={index} className="text-sm text-gray-600 flex items-start">
                            <span className="text-sand text-xs mr-2 mt-1">●</span>
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
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
                rawGoal: meal.goal || meal.analysis.rawGoal,
                lowConfidence: meal.analysis.lowConfidence,
                fallback: meal.analysis.fallback,
                message: meal.analysis.message
              }}
              previewUrl={null}
              isLoading={loading && loadingStage !== 'complete'}
            />
          </div>
        )}
        
        {/* Ingredients with confidence */}
        {meal.analysis.detailedIngredients && meal.analysis.detailedIngredients.length > 0 && (
          <div className="border-t border-stone border-opacity-30 p-5 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <IngredientsWithConfidence ingredients={meal.analysis.detailedIngredients} />
          </div>
        )}
        
        {/* Suggestions and Feedback */}
        {((meal.analysis.suggestions && meal.analysis.suggestions.length > 0) || 
          (meal.analysis.feedback && Array.isArray(meal.analysis.feedback) && meal.analysis.feedback.length > 0)) && (
          <div className="border-t border-stone border-opacity-30 p-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <SuggestionsAndFeedback 
              suggestions={meal.analysis.suggestions} 
              feedback={Array.isArray(meal.analysis.feedback) ? meal.analysis.feedback : 
                meal.analysis.feedback ? [meal.analysis.feedback] : undefined}
            />
          </div>
        )}
        
        {/* Reasoning logs for developers or advanced users */}
        {meal.analysis.reasoningLogs && meal.analysis.reasoningLogs.length > 0 && (
          <div className="border-t border-stone border-opacity-30 p-5 animate-slide-up" style={{ animationDelay: '0.25s' }}>
            <ReasoningLogs logs={meal.analysis.reasoningLogs} />
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