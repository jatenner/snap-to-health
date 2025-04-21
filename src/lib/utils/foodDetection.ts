/**
 * Utility functions for detecting food-related content in OCR text
 */

// Common food-related words to detect valid food descriptions
const FOOD_RELATED_WORDS = [
  // Common foods
  'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'rice', 'pasta', 'bread', 'potato',
  'fries', 'pizza', 'burger', 'sandwich', 'salad', 'soup', 'noodle', 'meat', 'cheese',
  'yogurt', 'milk', 'egg', 'breakfast', 'lunch', 'dinner', 'meal', 'snack', 'dish',
  
  // Fruits and vegetables
  'apple', 'banana', 'orange', 'grape', 'berry', 'strawberry', 'blueberry', 'avocado',
  'tomato', 'lettuce', 'spinach', 'kale', 'carrot', 'broccoli', 'cauliflower', 'onion',
  'pepper', 'vegetable', 'fruit',
  
  // Grains and legumes
  'bean', 'lentil', 'chickpea', 'quinoa', 'oat', 'cereal', 'granola', 'wheat', 'grain',
  
  // Cooking terms
  'baked', 'fried', 'grilled', 'roasted', 'boiled', 'steamed', 'sautéed', 'stir-fry',
  
  // Nutritional terms
  'protein', 'carb', 'fat', 'calorie', 'nutrient', 'vitamin', 'mineral', 'fiber',
  
  // Menu and recipe terms
  'serving', 'portion', 'ingredient', 'recipe', 'menu', 'dish', 'plate', 'bowl',
  
  // Restaurant terms
  'restaurant', 'café', 'bistro', 'diner',

  // Units of measurement
  'gram', 'ounce', 'pound', 'tbsp', 'tsp', 'cup', 'oz', 'lb', 'g', 'mg', 'kg'
];

/**
 * Checks if OCR text contains enough food-related words to be considered a valid food description
 * 
 * @param text The OCR extracted text to analyze
 * @param minFoodWords Minimum number of food-related words required to be considered valid food text
 * @returns Object containing validity and details about found food terms
 */
export function containsFoodRelatedTerms(
  text: string, 
  minFoodWords: number = 3
): { 
  isValid: boolean; 
  foodTerms: string[];
  foodTermCount: number;
  confidence: number;
} {
  // If text is empty or too short, it's definitely not valid
  if (!text || text.length < 5) {
    return { 
      isValid: false, 
      foodTerms: [], 
      foodTermCount: 0,
      confidence: 0 
    };
  }

  // Normalize text - lowercase and remove special characters
  const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = normalizedText.split(/\s+/).filter(word => word.length > 2);
  
  // Find food-related words in the text
  const foundFoodTerms = words.filter(word => 
    FOOD_RELATED_WORDS.some(foodTerm => word.includes(foodTerm))
  );
  
  // Get unique food terms
  const uniqueFoodTerms = Array.from(new Set(foundFoodTerms));
  
  // Calculate a simple confidence score based on number of food terms found
  const confidence = Math.min(1.0, uniqueFoodTerms.length / minFoodWords);
  
  return {
    isValid: uniqueFoodTerms.length >= minFoodWords,
    foodTerms: uniqueFoodTerms,
    foodTermCount: uniqueFoodTerms.length,
    confidence
  };
}

/**
 * Determines if the OCR text is likely from a nutrition label or food packaging
 * 
 * @param text OCR extracted text to analyze
 * @returns Whether the text appears to be from a nutrition label
 */
export function isNutritionLabel(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // Check for common nutrition label terms
  const nutritionLabelTerms = [
    'nutrition facts', 'serving size', 'calories', 'total fat', 'sodium',
    'total carbohydrate', 'dietary fiber', 'sugars', 'protein', 'vitamin',
    'calcium', 'iron', 'potassium', 'daily value', '% daily value',
    'servings per container', 'amount per serving'
  ];
  
  // Count how many nutrition label terms appear in the text
  const matchCount = nutritionLabelTerms.filter(term => lowerText.includes(term)).length;
  
  // If it has at least 3 nutrition label terms, it's likely a nutrition label
  return matchCount >= 3;
} 