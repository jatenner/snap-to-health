import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface Nutrient {
  name: string;
  value: string;
  unit: string;
  isHighlight: boolean;
  percentOfDailyValue?: number;
  amount?: number;
}

interface DetailedIngredient {
  name: string;
  category: string;
  confidence: number;
  confidenceEmoji?: string;
}

interface AnalysisResult {
  description?: string;
  nutrients?: Nutrient[];
  feedback?: string[];
  suggestions?: string[];
  sleepScore?: number;
  goalScore?: number;
  goalName?: string;
  scoreExplanation?: string;
  positiveFoodFactors?: string[];
  negativeFoodFactors?: string[];
  rawGoal?: string;
  detailedIngredients?: DetailedIngredient[];
  reasoningLogs?: any[];
  fallback?: boolean;
  lowConfidence?: boolean;
  message?: string;
}

interface AnalysisCardProps {
  result: AnalysisResult;
  previewUrl: string | null;
  isLoading?: boolean;
}

// Helper function to deduplicate nutrients
const deduplicateNutrients = (nutrients: Nutrient[]): Nutrient[] => {
  const uniqueNutrients = new Map<string, Nutrient>();
  
  nutrients.forEach(nutrient => {
    const key = nutrient.name.toLowerCase();
    // Only keep the first occurrence of each nutrient (or the highlighted one if found later)
    if (!uniqueNutrients.has(key) || nutrient.isHighlight) {
      uniqueNutrients.set(key, nutrient);
    }
  });
  
  return Array.from(uniqueNutrients.values());
};

// Helper function to categorize nutrients
const categorizeNutrients = (nutrients: Nutrient[]) => {
  // First deduplicate the nutrients
  const uniqueNutrients = deduplicateNutrients(nutrients);
  
  const macros: Nutrient[] = [];
  const beneficialMicros: Nutrient[] = [];
  const others: Nutrient[] = [];

  // Define sleep supportive nutrients
  const beneficialList = ['magnesium', 'potassium', 'calcium', 'tryptophan', 'fiber', 'iron', 'zinc', 'omega'];
  // Define potentially negative nutrients
  const negativeList = ['sugar', 'caffeine', 'sodium'];

  uniqueNutrients.forEach(nutrient => {
    const name = nutrient.name.toLowerCase();
    
    // Categorize as macro
    if (['protein', 'fat', 'carbs', 'calories'].includes(name)) {
      macros.push(nutrient);
    } 
    // Categorize as beneficial
    else if (beneficialList.some(item => name.includes(item))) {
      beneficialMicros.push({...nutrient, isHighlight: true});
    } 
    // Categorize as other
    else {
      // Mark negative nutrients as negative
      const isNegative = negativeList.some(item => name.includes(item));
      others.push({...nutrient, isHighlight: isNegative ? false : nutrient.isHighlight});
    }
  });

  return { macros, beneficialMicros, others };
};

// Calculate a sleep score based on sleep-supportive and sleep-negative nutrients
const calculateSleepScore = (nutrients: Nutrient[]): number => {
  let score = 5; // Start with a neutral score
  
  // Sleep supportive nutrients
  const sleepSupportiveNutrients = ['magnesium', 'calcium', 'potassium', 'vitamin b6', 'tryptophan', 'melatonin'];
  
  // Sleep negative nutrients
  const sleepNegativeNutrients = ['caffeine', 'sugar', 'sodium'];
  
  nutrients.forEach(nutrient => {
    const name = nutrient.name.toLowerCase();
    
    // Add points for sleep-supportive nutrients
    if (sleepSupportiveNutrients.some(item => name.includes(item))) {
      score += 1;
    }
    
    // Subtract points for sleep-negative nutrients
    if (sleepNegativeNutrients.some(item => name.includes(item))) {
      score -= 1.5;
    }
  });
  
  // Ensure score is between 1 and 10
  return Math.max(1, Math.min(10, Math.round(score)));
};

// Helper function to identify beneficial nutrients
const isBeneficialNutrient = (nutrient: Nutrient): boolean => {
  const beneficialList = [
    'protein', 'fiber', 'vitamin', 'mineral', 'calcium', 'iron', 
    'magnesium', 'potassium', 'zinc', 'omega-3', 'antioxidant'
  ];
  const name = nutrient.name.toLowerCase();
  return beneficialList.some(item => name.includes(item));
};

// Helper function to identify potentially negative nutrients
const isNegativeNutrient = (nutrient: Nutrient): boolean => {
  const negativeList = [
    'sugar', 'sodium', 'saturated fat', 'trans fat', 'cholesterol', 'caffeine'
  ];
  const name = nutrient.name.toLowerCase();
  return negativeList.some(item => name.includes(item));
};

// Calculate nutrient score based on the nutrient content
const calculateScore = (nutrients: Nutrient[], goalType?: string): number => {
  if (!nutrients || nutrients.length === 0) return 5;

  // Default to a base score of 5
  let score = 5;
  
  if (goalType?.toLowerCase().includes('sleep')) {
    return calculateSleepScore(nutrients);
  } else if (goalType?.toLowerCase().includes('weight')) {
    // For weight management, favor protein, fiber, and low sugar/fat
    const protein = nutrients.find(n => n.name.toLowerCase() === 'protein');
    const fiber = nutrients.find(n => n.name.toLowerCase().includes('fiber'));
    const sugar = nutrients.find(n => n.name.toLowerCase() === 'sugar');
    const saturatedFat = nutrients.find(n => n.name.toLowerCase().includes('saturated'));
    
    if (protein?.percentOfDailyValue && protein.percentOfDailyValue > 20) score += 1;
    if (fiber?.percentOfDailyValue && fiber.percentOfDailyValue > 15) score += 1;
    if (sugar?.percentOfDailyValue && sugar.percentOfDailyValue < 10) score += 1;
    if (saturatedFat?.percentOfDailyValue && saturatedFat.percentOfDailyValue < 10) score += 1;
    
    // Penalize excessive calories or unhealthy fats
    const calories = nutrients.find(n => n.name.toLowerCase().includes('calorie'));
    if (calories?.amount && calories.amount > 600) score -= 1;
    if (saturatedFat?.percentOfDailyValue && saturatedFat.percentOfDailyValue > 20) score -= 2;
  } else if (goalType?.toLowerCase().includes('muscle')) {
    // For muscle building, favor protein, calories, and healthy fats
    const protein = nutrients.find(n => n.name.toLowerCase() === 'protein');
    const calories = nutrients.find(n => n.name.toLowerCase().includes('calorie'));
    
    if (protein?.percentOfDailyValue && protein.percentOfDailyValue > 30) score += 2;
    else if (protein?.percentOfDailyValue && protein.percentOfDailyValue > 20) score += 1;
    
    if (calories?.amount && calories.amount > 400) score += 1;
    
    // Check for BCAAs and other muscle-supporting nutrients
    const leucine = nutrients.find(n => n.name.toLowerCase().includes('leucine'));
    const isoleucine = nutrients.find(n => n.name.toLowerCase().includes('isoleucine'));
    const valine = nutrients.find(n => n.name.toLowerCase().includes('valine'));
    
    if (leucine || isoleucine || valine) score += 1;
  } else if (goalType?.toLowerCase().includes('energy')) {
    // For energy, favor complex carbs, B vitamins, iron, and magnesium
    const carbs = nutrients.find(n => n.name.toLowerCase().includes('carbohydrate'));
    const fiber = nutrients.find(n => n.name.toLowerCase().includes('fiber'));
    const sugar = nutrients.find(n => n.name.toLowerCase() === 'sugar');
    const bVitamins = nutrients.filter(n => 
      n.name.toLowerCase().includes('thiamin') || 
      n.name.toLowerCase().includes('riboflavin') || 
      n.name.toLowerCase().includes('niacin') || 
      n.name.toLowerCase().includes('b6') || 
      n.name.toLowerCase().includes('b12')
    );
    const iron = nutrients.find(n => n.name.toLowerCase() === 'iron');
    const magnesium = nutrients.find(n => n.name.toLowerCase() === 'magnesium');
    
    if (carbs && fiber?.percentOfDailyValue && fiber.percentOfDailyValue > 10) score += 1; // Complex carbs
    if (bVitamins.length > 1) score += 1;
    if (iron?.percentOfDailyValue && iron.percentOfDailyValue > 10) score += 1;
    if (magnesium?.percentOfDailyValue && magnesium.percentOfDailyValue > 10) score += 1;
    
    // Penalize high sugar for energy crashes
    if (sugar?.percentOfDailyValue && sugar.percentOfDailyValue > 20) score -= 1;
  } else if (goalType?.toLowerCase().includes('heart')) {
    // For heart health, favor fiber, omega-3s, potassium, and low sodium/saturated fat
    const fiber = nutrients.find(n => n.name.toLowerCase().includes('fiber'));
    const sodium = nutrients.find(n => n.name.toLowerCase() === 'sodium');
    const saturatedFat = nutrients.find(n => n.name.toLowerCase().includes('saturated'));
    const potassium = nutrients.find(n => n.name.toLowerCase() === 'potassium');
    const omega3 = nutrients.find(n => n.name.toLowerCase().includes('omega') && n.name.includes('3'));
    
    if (fiber?.percentOfDailyValue && fiber.percentOfDailyValue > 10) score += 1;
    if (potassium?.percentOfDailyValue && potassium.percentOfDailyValue > 10) score += 1;
    if (omega3) score += 1;
    
    if (sodium?.percentOfDailyValue && sodium.percentOfDailyValue > 20) score -= 1;
    if (saturatedFat?.percentOfDailyValue && saturatedFat.percentOfDailyValue > 15) score -= 1;
  } else if (goalType?.toLowerCase().includes('recovery') || goalType?.toLowerCase().includes('inflammation')) {
    // For recovery, favor anti-inflammatory nutrients, antioxidants, and protein
    const protein = nutrients.find(n => n.name.toLowerCase() === 'protein');
    const omega3 = nutrients.find(n => n.name.toLowerCase().includes('omega') && n.name.includes('3'));
    const vitaminC = nutrients.find(n => n.name.toLowerCase().includes('vitamin c'));
    const zinc = nutrients.find(n => n.name.toLowerCase() === 'zinc');
    const magnesium = nutrients.find(n => n.name.toLowerCase() === 'magnesium');
    const sugar = nutrients.find(n => n.name.toLowerCase() === 'sugar');
    const saturatedFat = nutrients.find(n => n.name.toLowerCase().includes('saturated'));
    
    if (protein?.percentOfDailyValue && protein.percentOfDailyValue > 20) score += 1;
    if (omega3) score += 1;
    if (vitaminC?.percentOfDailyValue && vitaminC.percentOfDailyValue > 15) score += 1;
    if (zinc?.percentOfDailyValue && zinc.percentOfDailyValue > 10) score += 0.5;
    if (magnesium?.percentOfDailyValue && magnesium.percentOfDailyValue > 10) score += 0.5;
    
    // Penalize pro-inflammatory components
    if (sugar?.percentOfDailyValue && sugar.percentOfDailyValue > 20) score -= 1;
    if (saturatedFat?.percentOfDailyValue && saturatedFat.percentOfDailyValue > 15) score -= 1;
  } else if (goalType?.toLowerCase().includes('mind-body')) {
    // For mind-body balance, focus on omega-3s, magnesium, B vitamins, antioxidants
    const omega3 = nutrients.find(n => n.name.toLowerCase().includes('omega') && n.name.includes('3'));
    const magnesium = nutrients.find(n => n.name.toLowerCase() === 'magnesium');
    const bVitamins = nutrients.filter(n => 
      n.name.toLowerCase().includes('thiamin') || 
      n.name.toLowerCase().includes('riboflavin') || 
      n.name.toLowerCase().includes('niacin') || 
      n.name.toLowerCase().includes('b6') || 
      n.name.toLowerCase().includes('b12')
    );
    const antioxidants = nutrients.filter(n => 
      n.name.toLowerCase().includes('vitamin c') || 
      n.name.toLowerCase().includes('vitamin e') ||
      n.name.toLowerCase().includes('selenium') ||
      n.name.toLowerCase().includes('zinc')
    );
    const fiber = nutrients.find(n => n.name.toLowerCase().includes('fiber'));
    const sugar = nutrients.find(n => n.name.toLowerCase() === 'sugar');
    const caffeine = nutrients.find(n => n.name.toLowerCase() === 'caffeine');
    
    if (omega3) score += 1;
    if (magnesium?.percentOfDailyValue && magnesium.percentOfDailyValue > 10) score += 1;
    if (bVitamins.length > 1) score += 1;
    if (antioxidants.length > 1) score += 1;
    if (fiber?.percentOfDailyValue && fiber.percentOfDailyValue > 10) score += 0.5;
    
    // Penalize disruptive components
    if (sugar?.percentOfDailyValue && sugar.percentOfDailyValue > 20) score -= 1;
    if (caffeine?.amount && caffeine.amount > 100) score -= 1;
  } else {
    // Generic scoring based on overall nutritional balance
    const beneficialNutrients = nutrients.filter(n => isBeneficialNutrient(n));
    const negativeNutrients = nutrients.filter(n => isNegativeNutrient(n));
    
    // Award points for beneficial nutrients
    if (beneficialNutrients.length >= 5) score += 2;
    else if (beneficialNutrients.length >= 3) score += 1;
    
    // Subtract points for negative nutrients
    if (negativeNutrients.length >= 3) score -= 2;
    else if (negativeNutrients.length >= 1) score -= 1;
  }
  
  // Ensure score stays within range
  return Math.max(1, Math.min(10, score));
};

// Helper function to get the appropriate badge color for a nutrient
const getNutrientBadgeStyle = (nutrient: Nutrient, goalName: string = '') => {
  const name = nutrient.name.toLowerCase();
  
  // Red for negative nutrients
  if (['sugar', 'caffeine', 'sodium'].some(item => name.includes(item))) {
    return {
      bg: 'bg-red-100',
      border: 'border-red-200',
      icon: '🔴',
      tooltip: name.includes('sugar') ? 'High sugar can impact insulin and energy levels' :
               name.includes('caffeine') ? 'Caffeine can disrupt sleep and increase anxiety' :
               'High sodium may affect blood pressure and hydration'
    };
  }
  
  // Green for beneficial nutrients
  if (['magnesium', 'potassium', 'calcium', 'tryptophan', 'fiber', 'protein', 'omega', 'iron', 'zinc'].some(item => name.includes(item)) || nutrient.isHighlight) {
    return {
      bg: 'bg-green-100',
      border: 'border-green-200',
      icon: '🟢',
      tooltip: name.includes('magnesium') ? 'Magnesium helps with muscle relaxation and sleep' :
               name.includes('calcium') ? 'Calcium supports bone health and nervous system function' : 
               name.includes('potassium') ? 'Potassium helps regulate blood pressure and muscle contractions' :
               name.includes('fiber') ? 'Fiber supports digestion and helps maintain stable blood sugar' :
               name.includes('protein') ? 'Protein is essential for muscle building and repair' :
               name.includes('iron') ? 'Iron is crucial for oxygen transport in the blood' :
               name.includes('tryptophan') ? 'Tryptophan is a precursor to serotonin, which helps with sleep' :
               'This nutrient supports your health goals'
    };
  }
  
  // Yellow for neutral nutrients
  return {
    bg: 'bg-yellow-50',
    border: 'border-yellow-100',
    icon: '🟡',
    tooltip: 'This nutrient has a neutral impact on your health goals'
  };
};

// Tooltip component for nutrients
const Tooltip = ({ text, children }: { text: string, children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  return (
    <div className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onTouchStart={() => setIsVisible(prev => !prev)}>
      {children}
      {isVisible && (
        <div className="absolute left-0 bottom-full mb-2 w-56 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg z-10">
          {text}
          <div className="arrow absolute -bottom-1 left-2 w-2 h-2 bg-gray-800 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
};

// NutrientPill component for macronutrients
const NutrientPill = ({ nutrient, goalType }: { nutrient: Nutrient, goalType: string }) => {
  const style = getNutrientBadgeStyle(nutrient, goalType);
  
  return (
    <Tooltip text={style.tooltip}>
      <div className={`flex justify-between items-center p-3 rounded-lg ${style.bg} border ${style.border}`}>
        <div className="font-medium text-gray-800">{nutrient.name}</div>
        <div className="text-sm text-gray-600">{nutrient.value} {nutrient.unit}</div>
      </div>
    </Tooltip>
  );
};

// NutrientBadge component for micronutrients
const NutrientBadge = ({ nutrient, goalType }: { nutrient: Nutrient, goalType: string }) => {
  const style = getNutrientBadgeStyle(nutrient, goalType);
  
  return (
    <Tooltip text={style.tooltip}>
      <div className={`px-3 py-1.5 rounded-full ${style.bg} border ${style.border} text-sm flex items-center`}>
        <span className="mr-1">{style.icon}</span>
        <span className="font-medium text-gray-800">{nutrient.name}</span>
        {nutrient.value && <span className="ml-1 text-xs text-gray-600">({nutrient.value} {nutrient.unit})</span>}
      </div>
    </Tooltip>
  );
};

const getScoreLabel = (score: number) => {
  if (score >= 9) return "Exceptional Balance";
  if (score >= 7) return "Harmonious";
  if (score >= 5) return "Balanced";
  if (score >= 3) return "Needs Attunement";
  return "Seeking Harmony";
};

// Get a friendly explanation for the score
const getScoreExplanation = (score: number, goalName?: string) => {
  let baseMessage = "";
  
  if (score >= 9) {
    baseMessage = "This meal provides exceptional nutritional harmony";
  } else if (score >= 7) {
    baseMessage = "This meal offers good nutritional balance";
  } else if (score >= 5) {
    baseMessage = "This meal provides moderate nutritional support";
  } else if (score >= 3) {
    baseMessage = "This meal may benefit from some nutritional attunement";
  } else {
    baseMessage = "This meal could use more nutritional balance";
  }
  
  if (goalName) {
    if (score >= 7) {
      return `${baseMessage} and aligns well with your ${goalName.toLowerCase()} intention.`;
    } else if (score >= 5) {
      return `${baseMessage} and offers some support for your ${goalName.toLowerCase()} intention.`;
    } else {
      return `${baseMessage} to better support your ${goalName.toLowerCase()} intention.`;
    }
  }
  
  return baseMessage + ".";
};

const getGoalIcon = (goalName?: string) => {
  if (!goalName) return "🌿";
  
  const goal = goalName.toLowerCase();
  if (goal.includes('sleep')) return "🌙";
  if (goal.includes('weight')) return "⚖️";
  if (goal.includes('muscle')) return "💪";
  if (goal.includes('energy')) return "⚡";
  if (goal.includes('heart')) return "❤️";
  if (goal.includes('recovery')) return "🔄";
  if (goal.includes('mind-body')) return "☯️";
  return "🌿";
};

// Helper function to get confidence emoji based on confidence score
const getConfidenceEmoji = (confidence: number): string => {
  if (confidence >= 8) return '🟢'; // High confidence
  if (confidence >= 5) return '🟡'; // Medium confidence
  return '🔴'; // Low confidence
};

// Helper function to get confidence label
const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 8) return 'High confidence';
  if (confidence >= 5) return 'Medium confidence';
  return 'Low confidence';
};

// Format confidence score as a percentage
const formatConfidence = (confidence: number): string => {
  return `${Math.round(confidence * 10)}%`;
};

// Tooltip explaining what confidence means
const getConfidenceTooltip = (confidence: number): string => {
  if (confidence >= 8) {
    return 'High confidence: This ingredient is clearly visible in the image.';
  } else if (confidence >= 5) {
    return 'Medium confidence: This ingredient is likely present based on visible characteristics.';
  } else {
    return 'Low confidence: This is our best guess based on limited visual information.';
  }
};

// Ingredient component with confidence visualization
const IngredientItem = ({ ingredient }: { ingredient: DetailedIngredient }) => {
  // Calculate confidence emoji if not already provided
  const emoji = ingredient.confidenceEmoji || getConfidenceEmoji(ingredient.confidence);
  const tooltipText = getConfidenceTooltip(ingredient.confidence);
  
  return (
    <div className="flex items-center mb-2">
      <Tooltip text={tooltipText}>
        <span className="mr-2 text-lg" aria-hidden="true">{emoji}</span>
      </Tooltip>
      <div className="flex-1">
        <div className="flex justify-between">
          <span className="font-medium capitalize">{ingredient.name}</span>
          <span className="text-sm text-gray-600">{formatConfidence(ingredient.confidence)}</span>
        </div>
        <div className="text-xs text-gray-500 capitalize">{ingredient.category}</div>
      </div>
    </div>
  );
};

// Component to display the ingredients section
const IngredientsSection = ({ ingredients }: { ingredients: DetailedIngredient[] }) => {
  if (!ingredients || ingredients.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-3 text-gray-800">Identified Ingredients</h3>
      
      {ingredients.length > 0 ? (
        <div className="space-y-1">
          {ingredients.map((ingredient, index) => (
            <IngredientItem key={index} ingredient={ingredient} />
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">No ingredients could be identified.</p>
      )}
      
      <div className="mt-3 pt-2 border-t border-gray-200">
        <div className="flex justify-between text-xs text-gray-500">
          <div className="flex items-center">
            <span className="mr-1">🟢</span>
            <span>High confidence</span>
          </div>
          <div className="flex items-center">
            <span className="mr-1">🟡</span>
            <span>Medium confidence</span>
          </div>
          <div className="flex items-center">
            <span className="mr-1">🔴</span>
            <span>Low confidence</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const AnalysisCard: React.FC<AnalysisCardProps> = ({ result, previewUrl, isLoading }) => {
  const { 
    description, 
    nutrients = [], 
    feedback = [], 
    suggestions = [], 
    sleepScore,
    goalScore,
    goalName = 'Sleep Impact',
    scoreExplanation = '',
    positiveFoodFactors = [],
    negativeFoodFactors = [],
    rawGoal,
    detailedIngredients = [],
    reasoningLogs = [],
    fallback = false,
    lowConfidence = false,
    message = ''
  } = result;
  
  // Animation state for score progress bars
  const [animatedGoalScore, setAnimatedGoalScore] = useState(0);
  const [animatedSleepScore, setAnimatedSleepScore] = useState(0);
  
  // Categorize nutrients
  const { macros, beneficialMicros, others } = categorizeNutrients(nutrients);
  
  // Determine which scores to display
  const displaySleepScore = sleepScore !== undefined && goalName?.toLowerCase() !== 'sleep impact';
  const finalGoalScore = goalScore !== undefined ? goalScore : (!displaySleepScore && sleepScore) || calculateScore(nutrients, goalName);
  const finalSleepScore = sleepScore || calculateScore(nutrients, 'sleep');
  
  // Animate the score progress bars
  useEffect(() => {
    // Animate from 0 to the actual scores
    const timer = setTimeout(() => {
      setAnimatedGoalScore(finalGoalScore);
      if (displaySleepScore) {
        setAnimatedSleepScore(finalSleepScore);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [finalGoalScore, finalSleepScore, displaySleepScore]);
  
  // Generate score color based on value
  const getScoreColor = (value: number) => {
    if (value >= 8) return 'bg-green-500';
    if (value >= 5) return 'bg-yellow-400';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 animate-fade-in border border-stone border-opacity-30">
      {/* Header with image */}
      <div className="relative h-48 bg-gray-200">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Food image"
            className="object-cover"
            fill
            sizes="(max-width: 768px) 100vw, 700px"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gradient-to-r from-primary to-secondary bg-opacity-20">
            <span className="text-4xl">🍽️</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Description */}
        {result.description && (
          <div className="mb-6">
            <h2 className="text-xl font-medium text-gray-800 mb-2">Your Mindful Meal</h2>
            <p className="text-gray-600">{result.description}</p>
          </div>
        )}

        {/* Goal Score */}
        {result.goalScore !== undefined && (
          <div className="mb-6">
            <div className="flex items-center">
              <span className="text-2xl mr-2">{getGoalIcon(result.goalName)}</span>
              <h3 className="text-lg font-medium text-gray-800">
                {result.goalName || 'Holistic Wellness'} Harmony
              </h3>
            </div>
            
            <div className="mt-2 flex items-center">
              <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                <div 
                  className="h-2.5 rounded-full bg-gradient-to-r from-leaf to-primary" 
                  style={{ width: `${result.goalScore * 10}%` }}
                ></div>
              </div>
              <span className="ml-3 font-medium text-gray-700">{result.goalScore}/10</span>
            </div>
            
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{getScoreLabel(result.goalScore)}</span>: {' '}
              {result.scoreExplanation || getScoreExplanation(result.goalScore, result.goalName)}
            </p>
          </div>
        )}

        {/* Positive and negative influences */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          {result.positiveFoodFactors && result.positiveFoodFactors.length > 0 && (
            <div className="bg-leaf bg-opacity-10 rounded-md p-4 border border-leaf border-opacity-30">
              <h3 className="font-medium text-gray-800 mb-2 flex items-center">
                <span className="text-leaf mr-2">✨</span>
                Nourishing Elements
              </h3>
              <ul className="space-y-1">
                {result.positiveFoodFactors.map((factor, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="text-leaf text-xs mr-2 mt-1">●</span>
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {result.negativeFoodFactors && result.negativeFoodFactors.length > 0 && (
            <div className="bg-sand bg-opacity-10 rounded-md p-4 border border-sand border-opacity-30">
              <h3 className="font-medium text-gray-800 mb-2 flex items-center">
                <span className="text-sand mr-2">⚠️</span>
                Mindful Considerations
              </h3>
              <ul className="space-y-1">
                {result.negativeFoodFactors.map((factor, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="text-sand text-xs mr-2 mt-1">●</span>
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Nutritional Insights */}
        {result.nutrients && result.nutrients.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-800 mb-3 flex items-center">
              <span className="text-primary mr-2">🍃</span>
              Nutritional Harmony
            </h3>
            
            {(() => {
              const { macros, beneficialMicros, others } = categorizeNutrients(result.nutrients);
              
              return (
                <div className="space-y-4">
                  {/* Macronutrients */}
                  {macros.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Foundation Elements</h4>
                      <div className="flex flex-wrap gap-2">
                        {macros.map((nutrient, index) => (
                          <span 
                            key={index}
                            className={`px-2 py-1 rounded-full text-xs ${getNutrientBadgeStyle(nutrient, result.rawGoal || '')}`}
                          >
                            {nutrient.name}: {nutrient.value}{nutrient.unit}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Beneficial Micronutrients */}
                  {beneficialMicros.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Beneficial Essentials</h4>
                      <div className="flex flex-wrap gap-2">
                        {beneficialMicros.map((nutrient, index) => (
                          <span 
                            key={index}
                            className={`px-2 py-1 rounded-full text-xs ${getNutrientBadgeStyle(nutrient, result.rawGoal || '')}`}
                          >
                            {nutrient.name}: {nutrient.value}{nutrient.unit}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Other Nutrients */}
                  {others.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Additional Elements</h4>
                      <div className="flex flex-wrap gap-2">
                        {others.map((nutrient, index) => (
                          <span 
                            key={index}
                            className={`px-2 py-1 rounded-full text-xs ${getNutrientBadgeStyle(nutrient, result.rawGoal || '')}`}
                          >
                            {nutrient.name}: {nutrient.value}{nutrient.unit}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Ingredients Section */}
        {detailedIngredients && detailedIngredients.length > 0 && (
          <IngredientsSection ingredients={detailedIngredients} />
        )}

        {/* Low confidence warning */}
        {lowConfidence && (
          <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-100 text-yellow-800 text-sm">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-yellow-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-medium">Low confidence analysis</p>
                <p>{message || "The image may be unclear, but we've provided our best analysis. Results might be limited."}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Fallback message */}
        {fallback && (
          <div className="px-4 py-3 bg-red-50 border-t border-red-100 text-red-800 text-sm">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Analysis issue</p>
                <p>{message || "We had trouble analyzing your meal. Please try again with a clearer photo."}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisCard; 