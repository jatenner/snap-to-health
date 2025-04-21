import React from 'react';
import Link from 'next/link';

interface FallbackAlertProps {
  show: boolean;
}

const FallbackAlert: React.FC<FallbackAlertProps> = ({ show }) => {
  if (!show) return null;

  return (
    <div className="mb-4 p-3 bg-indigo/5 border border-indigo/20 rounded-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-navy">Partial Analysis Completed</h3>
          <div className="mt-1 text-xs text-slate">
            <p>We were able to extract some nutritional data using OCR-based fallback methods, but a complete analysis wasn't possible for this image.</p>
            <p className="mt-1">Results shown are based on text extraction from the image rather than full visual analysis.</p>
            <div className="mt-2">
              <Link href="/upload" className="text-indigo font-medium hover:underline inline-flex items-center">
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