import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto bg-white shadow-md rounded-lg p-8">
        <div className="mb-6 text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Page Not Found</h2>
        <p className="text-gray-600 mb-6">Sorry, we couldn't find the page you're looking for.</p>
        <Link 
          href="/upload" 
          className="inline-block bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          Upload a Meal
        </Link>
      </div>
    </div>
  );
} 