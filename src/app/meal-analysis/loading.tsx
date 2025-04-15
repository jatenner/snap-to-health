export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center pb-6 sm:pb-8 md:pb-12 px-3 sm:px-4">
      <div className="w-full max-w-sm sm:max-w-md mx-auto bg-white shadow-lab rounded-xl p-4 sm:p-6 md:p-8 text-center animate-fade-in">
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6">
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-primary animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
        
        <h2 className="text-xl sm:text-2xl font-bold text-navy mb-2 sm:mb-3">Analyzing Your Meal</h2>
        
        <div className="w-full max-w-xs sm:max-w-sm mx-auto space-y-3 sm:space-y-4">
          <p className="text-sm sm:text-base text-slate">Our AI is examining the nutritional content and generating personalized insights for your health goals.</p>
          
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-xs text-slate">
              <span>Image Analysis</span>
              <span>Complete</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full w-full transition-all duration-500"></div>
            </div>
          </div>
          
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-xs text-slate">
              <span>Nutritional Assessment</span>
              <span>In Progress</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full w-3/4 animate-pulse transition-all duration-500"></div>
            </div>
          </div>
          
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-xs text-slate">
              <span>Personalized Recommendations</span>
              <span>Preparing</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary/40 rounded-full w-1/3 transition-all duration-500"></div>
            </div>
          </div>
          
          <div className="pt-2 sm:pt-3">
            <p className="text-xs text-slate italic">AI-powered analysis typically takes 5-15 seconds</p>
          </div>
        </div>
      </div>
    </div>
  );
} 