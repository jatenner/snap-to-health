'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import axios, { CancelTokenSource } from 'axios';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { uploadMealImage, saveMealToFirestore } from '@/lib/mealUtils';
import { getUserHealthGoal } from '@/utils/userUtils';
import { toast } from 'react-hot-toast';
import { validateImage, VALID_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/imageProcessing/validateImage';
import ErrorCard from '@/components/ErrorCard';

interface OptimisticResult {
  description: string;
  ingredients: string[];
  feedback?: string[];
  suggestions?: string[];
  goalScore?: number;
  goalName?: string;
  scoreExplanation?: string;
  positiveFoodFactors?: string[];
  negativeFoodFactors?: string[];
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [healthGoal, setHealthGoal] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [saveToAccount, setSaveToAccount] = useState<boolean>(false);
  const [mealName, setMealName] = useState<string>('');
  const [healthGoalLoaded, setHealthGoalLoaded] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { currentUser, loading: authLoading, authInitialized } = useAuth();
  const [showOptions, setShowOptions] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageValidated, setImageValidated] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    // Only check after auth is initialized to avoid flashing redirect
    if (authInitialized && !authLoading) {
      if (!currentUser) {
        console.log('User not authenticated, redirecting to login page');
        setRedirecting(true);
        
        // Add a small timeout to allow for state updates and prevent immediate redirect
        const redirectTimeout = setTimeout(() => {
          router.push('/login');
        }, 100);
        
        return () => clearTimeout(redirectTimeout);
      }
    }
  }, [currentUser, authLoading, authInitialized, router]);

  // Check if camera is available
  const [hasCamera, setHasCamera] = useState(false);
  
  // Fetch user's preferred health goal if signed in
  useEffect(() => {
    const fetchUserHealthGoal = async () => {
      if (currentUser) {
        try {
          const userHealthGoal = await getUserHealthGoal(currentUser.uid);
          if (userHealthGoal) {
            setHealthGoal(userHealthGoal);
          }
          setHealthGoalLoaded(true);
        } catch (error) {
          console.error('Error fetching user health goal:', error);
          setHealthGoalLoaded(true);
        }
      } else if (authInitialized) {
        // Set default health goal and mark as loaded if no user
        setHealthGoalLoaded(true);
      }
    };
    
    if (authInitialized) {
      fetchUserHealthGoal();
    }
  }, [currentUser, authInitialized]);

  // Camera detection - don't wait for this to complete before rendering
  useEffect(() => {
    // Check if we're in a browser environment and on a device with a camera
    const checkCamera = async () => {
      try {
        if (typeof window !== 'undefined' && navigator?.mediaDevices?.getUserMedia) {
          // Try to access the camera
          await navigator.mediaDevices.getUserMedia({ video: true });
          setHasCamera(true);
        }
      } catch (error) {
        // Camera permission denied or not available
        console.log('Camera not available:', error);
        setHasCamera(false);
      }
    };
    
    checkCamera();
  }, []);

  // Update saveToAccount only when auth state changes
  useEffect(() => {
    // Only set this if auth has initialized
    if (authInitialized) {
      setSaveToAccount(!!currentUser);
    }
  }, [currentUser, authInitialized]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
    setImageValidated(true);
    
    if (selectedFile) {
      // Use the validateImage utility
      const validationResult = validateImage(selectedFile);
      if (!validationResult.valid) {
        setError(validationResult.error || 'Invalid image file');
        setFile(null);
        setImagePreview(null);
        setImageValidated(false);
        return;
      }
      
      // Create image preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const img: HTMLImageElement = document.createElement('img') as HTMLImageElement;
        img.onload = () => {
          // Check if image loaded properly
          if (img.width === 0 || img.height === 0) {
            setError('The selected file does not appear to be a valid image.');
            setImageValidated(false);
          } else {
            setImagePreview(event.target?.result as string);
            setImageValidated(true);
          }
        };
        img.onerror = () => {
          setError('Failed to load the image. Please try another one.');
          setImageValidated(false);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        setError('Failed to read the file. Please try another one.');
        setImageValidated(false);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setImagePreview(null);
    }
  };

  const resetImage = () => {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
    setUploadProgress(0);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      
      // Use the validateImage utility
      const validationResult = validateImage(droppedFile);
      if (!validationResult.valid) {
        setError(validationResult.error || 'Invalid image file');
        return;
      }
      
      setFile(droppedFile);
      setPreviewUrl(URL.createObjectURL(droppedFile));
      setError(null);
    }
  };

  const [isCompressingImage, setIsCompressingImage] = useState<boolean>(false);
  const [analysisStage, setAnalysisStage] = useState<string>('');
  const [optimisticResult, setOptimisticResult] = useState<OptimisticResult | null>(null);
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate form inputs
    if (!file) {
      setError("Please select an image file");
      return;
    }
    
    if (!imageValidated) {
      setError("Please select a valid image file");
      return;
    }
    
    // Validate the image again just to be sure
    if (file) {
      const validationResult = validateImage(file);
      if (!validationResult.valid) {
        setError(validationResult.error || 'Invalid image file');
        return;
      }
    }
    
    if (!healthGoal) {
      setError("Please select a health goal");
      return;
    }

    // Reset previous errors
    setIsAnalyzing(true);
    setError(null);
    setUploadProgress(0);
    setAnalysisStage('preparing');
    
    // Show toast for starting analysis
    const analyzeToast = toast.loading('Starting meal analysis...');
    
    try {
      // Create a new cancel token for this request with proper type
      cancelTokenRef.current = axios.CancelToken.source();
      
      // Create optimistic UI state
      setOptimisticResult({
        description: 'Analyzing your meal...',
        ingredients: ['Loading nutritional assessment...'],
        feedback: ['Loading meal suggestions...'],
        suggestions: ['Loading meal suggestions...'],
        goalScore: 0, // Will animate in when real data arrives
        goalName: healthGoal,
        scoreExplanation: 'Calculating impact on your health goal...',
        positiveFoodFactors: ['Identifying beneficial nutrients...'],
        negativeFoodFactors: ['Checking for potential concerns...']
      });
      
      // Create form data for the image
      setAnalysisStage('uploading');
      toast.loading('Uploading image...', { id: analyzeToast });
      
      const formData = new FormData();
      
      // Check if the file size is too large (>5MB)
      if (file.size > 5 * 1024 * 1024) {
        console.log('File size is large, sending a warning');
        toast.loading('Large image detected, processing may take longer...', { id: analyzeToast });
        setError('Image is large, analysis may take longer. Please use images under 5MB for faster results.');
      }
      
      // Use the file directly
      formData.append('image', file);
      
      // Add the health goal to the form data
      formData.append('healthGoal', healthGoal);

      // Send the API request
      setAnalysisStage('analyzing');
      toast.loading('AI is analyzing your meal...', { id: analyzeToast });
      
      const response = await axios.post('/api/analyzeImage', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(percentCompleted);
        },
        cancelToken: cancelTokenRef.current?.token,
        timeout: 60000 // 1 minute timeout
      }).catch((error) => {
        console.error('API request failed:', error);
        
        // Handle specific error scenarios
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          const status = error.response.status;
          const errorData = error.response.data;
          
          console.log(`API error with status ${status}:`, errorData);
          
          if (status === 504) {
            toast.error('Analysis timed out. The server took too long to respond. Please try again with a clearer image.', { id: analyzeToast });
            setError('Server timeout - analysis took too long. Try a clearer image or simpler meal.');
          } else if (status === 429) {
            toast.error('Too many requests. Please try again in a few minutes.', { id: analyzeToast });
            setError('Server is busy processing requests. Please try again in a few minutes.');
          } else if (status === 413) {
            toast.error('Image too large. Please use a smaller image under 5MB.', { id: analyzeToast });
            setError('Image size exceeds server limits. Please compress your image before uploading.');
          } else if (errorData?.error) {
            toast.error(errorData.error, { id: analyzeToast });
            setError(errorData.error);
          } else {
            toast.error(`Analysis failed (Error ${status})`, { id: analyzeToast });
            setError(`Analysis failed with error code ${status}. Please try again later.`);
          }
        } else if (error.request) {
          // The request was made but no response was received
          console.log('No response received:', error.request);
          toast.error('No response from server. Check your internet connection.', { id: analyzeToast });
          setError('Network error - no response from server. Check your internet connection and try again.');
        } else if (error.code === 'ECONNABORTED') {
          // Timeout error
          console.log('Request timed out on client side');
          toast.error('Request timed out. The server is currently busy.', { id: analyzeToast });
          setError('Request timed out. The server might be experiencing heavy load. Please try again later.');
        } else {
          // Something happened in setting up the request that triggered an Error
          console.log('Error setting up request:', error.message);
          toast.error('Failed to send request', { id: analyzeToast });
          setError(`Failed to send request: ${error.message}`);
        }
        
        setIsAnalyzing(false);
        setAnalysisStage('error');
        return null;
      });
      
      // If the response is null (caught by error handler), return early
      if (!response) {
        return;
      }
      
      // Check if response is successful or contains valid data
      if (!response.data || response.data.success === false) {
        // Check if this is a fallback response for unclear images
        if (response.data?.fallback === true) {
          console.log('Received fallback response:', response.data.message || 'unknown reason');
          
          // Cancel any pending toast to avoid confusion
          toast.dismiss(analyzeToast);
          
          // Structured logging for debugging
          console.warn("📊 FALLBACK DETECTED:", {
            message: response.data.message,
            success: response.data.success,
            fallback: response.data.fallback,
            mealSaved: response.data.mealSaved || false,
            error: response.data.error || 'No specific error message',
            missingFields: response.data.payload?.missingFields || ['unknown'],
            requestId: response.data.payload?.requestId || 'unknown',
            trigger: response.data.payload?.trigger || 'unknown'
          });
          
          // Show prominent error toast to user with more detailed information
          toast.error(
            response.data.message || "AI could not analyze this image. Try again with better lighting or clearer food items.", 
            { duration: 7000, position: 'top-center' }
          );
          
          // Store fallback data for display on meal-analysis page
          const fallbackResult = {
            ...response.data,
            fallback: true,
            failureReason: response.data.message || response.data.error || "Unable to analyze image properly",
            timestamp: new Date().toISOString()
          };
          
          sessionStorage.setItem('fallbackResult', JSON.stringify(fallbackResult));
          
          // Show helpful message to the user with specific details if available
          let fallbackMessage = "We couldn't clearly identify your meal.";
          
          if (response.data.payload?.missingFields?.length > 0) {
            fallbackMessage = `We couldn't properly analyze your meal: missing information (${
              response.data.payload.missingFields.slice(0, 2).join(', ')
            }${response.data.payload.missingFields.length > 2 ? '...' : ''}).`;
          } else if (response.data.error) {
            fallbackMessage = response.data.error;
          }
          
          // Add helpful tips
          fallbackMessage += " Try a photo with better lighting and clearer food separation.";
          
          toast.error(fallbackMessage, { duration: 5000 });
          setError(fallbackMessage);
          setIsAnalyzing(false);
          setAnalysisStage('fallback');
          
          // Small delay before redirecting to meal-analysis page
          setTimeout(() => {
            // Redirect to meal-analysis page where the ErrorCard will be displayed
            router.push('/meal-analysis');
          }, 500);
          
          return; // do not proceed to any save attempt
        }
        
        // Handle low confidence results differently from errors
        if (response.data?.lowConfidence) {
          console.log('Low confidence result:', response.data);
          
          toast.custom((t) => (
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
              <div className="flex-1 w-0 p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 pt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Low Confidence Analysis
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      We've done our best with this image, but results may be limited. {response.data.message}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex border-l border-gray-200">
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Close
                </button>
              </div>
            </div>
          ), { duration: 6000 });
          
          // Continue with the low confidence result, but mark it as such
          setAnalysisResult({
            ...response.data,
            lowConfidence: true
          });
        } else {
          // General error handling
          const errorMessage = response.data?.message || response.data?.error || 'Analysis failed. Please try again.';
          console.error('Analysis failed:', errorMessage, response.data);
          
          toast.error(errorMessage, { id: analyzeToast });
          setError(errorMessage);
          setIsAnalyzing(false);
          setAnalysisStage('error');
          return;
        }
      } else {
        console.log('Analysis completed successfully', response.data);
        // Log the upload ID for debugging
        if (response.data.uploadId) {
          console.log('Upload ID:', response.data.uploadId);
        }
        
        setAnalysisResult(response.data);
        toast.success('Analysis complete!', { id: analyzeToast });
      }
      
      // Final validation before storing the result
      try {
        // Log the raw response for debugging
        console.log("Raw analysis result before storing:", response.data);
        
        // Validate analysis structure one more time before storing
        if (!response.data || typeof response.data !== 'object') {
          console.warn('Invalid result structure before storing:', response.data);
          throw new Error('Invalid or corrupted analysis result');
        }
        
        // TODO: Add more comprehensive validation of specific fields
        // Verify that critical fields exist and have the expected types
        const requiredFields = ['description', 'nutrients'];
        const missingFields = requiredFields.filter(field => !(field in response.data));
        
        if (missingFields.length > 0) {
          console.error("Missing required fields in analysis:", missingFields);
          throw new Error(`Invalid analysis data: missing ${missingFields.join(', ')}`);
        }
        
        // Validate array fields
        if (!Array.isArray(response.data.nutrients)) {
          console.error("nutrients is not an array:", response.data.nutrients);
          throw new Error('Invalid analysis data: nutrients must be an array');
        }
        
        let resultToStore = response.data;
        
        // Try to safely stringify the analysis result
        let resultString;
        try {
          resultString = JSON.stringify(resultToStore);
        } catch (stringifyError) {
          console.error('Error stringifying analysis result:', stringifyError);
          throw new Error('Failed to process analysis data for storage');
        }
        
        // Store analysis result and metadata in sessionStorage
        sessionStorage.setItem('analysisResult', resultString);
        sessionStorage.setItem('previewUrl', previewUrl || '');
        sessionStorage.setItem('mealSaved', response.data.saved ? 'true' : 'false');
        
        // Store save error if present
        if (response.data.saveError) {
          sessionStorage.setItem('saveError', response.data.saveError);
        } else {
          // Clear any previous save errors
          sessionStorage.removeItem('saveError');
        }
        
        if (response.data.saved) {
          sessionStorage.setItem('savedImageUrl', response.data.imageUrl);
          sessionStorage.setItem('savedMealId', response.data.mealId);
          sessionStorage.setItem('mealName', response.data.mealName || 'Unnamed Meal');
        }
        
        setAnalysisStage('completed');
        
        // Small delay to allow for animation before redirect
        setTimeout(() => {
          // Redirect to meal analysis page
          router.push('/meal-analysis');
        }, 300);
      } catch (storageError) {
        console.error('Error storing analysis result:', storageError);
        toast.error('Error processing analysis result. Please try again.', { id: analyzeToast });
        setIsAnalyzing(false);
      }
    } catch (error: any) {
      // Check if this is a cancellation error
      if (axios.isCancel(error)) {
        console.log('Request canceled:', error.message);
        toast.error('Analysis was canceled', { id: analyzeToast });
        setIsAnalyzing(false);
        setAnalysisStage('');
        setOptimisticResult(null);
        return;
      }
      
      console.error('Error analyzing image:', error);
      
      // Get the error message from various possible sources
      let errorMsg = 'Failed to analyze image. Please try again.';
      
      if (error.response?.data?.error) {
        // Server returned an error response with data
        errorMsg = error.response.data.error;
      } else if (error.response?.data?.message) {
        // Alternative error format
        errorMsg = error.response.data.message;
      } else if (error.message) {
        // Error object has a message property
        errorMsg = error.message;
      }
      
      // Handle specific error types with user-friendly messages
      if (error.response?.status === 504 || error.message.includes('timeout') || errorMsg.includes('timed out')) {
        errorMsg = 'This image took too long to analyze. Please try again or use a different photo.';
        toast.error(errorMsg, { id: analyzeToast });
      } else if (error.response?.status === 413 || errorMsg.includes('too large')) {
        errorMsg = 'Image too large. Please use a smaller image (under 5MB).';
        toast.error(errorMsg, { id: analyzeToast });
      } else if (error.response?.status === 429 || errorMsg.includes('Too many requests')) {
        errorMsg = 'Rate limit reached. Please try again in a few minutes.';
        toast.error(errorMsg, { id: analyzeToast });
      } else {
        toast.error(`Failed to analyze image: ${errorMsg}`, { id: analyzeToast });
      }
      
      setError(errorMsg);
      
      // Reset analysis state
      setIsAnalyzing(false);
      setAnalysisStage('');
      setOptimisticResult(null);
    }
  };

  // Cancel ongoing request when component unmounts
  useEffect(() => {
    return () => {
      if (cancelTokenRef.current) {
        cancelTokenRef.current.cancel('Request canceled due to component unmount');
      }
    };
  }, []);

  // Create the main content to be shown regardless of auth state
  const renderMainContent = () => (
    <div className="flex flex-col items-center min-h-screen bg-background">
      {authLoading ? (
        <div className="flex flex-col items-center justify-center h-screen w-full">
          <div className="animate-pulse-subtle">
            <svg className="w-12 h-12 md:w-16 md:h-16 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <p className="mt-4 text-slate font-medium">Verifying authentication...</p>
        </div>
      ) : (
        <div className="container max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
          <header className="text-center mb-4 sm:mb-6 md:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-navy mb-2">Optimize Your Health with Smart Nutrition</h1>
            <p className="text-slate text-sm sm:text-base md:text-lg max-w-2xl mx-auto">
              Get precise, data-driven insights about your meal's nutritional impact on your specific health goals.
            </p>
          </header>

          <div className="bg-white rounded-xl shadow-lab p-4 sm:p-6 md:p-8 mb-6">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-forest mb-3 md:mb-4">Submit Meal for AI Health Analysis</h2>
            <p className="text-slate text-sm md:text-base mb-4 md:mb-6">
              Upload a clear photo of your meal to receive a detailed breakdown of nutrients and personalized insights on 
              how this meal supports your performance and health objectives.
            </p>

            {file ? (
              <div className="mb-4 md:mb-6">
                <div className="relative w-full h-52 sm:h-64 md:h-80 bg-gray-100 rounded-lg overflow-hidden">
                  <Image
                    src={URL.createObjectURL(file)}
                    alt="Meal preview"
                    fill
                    style={{ objectFit: 'contain' }}
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 640px, 768px"
                    className="rounded-lg"
                    priority
                  />
                  <button
                    onClick={resetImage}
                    className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-lab hover:shadow-hover transition-all"
                    aria-label="Remove image"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-4 sm:p-6 mb-4 sm:mb-6 transition-colors duration-300 ${
                  isDragging ? 'border-teal bg-teal/5' : 'border-gray-300 hover:border-teal'
                }`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center py-3 sm:py-4">
                  <svg className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 text-navy/70 mb-3 md:mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-center text-slate text-sm sm:text-base mb-2">
                    <span className="font-medium">Drag and drop your meal photo</span> or
                  </p>
                  <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 mt-1 sm:mt-2 w-full justify-center">
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-forest text-white font-medium text-sm sm:text-base rounded-lg shadow-sm hover:bg-forest/90 hover:shadow-hover transition-all text-center"
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Select Image
                    </label>
                    {hasCamera && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-azure text-white font-medium text-sm sm:text-base rounded-lg shadow-sm hover:bg-azure/90 hover:shadow-hover transition-all"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Take Photo
                      </button>
                    )}
                  </div>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-coral/10 border border-coral/30 text-coral rounded-lg p-3 mb-4 sm:mb-6 text-sm">
                {analysisStage === 'fallback' ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <ErrorCard
                      title="We couldn't analyze your meal"
                      message="Try uploading a clearer, well-lit image with the full plate in view."
                      tip="You can manually log this meal instead."
                      buttonText="Try Again"
                      onClick={() => resetImage()}
                    />
                  </div>
                ) : (
                  <p>{error}</p>
                )}
              </div>
            )}

            <div className="space-y-3 sm:space-y-4">
              <div>
                <label htmlFor="healthGoal" className="block text-navy font-medium text-sm sm:text-base mb-1">
                  What's your goal for this meal?
                </label>
                <input
                  type="text"
                  id="healthGoal"
                  name="healthGoal"
                  value={healthGoal}
                  onChange={(e) => setHealthGoal(e.target.value)}
                  placeholder="Examples: Post-run recovery, Better energy, Lose weight"
                  className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal text-sm sm:text-base"
                />
              </div>

              {currentUser && (
                <div>
                  <div className="flex items-start mt-3 sm:mt-4">
                    <div className="flex items-center h-5">
                      <input
                        id="save-meal"
                        name="save-meal"
                        type="checkbox"
                        checked={saveToAccount}
                        onChange={(e) => setSaveToAccount(e.target.checked)}
                        className="focus:ring-teal h-4 w-4 text-teal border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-3 text-sm">
                      <label htmlFor="save-meal" className="font-medium text-navy">
                        Save to my meal history
                      </label>
                      <p className="text-slate text-xs sm:text-sm">Track your nutrition patterns over time</p>
                    </div>
                  </div>

                  {saveToAccount && (
                    <div className="mt-3 sm:mt-4">
                      <label htmlFor="mealName" className="block text-xs sm:text-sm font-medium text-navy">
                        Meal name (optional)
                      </label>
                      <input
                        type="text"
                        name="mealName"
                        id="mealName"
                        value={mealName}
                        onChange={(e) => setMealName(e.target.value)}
                        placeholder="e.g. Breakfast, Lunch, Post-workout snack"
                        className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!file || isAnalyzing}
                  className={`w-full inline-flex justify-center items-center px-6 py-3 border border-transparent rounded-lg shadow-sm font-medium text-white bg-forest hover:bg-forest/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-forest transition-all ${
                    (!file || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-hover'
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {analysisStage === 'uploading' && 'Uploading...'}
                      {analysisStage === 'analyzing' && 'Analyzing nutritional content...'}
                      {analysisStage === 'processing' && 'Processing nutrition data...'}
                    </>
                  ) : (
                    'Analyze Meal Impact'
                  )}
                </button>
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="mt-2">
                  <div className="bg-gray-200 rounded-full h-2.5 w-full">
                    <div 
                      className="bg-accent h-2.5 rounded-full" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-center mt-1 text-slate">{uploadProgress}% uploaded</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Show loading state while checking auth or redirecting
  if (authLoading || redirecting) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-lab-grid bg-[length:30px_30px] opacity-10"></div>
        <div className="text-center z-10">
          <div className="relative mx-auto w-24 h-24 mb-6">
            <div className="absolute inset-0 border-4 border-azure opacity-30 rounded-full"></div>
            <div className="animate-spin absolute inset-0 border-t-4 border-primary opacity-70 rounded-full"></div>
            <div className="animate-bio-glow absolute inset-0 flex items-center justify-center text-primary opacity-90">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p className="text-indigo font-medium">{redirecting ? 'Redirecting to authentication portal...' : 'Verifying security credentials...'}</p>
          {redirecting && (
            <div className="mt-2 flex items-center justify-center">
              <div className="h-1 w-40 bg-azure bg-opacity-30 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-indigo animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Otherwise, render the main content immediately
  return renderMainContent();
} 