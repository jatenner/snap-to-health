/**
 * Nutritionix API Integration
 * Handles fetching nutritional data from the Nutritionix API
 */
import axios from 'axios';

// Define interfaces for API types
export interface NutritionixResponse {
  foods: NutritionixFood[];
}

export interface NutritionixFood {
  food_name: string;
  brand_name?: string;
  serving_qty: number;
  serving_unit: string;
  serving_weight_grams: number;
  nf_calories: number;
  nf_total_fat: number;
  nf_saturated_fat: number;
  nf_cholesterol: number;
  nf_sodium: number;
  nf_total_carbohydrate: number;
  nf_dietary_fiber: number;
  nf_sugars: number;
  nf_protein: number;
  nf_potassium: number;
  nf_p: number; // phosphorus
  full_nutrients: {
    attr_id: number;
    value: number;
  }[];
  tags?: string[];
  alt_measures?: {
    serving_weight: number;
    measure: string;
    seq: number;
    qty: number;
  }[];
  photo: {
    thumb: string;
    highres: string;
    is_user_uploaded: boolean;
  };
}

export interface NutrientInfo {
  name: string;
  value: string | number;
  unit: string;
  isHighlight: boolean;
  percentOfDailyValue?: number;
}

/**
 * Interface for nutrition data returned by the API
 */
export interface NutritionData {
  nutrients: NutrientInfo[];
  foods: NutritionixFood[];
  raw: any;
}

/**
 * Get nutrition data from Nutritionix API for a food description
 * @param foodDescription Description of food to analyze
 * @param requestId Request identifier for tracking
 * @returns Nutritional data for the described food
 */
export async function getNutritionData(
  foodDescription: string,
  requestId: string
): Promise<{
  success: boolean;
  data: NutritionData | null;
  error?: string;
}> {
  console.time(`⏱️ [${requestId}] getNutritionData`);
  console.log(`🔍 [${requestId}] Getting nutrition data for: ${foodDescription}`);
  
  try {
    // Validate API credentials
    const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID;
    const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY;
    
    console.log(`🔑 [${requestId}] Nutritionix API credentials available:`, !!NUTRITIONIX_APP_ID && !!NUTRITIONIX_API_KEY);
    
    if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_API_KEY) {
      throw new Error('Nutritionix API credentials are not configured');
    }
    
    // Set timeout for request
    const timeoutMs = 10000; // 10 seconds
    
    // Make request to Nutritionix API
    const response = await axios.post(
      'https://trackapi.nutritionix.com/v2/natural/nutrients',
      { query: foodDescription },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': NUTRITIONIX_APP_ID,
          'x-app-key': NUTRITIONIX_API_KEY,
        },
        timeout: timeoutMs,
      }
    );
    
    // Validate response
    if (!response.data || !response.data.foods || !Array.isArray(response.data.foods)) {
      console.warn(`⚠️ [${requestId}] Invalid response format from Nutritionix API`);
      throw new Error('Invalid response format from Nutritionix API');
    }
    
    const foods = response.data.foods as NutritionixFood[];
    
    // Extract and format nutrients
    const nutrients: NutrientInfo[] = [
      {
        name: 'calories',
        value: sumNutrientAcrossFoods(foods, 'nf_calories'),
        unit: 'kcal',
        isHighlight: true
      },
      {
        name: 'protein',
        value: sumNutrientAcrossFoods(foods, 'nf_protein'),
        unit: 'g',
        isHighlight: true
      },
      {
        name: 'carbs',
        value: sumNutrientAcrossFoods(foods, 'nf_total_carbohydrate'),
        unit: 'g',
        isHighlight: true
      },
      {
        name: 'fat',
        value: sumNutrientAcrossFoods(foods, 'nf_total_fat'),
        unit: 'g',
        isHighlight: true
      },
      {
        name: 'fiber',
        value: sumNutrientAcrossFoods(foods, 'nf_dietary_fiber'),
        unit: 'g',
        isHighlight: false
      },
      {
        name: 'sugar',
        value: sumNutrientAcrossFoods(foods, 'nf_sugars'),
        unit: 'g',
        isHighlight: false
      },
      {
        name: 'sodium',
        value: sumNutrientAcrossFoods(foods, 'nf_sodium'),
        unit: 'mg',
        isHighlight: false
      },
      {
        name: 'potassium',
        value: sumNutrientAcrossFoods(foods, 'nf_potassium'),
        unit: 'mg',
        isHighlight: false
      }
    ];
    
    console.log(`✅ [${requestId}] Successfully retrieved nutrition data for ${foods.length} food items`);
    console.timeEnd(`⏱️ [${requestId}] getNutritionData`);
    
    return {
      success: true,
      data: {
        nutrients,
        foods,
        raw: response.data
      }
    };
  } catch (error: any) {
    console.error(`❌ [${requestId}] Error fetching nutrition data:`, error);
    console.timeEnd(`⏱️ [${requestId}] getNutritionData`);
    
    return {
      success: false,
      data: null,
      error: error.message || 'Unknown error during nutrition data fetch'
    };
  }
}

/**
 * Sums a specific nutrient across multiple food items
 * @param foods Array of food items
 * @param nutrientKey Key of the nutrient to sum
 * @returns Total value of the nutrient across all foods
 */
function sumNutrientAcrossFoods(foods: NutritionixFood[], nutrientKey: keyof NutritionixFood): number {
  return foods.reduce((sum, food) => {
    const value = food[nutrientKey];
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
}

/**
 * Create a dietary analysis based on nutrients and health goals
 * @param nutrients Array of nutrient information
 * @param healthGoals Array of health goals
 * @param requestId Request identifier for tracking
 * @returns Analysis of how well the food matches health goals
 */
export function createNutrientAnalysis(
  nutrients: NutrientInfo[],
  healthGoals: string[] = [],
  requestId: string
): {
  feedback: string[];
  suggestions: string[];
  goalScore: {
    overall: number;
    specific: Record<string, number>;
  };
} {
  console.log(`🔍 [${requestId}] Creating nutrient analysis with ${healthGoals.length} health goals`);
  
  // Default feedback and suggestions
  const feedback: string[] = [
    "This meal contains a mix of macronutrients."
  ];
  
  const suggestions: string[] = [
    "Consider balancing your meal with vegetables for more micronutrients.",
    "Stay hydrated by drinking water with your meal."
  ];
  
  // Default goal score
  let overallScore = 5; // Neutral score if no specific goals
  const specificScores: Record<string, number> = {};
  
  // Get nutrient values
  const calories = nutrients.find(n => n.name === 'calories')?.value as number || 0;
  const protein = nutrients.find(n => n.name === 'protein')?.value as number || 0;
  const carbs = nutrients.find(n => n.name === 'carbs')?.value as number || 0;
  const fat = nutrients.find(n => n.name === 'fat')?.value as number || 0;
  const fiber = nutrients.find(n => n.name === 'fiber')?.value as number || 0;
  const sugar = nutrients.find(n => n.name === 'sugar')?.value as number || 0;
  
  // Generate analysis based on health goals
  if (healthGoals.length > 0) {
    healthGoals.forEach(goal => {
      const lowerGoal = goal.toLowerCase();
      let specificScore = 5; // Start with neutral score for this specific goal
      
      // Weight loss goals
      if (lowerGoal.includes('weight loss') || lowerGoal.includes('lose weight')) {
        if (calories < 500) {
          feedback.push("This meal is relatively low in calories, which can support your weight loss goals.");
          specificScore += 1;
          overallScore += 1;
        } else if (calories > 800) {
          feedback.push("This meal is higher in calories. Consider portion control to support your weight loss goals.");
          suggestions.push("Try reducing portion sizes or choosing lower-calorie alternatives.");
          specificScore -= 1;
          overallScore -= 1;
        }
        
        if (fiber > 5) {
          feedback.push("Good amount of fiber, which can help you feel fuller for longer.");
          specificScore += 1;
          overallScore += 1;
        }
        
        specificScores['Weight Loss'] = Math.max(1, Math.min(10, specificScore));
      }
      
      // Muscle building goals
      if (lowerGoal.includes('muscle') || lowerGoal.includes('strength') || lowerGoal.includes('build')) {
        specificScore = 5; // Reset for this goal
        if (protein > 20) {
          feedback.push("Good source of protein to support muscle building and recovery.");
          specificScore += 2;
          overallScore += 2;
        } else {
          suggestions.push("Consider adding more protein to support muscle growth and recovery.");
          specificScore -= 1;
          overallScore -= 1;
        }
        
        specificScores['Muscle Building'] = Math.max(1, Math.min(10, specificScore));
      }
      
      // Low carb goals
      if (lowerGoal.includes('low carb') || lowerGoal.includes('keto')) {
        specificScore = 5; // Reset for this goal
        if (carbs < 20) {
          feedback.push("This meal is low in carbohydrates, aligning with your low-carb goals.");
          specificScore += 2;
          overallScore += 2;
        } else if (carbs > 50) {
          feedback.push("This meal contains a significant amount of carbohydrates.");
          suggestions.push("To better align with your low-carb goals, consider reducing starchy components.");
          specificScore -= 1;
          overallScore -= 1;
        }
        
        specificScores['Low Carb'] = Math.max(1, Math.min(10, specificScore));
      }
      
      // Heart health goals
      if (lowerGoal.includes('heart') || lowerGoal.includes('blood pressure') || lowerGoal.includes('cholesterol')) {
        specificScore = 5; // Reset for this goal
        const sodium = nutrients.find(n => n.name === 'sodium')?.value as number || 0;
        
        if (sodium > 1000) {
          feedback.push("This meal is high in sodium, which may impact heart health.");
          suggestions.push("Consider reducing salt and processed foods to lower sodium intake.");
          specificScore -= 1;
          overallScore -= 1;
        }
        
        if (fat > 25) {
          feedback.push("This meal is relatively high in fat.");
          suggestions.push("Focus on sources of healthy fats like avocados, nuts, and olive oil.");
          specificScore -= 1;
        }
        
        specificScores['Heart Health'] = Math.max(1, Math.min(10, specificScore));
      }
      
      // Diabetes or blood sugar management
      if (lowerGoal.includes('diabetes') || lowerGoal.includes('blood sugar')) {
        specificScore = 5; // Reset for this goal
        if (sugar > 20) {
          feedback.push("This meal contains a significant amount of sugar, which may affect blood sugar levels.");
          suggestions.push("Consider options with less added sugar to help manage blood glucose.");
          specificScore -= 2;
          overallScore -= 2;
        }
        
        if (fiber > 5) {
          feedback.push("Good amount of fiber, which can help moderate blood sugar response.");
          specificScore += 1;
          overallScore += 1;
        }
        
        specificScores['Blood Sugar Management'] = Math.max(1, Math.min(10, specificScore));
      }
    });
  } else {
    // General analysis without specific goals
    if (protein >= 15 && protein <= 30) {
      feedback.push("Contains a good amount of protein for general nutrition.");
    }
    
    if (fiber >= 5) {
      feedback.push("Contains fiber which supports digestive health.");
    }
    
    if (sugar > 20) {
      feedback.push("This meal is relatively high in sugar.");
      suggestions.push("Consider reducing sources of added sugar in your diet.");
    }
    
    specificScores['General Nutrition'] = 5;
  }
  
  // Ensure overall score is within bounds
  overallScore = Math.max(1, Math.min(10, overallScore));
  
  return {
    feedback,
    suggestions,
    goalScore: {
      overall: overallScore,
      specific: specificScores
    }
  };
} 