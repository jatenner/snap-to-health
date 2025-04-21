import React from 'react';
import Link from 'next/link';

interface FallbackAlertProps {
  show: boolean;
  noResult?: boolean;
  message?: string;
  isNoTextDetected?: boolean;
  isNoFoodDetected?: boolean;
}

const FallbackAlert: React.FC<FallbackAlertProps> = ({ 
  show, 
  noResult = false, 
  message,
  isNoTextDetected = false,
  isNoFoodDetected = false 
}) => {
  if (!show) return null;
  
  // Different alert variants based on the type of issue
  if (isNoTextDetected) {
    return (
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">No Text Detected</h3>
            <div className="mt-1 text-xs text-yellow-700">
              <p>{message || "We couldn't detect any text in this image."}</p>
              <p className="mt-1">Try uploading a photo that clearly shows food or its nutritional label.</p>
              <div className="mt-2">
                <Link href="/upload" className="text-yellow-800 font-medium hover:underline inline-flex items-center">
                  Try Another Image
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (isNoFoodDetected) {
    return (
      <div className="mb-4 p-3 bg-orange-50 border border-orange-300 rounded-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-orange-800">No Food Detected</h3>
            <div className="mt-1 text-xs text-orange-700">
              <p>{message || "We couldn't identify any food in this image."}</p>
              <p className="mt-1">Please upload a photo that clearly shows food items for analysis.</p>
              <div className="mt-2">
                <Link href="/upload" className="text-orange-800 font-medium hover:underline inline-flex items-center">
                  Try Another Image
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Default fallback alert for partial analysis
  return (
    <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-indigo-800">{noResult ? "Analysis Not Available" : "Partial Analysis Completed"}</h3>
          <div className="mt-1 text-xs text-indigo-700">
            <p>{message || (noResult 
              ? "We couldn't analyze this image properly." 
              : "We were able to extract some nutritional data using OCR-based fallback methods, but a complete analysis wasn't possible for this image.")}</p>
            <p className="mt-1">{noResult 
              ? "Try uploading a different image with clearly visible food or nutritional information." 
              : "Results shown are based on text extraction from the image rather than full visual analysis."}</p>
            <div className="mt-2">
              <Link href="/upload" className="text-indigo-600 font-medium hover:underline inline-flex items-center">
                Try Another Image
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FallbackAlert; 