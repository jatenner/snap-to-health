'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { trySaveMeal } from '@/lib/mealUtils';
import { isValidAnalysis, createFallbackAnalysis } from '@/lib/utils/analysisValidator';
import ErrorCard from '@/components/ErrorCard';

interface Nutrient {
  name: string;
  value: string;
  unit: string;
  isHighlight: boolean;
}

interface DetailedIngredient {
  name: string;
  category: string;
  confidence: number;
  confidenceEmoji: string;
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
  partial?: boolean;
  missing?: string;
  confidence?: number;
  detailedIngredients?: DetailedIngredient[];
  reasoningLogs?: any[];
  fallback?: boolean;
  lowConfidence?: boolean;
  failureReason?: string;
  insight?: string;
  message?: string;
  modelInfo?: {
    model: string;
    usedFallback: boolean;
    ocrExtracted: boolean;
  };
}

// Component to display ingredients with confidence levels
const IngredientsList = ({ ingredients }: { ingredients: DetailedIngredient[] }) => {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  
  return (
    <div className="mt-4">
      <div className="flex items-center mb-2">
        <h3 className="text-base font-medium text-gray-800">Identified Ingredients</h3>
        <button 
          className="ml-2 text-primary hover:text-secondary transition-colors"
          onClick={() => setShowConfidenceInfo(!showConfidenceInfo)}
          aria-label="Show confidence information"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
      
      {showConfidenceInfo && (
        <div className="bg-slate-50 p-3 rounded-md mb-3 text-xs text-slate-700 border border-slate-200">
          <p className="mb-1 font-medium">Confidence Indicators:</p>
          <ul className="space-y-1">
            <li className="flex items-center"><span className="mr-2">🟢</span> High confidence (8-10)</li>
            <li className="flex items-center"><span className="mr-2">🟡</span> Medium confidence (5-7)</li>
            <li className="flex items-center"><span className="mr-2">🔴</span> Low confidence (1-4)</li>
          </ul>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ingredients.map((ingredient, index) => (
          <div 
            key={index} 
            className="flex items-center py-1.5 px-2.5 bg-white rounded-md border border-gray-200 shadow-sm"
          >
            <span className="mr-2">{ingredient.confidenceEmoji}</span>
            <span className="flex-1 text-sm">{ingredient.name}</span>
            {ingredient.category && ingredient.category !== 'unknown' && (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {ingredient.category}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// SaveStatusBanner component to show when meal is not saved
const SaveStatusBanner = ({ 
  mealSaved, 
  fallback = false,
  lowConfidence = false,
  saveError = null,
  userId = null
}: { 
  mealSaved: boolean; 
  fallback?: boolean;
  lowConfidence?: boolean;
  saveError?: string | null;
  userId?: string | null;
}) => {
  if (mealSaved) return null;
  
  let message = '';
  let icon: React.ReactNode = null;
  let bgColor = '';
  let borderColor = '';
  let textColor = '';
  let actionLink = null;
  
  if (fallback || lowConfidence) {
    // Unable to save due to low confidence or fallback
    message = "⚠️ Meal not saved due to low confidence or unclear image quality.";
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    );
    bgColor = "bg-amber-50";
    borderColor = "border-amber-300";
    textColor = "text-amber-800";
    actionLink = (
      <Link href="/upload" className="text-amber-800 font-medium underline">
        Try another image
      </Link>
    );
  } else if (saveError) {
    // Save operation failed for a specific reason
    message = saveError || "Failed to save meal. Please try again.";
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    );
    bgColor = "bg-red-50";
    borderColor = "border-red-300";
    textColor = "text-red-800";
    actionLink = (
      <Link href="/upload" className="text-red-800 font-medium underline">
        Try again
      </Link>
    );
  } else if (!userId) {
    // User not signed in
    message = "🔒 Sign in to save this meal to your health history.";
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
    );
    bgColor = "bg-blue-50";
    borderColor = "border-blue-300";
    textColor = "text-blue-800";
    actionLink = (
      <Link href="/login" className="text-blue-800 font-medium underline">
        Sign in
      </Link>
    );
  } else {
    // Generic case - not saved for other reasons
    message = "This meal analysis has not been saved to your history.";
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    );
    bgColor = "bg-gray-50";
    borderColor = "border-gray-300";
    textColor = "text-gray-800";
  }
  
  return (
    <div className={`mb-4 ${bgColor} border ${borderColor} rounded-lg p-3 sm:p-4 text-sm sm:text-base ${textColor}`}>
      <div className="flex items-start">
        <div className="mr-2 mt-0.5 flex-shrink-0">
          {icon}
        </div>
        <div>
          <p>{message}</p>
          {actionLink && <div className="mt-2">{actionLink}</div>}
        </div>
      </div>
    </div>
  );
};

/**
 * Component to display a warning when using a fallback model
 */
const ModelWarningBanner = ({ modelInfo }: { modelInfo?: AnalysisResult['modelInfo'] }) => {
  // If no model info or OCR-based analysis is being used without fallback, don't show warning
  if (!modelInfo || !modelInfo.usedFallback) {
    return null;
  }
  
  return (
    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800">Limited Analysis Mode</h3>
          <div className="mt-1 text-xs text-amber-700">
            <p>Analysis was performed using a fallback method. Results may be less accurate.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// FallbackWarningBanner component to show when displaying fallback results
const FallbackWarningBanner = ({ fallback }: { fallback?: boolean }) => {
  if (!fallback) return null;
  
  return (
    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800">Fallback Analysis</h3>
          <div className="mt-1 text-xs text-amber-700">
            <p>We couldn't analyze this meal in detail. These are default values and generic suggestions.</p>
            <p className="mt-1">For better results, try uploading a clearer photo with good lighting.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function MealAnalysisPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<string>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [fallbackInfo, setFallbackInfo] = useState<AnalysisResult | null>(null);
  const router = useRouter();
  const { currentUser } = useAuth();

  // Check if the meal was saved
  const [mealSaved, setMealSaved] = useState<boolean>(false);
  const [savedImageUrl, setSavedImageUrl] = useState<string>('');
  const [savedMealId, setSavedMealId] = useState<string>('');
  const [animationComplete, setAnimationComplete] = useState<boolean>(false);
  
  // Get save error if present
  const [saveError, setSaveError] = useState<string | null>(null);
  
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
    
    // Check for stored fallback result from the upload page
    const storedFallbackResult = sessionStorage.getItem('fallbackResult');
    if (storedFallbackResult) {
      try {
        const fallbackData = JSON.parse(storedFallbackResult);
        console.warn("Fallback data detected from upload page:", fallbackData);
        setFallbackInfo({
          ...fallbackData,
          fallback: true,
          failureReason: fallbackData.message || "Image could not be processed completely."
        });
        setError("Analysis Fallback");
        setLoading(false);
        setLoadingStage('error');
        // Clear the fallback data to prevent showing it again on refresh
        sessionStorage.removeItem('fallbackResult');
        return;
      } catch (parseError) {
        console.error("Failed to parse fallback result:", parseError);
      }
    }
    
    if (storedResult) {
      try {
        setLoadingStage('parsing');
        
        // Log the raw response for debugging
        console.log("Raw analysis result:", storedResult);
        
        let parsedResult;
        try {
          parsedResult = JSON.parse(storedResult);
        } catch (parseError) {
          console.warn("Invalid analysis data (parse error):", storedResult);
          console.error('Failed to parse JSON:', parseError);
          throw new Error('Invalid analysis data: failed to parse JSON');
        }
        
        // Check if the result has basic structure needed for display
        // We now accept fallback results as long as they have the minimum required fields
        if (!isValidAnalysis(parsedResult)) {
          console.warn("Invalid analysis data (structure validation failed):", parsedResult);
          setError("Received incomplete analysis data.");
          setLoading(false);
          setLoadingStage('error');
          sessionStorage.removeItem('analysisResult');
          sessionStorage.removeItem('previewUrl');
          return;
        }
        
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
      } catch (err: any) {
        console.error('Failed to process stored analysis result:', err);
        
        // Create a user-friendly error message
        const errorMessage = err.message && err.message.includes('Invalid analysis data') 
          ? 'Something went wrong processing your meal data. Please try again or upload a different image.'
          : 'Failed to load analysis results. Please try uploading a new image.';
        
        setError(errorMessage);
        setLoading(false);
        setLoadingStage('error');
      }
    } else {
      // No analysis data found, redirect to upload page
      router.push('/upload');
    }
  }, [router]);

  useEffect(() => {
    // Check for save error in sessionStorage
    const savedError = sessionStorage.getItem('saveError');
    if (savedError) {
      setSaveError(savedError);
    }
  }, []);

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
            {loadingStage === 'error' && 'Error loading analysis...'}
          </div>
        </div>
      </div>
    );
  }

  // Display an error message if something went wrong
  if (error) {
    // ✅ 3. Improved Fallback UI
    if (fallbackInfo) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <ErrorCard
            title="Analysis Failed"
            message={
              fallbackInfo.failureReason || 
              fallbackInfo.message || 
              "The AI couldn't properly analyze this meal image. Please try again with a clearer photo."
            }
            tip="For best results, take photos in good lighting with the food clearly visible. Make sure all food items are in frame and easily distinguishable."
            buttonText="Try Another Photo"
            onClick={() => router.push('/upload')}
          />
        </div>
      );
    } else {
      // Render generic error if no specific fallback info
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <ErrorCard
            title="Analysis Error"
            message={error}
            tip="If this problem persists, try refreshing your browser or uploading a different image."
            buttonText="Try Again"
            onClick={() => router.push('/upload')}
          />
        </div>
      );
    }
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

  // Safely extract and validate the analysis data with fallbacks
  const { 
    description = 'A nutritious meal with various ingredients', 
    nutrients = [], 
    feedback = ['Try to maintain a balanced diet with appropriate portions.'], 
    suggestions = ['Consider incorporating a variety of nutrients in your meals.'], 
    goalScore = 5, 
    goalName = 'Health Impact', 
    scoreExplanation = 'This meal has been analyzed for its nutritional content.',
    positiveFoodFactors = [],
    negativeFoodFactors = [],
    rawGoal = 'Improve overall health'
  } = analysisResult;

  // Group nutrients into categories - with validation to prevent errors
  const macros = Array.isArray(nutrients) ? nutrients.filter(n => 
    ['protein', 'carbs', 'fat', 'calories'].some(
      macro => n && n.name && n.name.toLowerCase().includes(macro)
    )
  ) : [];
  
  const micronutrients = Array.isArray(nutrients) ? nutrients.filter(n => 
    n && n.name && !['protein', 'carbs', 'fat', 'calories'].some(
      macro => n.name.toLowerCase().includes(macro)
    ) && n.isHighlight
  ) : [];
  
  const otherNutrients = Array.isArray(nutrients) ? nutrients.filter(n => 
    n && n.name && !['protein', 'carbs', 'fat', 'calories'].some(
      macro => n.name.toLowerCase().includes(macro)
    ) && !n.isHighlight
  ) : [];

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
    <div className="pb-20 sm:pb-24 md:pb-12">
      {/* Sticky header for mobile */}
      <header className="fixed top-0 w-full bg-white z-10 md:hidden shadow-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <h1 className="text-lg font-bold text-primary truncate">Meal Analysis</h1>
          <button
            onClick={() => router.back()}
            className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto pt-14 md:pt-0 px-3 sm:px-4">
        {/* Desktop back button */}
        <div className="hidden md:block mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back
          </button>
        </div>

        <SaveStatusBanner 
          mealSaved={mealSaved} 
          fallback={Boolean(analysisResult.fallback)}
          lowConfidence={Boolean(analysisResult.lowConfidence)}
          saveError={saveError}
          userId={currentUser?.uid || null}
        />
        
        {/* Show fallback warning banner for fallback results */}
        <FallbackWarningBanner fallback={analysisResult.fallback} />
        
        {/* Show model warning banner for fallback models */}
        <ModelWarningBanner modelInfo={analysisResult.modelInfo} />

        {/* Main analysis section */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
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
            
            {/* Ingredients List */}
            {analysisResult?.detailedIngredients && analysisResult.detailedIngredients.length > 0 && (
              <div className="mb-6">
                <h2 className="font-bold text-navy text-lg mb-3 flex items-center">
                  <span className="text-teal-600 mr-2">🧪</span>
                  Identified Ingredients
                </h2>
                <div className="bg-white border border-slate/20 rounded-xl p-4">
                  <IngredientsList ingredients={analysisResult.detailedIngredients} />
                </div>
              </div>
            )}
            
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
      </div>
    </div>
  );
} 