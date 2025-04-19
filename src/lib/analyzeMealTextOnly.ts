/**
 * This file contains functions for analyzing meal text extracted from OCR
 * It provides text-based analysis without requiring image data
 */

import { 
  getNutritionData, 
  NutrientInfo 
} from './nutritionixApi';
import { API_CONFIG } from './constants';

// Define required interfaces locally instead of importing
export interface DetailedIngredient {
  name: string;
  category: string;
  confidence: number;
  confidenceEmoji?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface HealthGoals {
  primary: string;
  additional: string[];
  loseWeight?: boolean;
  buildMuscle?: boolean;
  improveEnergy?: boolean;
  improveDigestion?: boolean;
  lowerCholesterol?: boolean;
}

export interface DietaryPreferences {
  allergies: string[];
  avoidances: string[];
  vegetarian?: boolean;
  vegan?: boolean;
  lowCarb?: boolean;
}

// This interface ensures compatibility with the original AnalysisResult structure
export interface AnalysisResult {
  description: string;
  nutrients: NutrientInfo[] | Record<string, number>;
  ingredients: DetailedIngredient[];
  feedback: string[] | string;
  suggestions: string[];
  metadata: {
    model: string;
    processingTimeMs: number;
    confidence: number;
    isPartialResult: boolean;
    errors: string[];
  };
}

/**
 * Interface for meal analysis result
 */
export interface MealAnalysisResult {
  success: boolean;
  description: string;
  ingredients: DetailedIngredient[];
  nutrients: NutrientInfo[];
  feedback: string[];
  suggestions: string[];
  error?: string;
  processingTimeMs: number;
}

/**
 * Analyzes meal text extracted from OCR
 * @param text The OCR text to analyze
 * @param healthGoals User's health goals
 * @param dietaryPreferences User's dietary preferences
 * @param requestId Unique identifier for the request
 * @returns A structured analysis of the meal
 */
export async function analyzeMealTextOnly(
  text: string,
  healthGoals: HealthGoals,
  dietaryPreferences: DietaryPreferences,
  requestId: string
): Promise<MealAnalysisResult> {
  const startTime = Date.now();
  console.log(`🔍 [${requestId}] Starting text-only meal analysis`);
  
  // Check if text is too short for meaningful analysis
  if (!text || text.length < 10) {
    console.warn(`⚠️ [${requestId}] Text too short for analysis: ${text?.length || 0} chars`);
    return {
      success: false,
      description: "The provided text is too short for analysis.",
      ingredients: [],
      nutrients: [],
      feedback: ["Unable to analyze - insufficient text."],
      suggestions: ["Please provide more detailed text about your meal."],
      error: "Text too short for analysis",
      processingTimeMs: Date.now() - startTime
    };
  }
  
  try {
    // Extract food items from text
    const foodItems = extractFoodItems(text, requestId);
    console.log(`📋 [${requestId}] Extracted ${foodItems.length} food items`);
    
    if (foodItems.length === 0) {
      return {
        success: false,
        description: "No food items could be identified in the text.",
        ingredients: [],
        nutrients: [],
        feedback: ["No food items detected in the provided text."],
        suggestions: ["Try providing clearer descriptions of the food in your meal."],
        error: "No food items identified",
        processingTimeMs: Date.now() - startTime
      };
    }
    
    // Join food items for Nutritionix query
    const foodItemsText = foodItems.join(", ");
    
    // Get nutrition data
    const nutritionData = await getNutritionData(foodItemsText, requestId);
    
    if (!nutritionData.success || !nutritionData.data) {
      console.error(`❌ [${requestId}] Failed to get nutrition data`);
      return {
        success: false,
        description: "Could not retrieve nutritional information.",
        ingredients: foodItems.map(item => ({
          name: item,
          category: "unknown",
          confidence: 0.5
        })),
        nutrients: [],
        feedback: ["Unable to analyze nutritional content."],
        suggestions: ["Try again with more common food descriptions."],
        error: nutritionData.error || "Failed to retrieve nutrition data",
        processingTimeMs: Date.now() - startTime
      };
    }
    
    // Create detailed ingredients from food items
    const ingredients: DetailedIngredient[] = foodItems.map(item => ({
      name: item,
      category: "detected from text",
      confidence: 0.8,
      confidenceEmoji: "📝"
    }));
    
    // Generate meal description
    const description = generateMealDescription(
      foodItems, 
      nutritionData.data.nutrients
    );
    
    // Generate feedback based on health goals and dietary preferences
    const feedback = generateFeedback(
      nutritionData.data.nutrients,
      healthGoals,
      dietaryPreferences,
      requestId
    );
    
    // Generate suggestions
    const suggestions = generateSuggestions(
      nutritionData.data.nutrients,
      ingredients,
      healthGoals,
      dietaryPreferences,
      requestId
    );
    
    console.log(`✅ [${requestId}] Text-only meal analysis completed successfully`);
    
    return {
      success: true,
      description,
      ingredients,
      nutrients: nutritionData.data.nutrients,
      feedback,
      suggestions,
      processingTimeMs: Date.now() - startTime
    };
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error in text-only meal analysis:`, error);
    return {
      success: false,
      description: "An error occurred during analysis.",
      ingredients: [],
      nutrients: [],
      feedback: ["Analysis failed due to an unexpected error."],
      suggestions: ["Please try again with different text."],
      error: error instanceof Error ? error.message : "Unknown error during analysis",
      processingTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Extract food items from text, handling OCR noise and formatting issues
 * @param text Raw text from OCR
 * @param requestId Request ID for logging
 * @returns Array of food items
 */
function extractFoodItems(text: string, requestId: string): string[] {
  console.log(`🔍 [${requestId}] Extracting food items from text (${text.length} chars)`);
  
  if (!text || text.length < 3) {
    console.warn(`⚠️ [${requestId}] Text too short to extract food items`);
    return [];
  }
  
  // Clean up text - handle common OCR issues
  let cleanedText = text
    .replace(/\r\n/g, ' ') // Replace Windows line breaks
    .replace(/\n/g, ' ')   // Replace Unix line breaks
    .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s,.:;()&%-]/g, ' ') // Replace non-word chars except common punctuation
    .trim();
  
  // Make common corrections for OCR errors
  cleanedText = cleanedText
    .replace(/0 (g|mg)/gi, '0g') // Fix spacing in nutrient values
    .replace(/\bo\b/gi, '0')     // Replace standalone 'o' with '0'
    .replace(/calo ries/gi, 'calories')
    .replace(/protem/gi, 'protein')
    .replace(/carb0/gi, 'carbo')
    .replace(/carbO/gi, 'carbo')
    .replace(/\bl\b/gi, '1')     // OCR often confuses l and 1
    .replace(/\bI\b/g, '1')      // OCR often confuses I and 1
    .replace(/\bO\b/g, '0')      // OCR often confuses O and 0
    .replace(/grarns/gi, 'grams');
  
  console.log(`📝 [${requestId}] Cleaned text: "${cleanedText.substring(0, 100)}${cleanedText.length > 100 ? '...' : ''}"`);
  
  // Try different splitting strategies
  let foodItems: string[] = [];
  
  // Strategy 1: Split by commas, semicolons, or "and"
  const basicItems = cleanedText
    .split(/[,;]|\band\b/i)
    .map(item => item.trim())
    .filter(item => item.length >= 3);
  
  if (basicItems.length >= 2) {
    foodItems = basicItems;
    console.log(`✅ [${requestId}] Extracted ${foodItems.length} food items using basic splitting`);
  } 
  // Strategy 2: Look for food items with quantities/measurements
  else {
    const foodWithQuantityRegex = /(\d+\s*(?:g|mg|oz|cup|tbsp|tsp|lb|slice|piece|serving)s?\s+of\s+)?([a-zA-Z\s]{3,}?)(?=\d|\s+\d|$|,|;|\s+and\s+|\s+with\s+)/gi;
    // Use Array.from instead of spread operator for better compatibility
    const matches = Array.from(cleanedText.matchAll(foodWithQuantityRegex));
    
    if (matches.length >= 2) {
      foodItems = matches
        .map(match => (match[1] || '') + (match[2] || '').trim())
        .filter(item => item.length >= 3);
      console.log(`✅ [${requestId}] Extracted ${foodItems.length} food items using quantity pattern matching`);
    }
  }
  
  // Strategy 3: If we still don't have enough items, try a line-break approach
  if (foodItems.length < 2) {
    const lineItems = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length >= 3 && line.length <= 50 && !/^\d+$/.test(line) && !/protein|carb|fat|calor/i.test(line));
    
    if (lineItems.length >= 2) {
      foodItems = lineItems;
      console.log(`✅ [${requestId}] Extracted ${foodItems.length} food items using line-break parsing`);
    }
  }
  
  // Strategy 4: If all else fails, just break the text into phrases
  if (foodItems.length < 2) {
    const phrases = cleanedText
      .replace(/[.;,]/g, '#')
      .split('#')
      .map(phrase => phrase.trim())
      .filter(phrase => 
        phrase.length >= 5 && 
        phrase.length <= 60 && 
        !/^\d+$/.test(phrase) && 
        !/^(protein|carb|fat|calor)/i.test(phrase) &&
        !/grams|per serving/i.test(phrase)
      );
    
    if (phrases.length > 0) {
      foodItems = phrases;
      console.log(`✅ [${requestId}] Extracted ${foodItems.length} food items using phrase breaking`);
    }
  }
  
  // Post-process the food items
  const processedItems = foodItems
    .map(item => {
      // Try to remove nutrition info from food items
      return item
        .replace(/\d+\s*(?:calories|cal|kcal|kj)/gi, '')
        .replace(/\d+\s*(?:g|mg|mcg)\s+(?:protein|carb|sugar|fat)/gi, '')
        .replace(/\(.*?\)/g, '') // Remove parenthetical information
        .trim();
    })
    .filter(item => 
      item.length >= 3 && 
      item.length <= 100 &&
      !/^\d+$/.test(item) &&  // Not just numbers
      !/^(?:protein|carb|fat|fiber|sugar)s?$/i.test(item) && // Not just nutrient names
      !/^(?:total|daily|value|amount)$/i.test(item) // Not just label words
    )
    .filter((item, i, arr) => arr.indexOf(item) === i); // Remove duplicates
  
  console.log(`📋 [${requestId}] Found ${processedItems.length} unique food items`);
  
  // If we still don't have food items, extract the longest phrases from the text
  if (processedItems.length === 0) {
    const words = cleanedText.split(/\s+/);
    if (words.length >= 4) {
      // Take a few 2-3 word combinations from the cleaned text
      processedItems.push(words.slice(0, 3).join(' '));
      if (words.length >= 7) {
        processedItems.push(words.slice(3, 6).join(' '));
      }
      if (words.length >= 10) {
        processedItems.push(words.slice(6, 9).join(' '));
      }
      console.log(`📋 [${requestId}] Created ${processedItems.length} phrase-based food items`);
    }
  }
  
  // Log the extracted food items for debugging
  if (processedItems.length > 0) {
    console.log(`📋 [${requestId}] Extracted food items:`, processedItems.join(', '));
  } else {
    console.warn(`⚠️ [${requestId}] No food items could be extracted from text`);
  }
  
  return processedItems;
}

/**
 * Generates a descriptive summary of the meal
 * @param foodItems Array of food items
 * @param nutrients Array of nutrients
 * @returns A text description of the meal
 */
function generateMealDescription(
  foodItems: string[],
  nutrients: NutrientInfo[]
): string {
  if (foodItems.length === 0) {
    return "No food items were detected in the image.";
  }
  
  // Find calories
  const calories = nutrients.find(n => n.name.toLowerCase() === "calories")?.value || 0;
  
  // Create description based on food items
  const foodDescription = foodItems.length > 1 
    ? `${foodItems.slice(0, -1).join(", ")} and ${foodItems[foodItems.length - 1]}`
    : foodItems[0];
  
  return `This meal contains ${foodDescription}. It provides approximately ${Math.round(Number(calories))} calories.`;
}

/**
 * Generates feedback based on nutritional content and user preferences
 * @param nutrients Array of nutrients
 * @param healthGoals User's health goals
 * @param dietaryPreferences User's dietary preferences
 * @param requestId Request identifier for logging
 * @returns Array of feedback items
 */
function generateFeedback(
  nutrients: NutrientInfo[],
  healthGoals: HealthGoals,
  dietaryPreferences: DietaryPreferences,
  requestId: string
): string[] {
  console.log(`💬 [${requestId}] Generating feedback based on health goals and dietary preferences`);
  
  const feedback: string[] = [];
  
  // Get key nutrients
  const calories = Number(nutrients.find(n => n.name.toLowerCase() === "calories")?.value || 0);
  const protein = Number(nutrients.find(n => n.name.toLowerCase() === "protein")?.value || 0);
  const carbs = Number(nutrients.find(n => n.name.toLowerCase() === "carbohydrates")?.value || 0) || 
                Number(nutrients.find(n => n.name.toLowerCase() === "carbs")?.value || 0);
  const fat = Number(nutrients.find(n => n.name.toLowerCase() === "fat")?.value || 0) || 
              Number(nutrients.find(n => n.name.toLowerCase() === "total fat")?.value || 0);
  const fiber = Number(nutrients.find(n => n.name.toLowerCase() === "fiber")?.value || 0);
  
  // Basic nutritional feedback
  feedback.push(`This meal contains approximately ${Math.round(calories)} calories.`);
  
  // Macronutrient breakdown
  feedback.push(`Macronutrient breakdown: ${Math.round(protein)}g protein, ${Math.round(carbs)}g carbs, ${Math.round(fat)}g fat.`);
  
  // Weight loss goal
  if (healthGoals.loseWeight) {
    if (calories > 600) {
      feedback.push("This meal is relatively high in calories for a weight loss diet. Consider reducing portion sizes or choosing lower-calorie alternatives.");
    } else {
      feedback.push("This meal is moderate in calories, which supports your weight loss goal.");
    }
  }
  
  // Muscle building goal
  if (healthGoals.buildMuscle) {
    if (protein < 20) {
      feedback.push("This meal is relatively low in protein for muscle building. Consider adding a protein source like chicken, fish, tofu, or legumes.");
    } else {
      feedback.push("The protein content in this meal supports your muscle building goal.");
    }
  }
  
  // Energy goal
  if (healthGoals.improveEnergy) {
    if (carbs < 30) {
      feedback.push("For improved energy levels, you might benefit from adding more complex carbohydrates to this meal.");
    } else {
      feedback.push("The carbohydrate content in this meal can help provide sustained energy.");
    }
  }
  
  // Digestion goal
  if (healthGoals.improveDigestion) {
    if (fiber < 5) {
      feedback.push("To support digestive health, consider adding more fiber-rich foods like whole grains, fruits, or vegetables.");
    } else {
      feedback.push("This meal contains a good amount of fiber, which supports digestive health.");
    }
  }
  
  // Cholesterol goal
  if (healthGoals.lowerCholesterol) {
    if (fat > 20) {
      feedback.push("This meal is relatively high in fat. For cholesterol management, consider reducing saturated fats and focusing on heart-healthy fats like those found in fish, nuts, and olive oil.");
    } else {
      feedback.push("The moderate fat content in this meal is generally supportive of cholesterol management.");
    }
  }
  
  return feedback;
}

/**
 * Generates suggestions based on nutritional content and user preferences
 * @param nutrients Array of nutrients
 * @param ingredients Array of ingredients
 * @param healthGoals User's health goals
 * @param dietaryPreferences User's dietary preferences
 * @param requestId Request identifier for logging
 * @returns Array of suggestions
 */
function generateSuggestions(
  nutrients: NutrientInfo[],
  ingredients: DetailedIngredient[],
  healthGoals: HealthGoals,
  dietaryPreferences: DietaryPreferences,
  requestId: string
): string[] {
  console.log(`💡 [${requestId}] Generating suggestions based on analysis results`);
  
  const suggestions: string[] = [];
  
  // Get key nutrients
  const calories = Number(nutrients.find(n => n.name.toLowerCase() === "calories")?.value || 0);
  const protein = Number(nutrients.find(n => n.name.toLowerCase() === "protein")?.value || 0);
  const carbs = Number(nutrients.find(n => n.name.toLowerCase() === "carbohydrates")?.value || 0) || 
                Number(nutrients.find(n => n.name.toLowerCase() === "carbs")?.value || 0);
  const fat = Number(nutrients.find(n => n.name.toLowerCase() === "fat")?.value || 0) || 
              Number(nutrients.find(n => n.name.toLowerCase() === "total fat")?.value || 0);
  const fiber = Number(nutrients.find(n => n.name.toLowerCase() === "fiber")?.value || 0);
  
  // Basic suggestions
  if (ingredients.length === 0) {
    suggestions.push("Consider providing a clearer image or description of your meal for better analysis.");
    return suggestions;
  }
  
  // Weight loss suggestions
  if (healthGoals.loseWeight) {
    if (calories > 600) {
      suggestions.push("Try smaller portion sizes or replacing high-calorie ingredients with lower-calorie alternatives like vegetables.");
    }
    if (fat > 25) {
      suggestions.push("Reduce added oils or choose leaner protein sources to lower the fat content of this meal.");
    }
  }
  
  // Muscle building suggestions
  if (healthGoals.buildMuscle) {
    if (protein < 20) {
      suggestions.push("Add a high-quality protein source like chicken breast, salmon, Greek yogurt, or a protein shake.");
    }
    if (carbs < 40 && calories < 500) {
      suggestions.push("Consider adding complex carbs like brown rice, quinoa, or sweet potatoes to fuel your workouts.");
    }
  }
  
  // Energy suggestions
  if (healthGoals.improveEnergy) {
    if (carbs < 30) {
      suggestions.push("Include more whole grains or starchy vegetables for sustained energy.");
    }
    if (fat > 30 && carbs < 40) {
      suggestions.push("Balance your macronutrients by reducing fat and increasing complex carbohydrates for better energy levels.");
    }
  }
  
  // Digestion suggestions
  if (healthGoals.improveDigestion) {
    if (fiber < 5) {
      suggestions.push("Add more fiber-rich foods like beans, lentils, whole grains, or vegetables to support digestive health.");
    }
    suggestions.push("Stay hydrated by drinking water with your meals to aid digestion.");
  }
  
  // Cholesterol suggestions
  if (healthGoals.lowerCholesterol) {
    if (fat > 20) {
      suggestions.push("Choose heart-healthy fats like those found in avocados, nuts, and olive oil instead of saturated fats.");
    }
    suggestions.push("Incorporate more soluble fiber from sources like oats, barley, and legumes to help manage cholesterol.");
  }
  
  // General healthy eating suggestions
  if (suggestions.length < 2) {
    suggestions.push("Try to include a variety of colorful fruits and vegetables in your meals for a wide range of nutrients.");
    suggestions.push("Balance your plate with approximately 1/4 protein, 1/4 whole grains, and 1/2 vegetables for optimal nutrition.");
  }
  
  return suggestions;
}

/**
 * Converts a meal analysis result to the standard analysis result format
 * @param mealAnalysis Result from text-based meal analysis
 * @returns Standardized analysis result
 */
export function convertToStandardAnalysisResult(mealAnalysis: MealAnalysisResult): AnalysisResult {
  return {
    description: mealAnalysis.description || "Unable to analyze meal contents",
    nutrients: mealAnalysis.nutrients || [],
    ingredients: mealAnalysis.ingredients || [],
    feedback: mealAnalysis.feedback || [],
    suggestions: mealAnalysis.suggestions || [],
    metadata: {
      model: "text-based-analysis",
      processingTimeMs: mealAnalysis.processingTimeMs,
      confidence: mealAnalysis.success ? 0.7 : 0.3,
      isPartialResult: !mealAnalysis.success,
      errors: mealAnalysis.error ? [mealAnalysis.error] : []
    }
  };
}

/**
 * Create a structured nutrient list from meal ingredients
 * @param ingredients List of identified ingredients
 * @param healthGoals User's health goals for contextual analysis
 * @param requestId Request ID for tracking
 * @returns Structured nutrient analysis
 */
export async function structureNutrients(
  ingredients: string[],
  healthGoals: string[] = [],
  requestId: string
): Promise<{
  success: boolean;
  nutrients: any[];
  feedback: string[];
  suggestions: string[];
  error?: string;
}> {
  // This function would typically call the Nutritionix API
  // The implementation would be similar to existing code in the app
  
  console.log(`[${requestId}] Structuring nutrients for ${ingredients.length} ingredients`);
  
  // Placeholder implementation - should be replaced with actual Nutritionix integration
  return {
    success: true,
    nutrients: ingredients.map(ingredient => ({
      name: ingredient,
      value: 100,
      unit: 'g',
      isHighlight: true
    })),
    feedback: [
      'Analysis based on text-extracted ingredients',
      'Consider taking a clearer photo for more precise nutritional data'
    ],
    suggestions: [
      'Include all food items in the frame',
      'Take photos in good lighting'
    ]
  };
} 