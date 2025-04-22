/**
 * Types for meal analysis components
 */

export interface NutrientDetail {
  name: string;
  value: string | number;
  unit: string;
  isHighlight: boolean;
  percentOfDailyValue?: number;
  amount?: number;
}

export interface DetailedIngredient {
  name: string;
  category: string;
  confidence: number;
  confidenceEmoji?: string;
}

export interface AnalysisResult {
  description: string;
  nutrients: NutrientDetail[];
  feedback: string[] | string;
  suggestions: string[] | string;
  sleepScore?: number;
  // Define goalScore as either a number or an object with specific structure
  goalScore: number | {
    overall: number;
    specific: Record<string, number>;
  };
  goalName?: string;
  scoreExplanation?: string;
  positiveFoodFactors?: string[];
  negativeFoodFactors?: string[];
  rawGoal?: string;
  partial?: boolean;
  missing?: string;
  confidence?: number;
  detailedIngredients: DetailedIngredient[];
  reasoningLogs?: any[];
  fallback?: boolean;
  lowConfidence?: boolean;
  failureReason?: string;
  insight?: string;
  message?: string;
  modelInfo?: {
    model?: string;
    ocrExtracted?: boolean;
    ocrConfidence?: number;
    usedFallback?: boolean;
    usedLabelDetection?: boolean;
    detectedLabel?: string | null;
    labelConfidence?: number;
  };
  _meta?: {
    fallback?: boolean;
    ocrText?: string;
    ocrConfidence?: number;
    foodTerms?: string[];
    debugTrace?: string;
    usedLabelDetection?: boolean;
    detectedLabel?: string | null;
    labelConfidence?: number;
    knownFoodWords?: string[];
  };
  no_result?: boolean;
}

/**
 * Helper functions for working with analysis results
 */

/**
 * Gets the display-ready score value from either a number or object format
 */
export function getScoreValue(score: number | { overall: number; specific: Record<string, number> } | undefined): number {
  if (typeof score === 'object' && score !== null && 'overall' in score) {
    const overall = score.overall;
    return Number.isFinite(overall) ? overall : 5;
  }
  
  if (typeof score === 'number' && Number.isFinite(score)) {
    return score;
  }
  
  return 5; // Default fallback score
}

/**
 * Formats a nutrient value for display
 */
export function formatNutrientValue(value: string | number, isFallback: boolean = false): string {
  if (typeof value === 'number') {
    // For zero values, check if this is a fallback result
    if (value === 0 && isFallback) {
      return 'N/A';
    }
    return value.toString();
  }
  
  if (typeof value === 'string') {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      // For zero values, check if this is a fallback result
      if (numValue === 0 && isFallback) {
        return 'N/A';
      }
      return numValue.toString();
    }
    return value;
  }
  
  return '0';
}

/**
 * Creates a display-ready description string
 */
export function getDisplayDescription(
  result: AnalysisResult | null | undefined
): string {
  if (!result) {
    return "Meal analysis not available.";
  }
  
  const { description, fallback, lowConfidence, _meta } = result;
  
  // If description exists and is not empty, use it
  if (description && description.trim() !== '') {
    return description;
  }
  
  // If we have label detection, use that
  if (_meta?.usedLabelDetection && _meta?.detectedLabel) {
    return `Detected ${_meta.detectedLabel} with ${Math.round((_meta.labelConfidence || 0) * 100)}% confidence`;
  }
  
  // If we have known food words, use those
  if (_meta?.knownFoodWords?.length) {
    return `This appears to be ${_meta.knownFoodWords.join(', ')}`;
  }
  
  // Fallback based on context
  if (fallback || lowConfidence) {
    return "This meal was analyzed with limited information";
  }
  
  return "Meal analysis completed. No detailed description available.";
} 