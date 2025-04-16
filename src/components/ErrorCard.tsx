import React from 'react';

interface ErrorCardProps {
  title: string;
  message: string;
  tip?: string;
  buttonText: string;
  onClick: () => void;
}

const ErrorCard: React.FC<ErrorCardProps> = ({ 
  title, 
  message, 
  tip, 
  buttonText, 
  onClick 
}) => {
  return (
    <div className="text-center max-w-md mx-auto bg-white shadow-xl rounded-xl p-6 border border-red-200">
      <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-3">
        {title}
      </h2>
      <p className="text-gray-600 mb-3">
        {message}
      </p>
      {tip && (
        <p className="text-xs text-gray-500 italic mb-6">
          Tip: {tip}
        </p>
      )}
      <button 
        onClick={onClick}
        className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2.5 px-6 rounded-lg transition-colors text-sm shadow-md"
      >
        {buttonText}
      </button>
    </div>
  );
};

export default ErrorCard; 