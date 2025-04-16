/**
 * Test fixtures for meal analysis scenarios
 * These can be used for component testing and validation
 */

export const highConfidenceMeal = {
  id: 'test-high-confidence',
  mealName: 'Grilled Chicken Salad',
  imageUrl: 'https://example.com/high-confidence-meal.jpg',
  createdAt: new Date(),
  analysis: {
    description: 'A well-balanced meal with grilled chicken, mixed greens, cherry tomatoes, and a light vinaigrette dressing.',
    nutrients: [
      { name: 'Protein', value: '32', unit: 'g', isHighlight: true, percentOfDailyValue: 64 },
      { name: 'Carbs', value: '18', unit: 'g', isHighlight: false, percentOfDailyValue: 6 },
      { name: 'Fat', value: '12', unit: 'g', isHighlight: false, percentOfDailyValue: 15 },
      { name: 'Fiber', value: '6', unit: 'g', isHighlight: true, percentOfDailyValue: 24 },
      { name: 'Vitamin C', value: '45', unit: 'mg', isHighlight: true, percentOfDailyValue: 50 },
    ],
    feedback: [
      'This meal is high in protein which supports muscle recovery and satiety.',
      'The mixed greens provide essential vitamins and minerals for overall health.',
      'Low in processed carbohydrates, supporting stable blood sugar levels.'
    ],
    suggestions: [
      'Consider adding some whole grains like quinoa for additional fiber and nutrients.',
      'A small handful of nuts would add healthy fats and extra protein.',
      'If this is a post-workout meal, you might want to include slightly more carbohydrates.'
    ],
    goalScore: 8.5,
    goalName: 'Weight Management',
    scoreExplanation: 'This meal is excellent for weight management due to its high protein content, fiber from vegetables, and moderate calories.',
    positiveFoodFactors: [
      'Lean protein from grilled chicken',
      'Fiber-rich leafy greens',
      'Antioxidants from fresh vegetables',
      'Healthy fats from olive oil in dressing'
    ],
    negativeFoodFactors: [
      'Could include more complex carbohydrates',
      'Might be slightly low in calories depending on portion size'
    ],
    detailedIngredients: [
      { name: 'Grilled Chicken', category: 'Protein', confidence: 9.2, confidenceEmoji: '🟢' },
      { name: 'Mixed Greens', category: 'Vegetable', confidence: 8.7, confidenceEmoji: '🟢' },
      { name: 'Cherry Tomatoes', category: 'Vegetable', confidence: 8.9, confidenceEmoji: '🟢' },
      { name: 'Olive Oil Dressing', category: 'Oil', confidence: 7.6, confidenceEmoji: '🟢' },
      { name: 'Red Onion', category: 'Vegetable', confidence: 8.2, confidenceEmoji: '🟢' }
    ],
    rawGoal: 'Weight Management'
  },
  goalType: 'Weight Management',
  goalScore: 8.5,
  goal: 'Weight Management'
};

export const lowConfidenceMeal = {
  id: 'test-low-confidence',
  mealName: 'Unclear Dinner Plate',
  imageUrl: 'https://example.com/low-confidence-meal.jpg',
  createdAt: new Date(),
  analysis: {
    description: 'This appears to be a dinner plate with what might be a protein source, some vegetables, and possibly a grain or starch.',
    nutrients: [
      { name: 'Protein', value: '20-30', unit: 'g', isHighlight: true, percentOfDailyValue: 50 },
      { name: 'Carbs', value: '30-40', unit: 'g', isHighlight: false, percentOfDailyValue: 15 },
      { name: 'Fat', value: '10-15', unit: 'g', isHighlight: false, percentOfDailyValue: 20 },
    ],
    feedback: [
      'This meal appears to contain a good balance of macronutrients.',
      'Based on what we can see, there seems to be a moderate amount of protein.'
    ],
    suggestions: [
      'For clearer nutrition analysis, try taking photos in better lighting.',
      'Ensure all components of your meal are visible in the frame.',
      'Consider separating components slightly for easier identification.'
    ],
    goalScore: 6.0,
    goalName: 'Muscle Building',
    scoreExplanation: 'Based on the visible components, this meal provides some protein which supports muscle building, but the exact nutritional profile is unclear.',
    positiveFoodFactors: [
      'Contains a protein source',
      'Includes some vegetables',
      'Has a balanced macronutrient profile'
    ],
    negativeFoodFactors: [
      'Unclear portion sizes',
      'Limited ability to identify specific nutrients'
    ],
    detailedIngredients: [
      { name: 'Protein (possibly chicken or fish)', category: 'Protein', confidence: 5.8, confidenceEmoji: '🟡' },
      { name: 'Green Vegetables', category: 'Vegetable', confidence: 6.2, confidenceEmoji: '🟡' },
      { name: 'Starchy Component', category: 'Carbs', confidence: 4.9, confidenceEmoji: '🔴' },
      { name: 'Sauce or Dressing', category: 'Condiment', confidence: 3.8, confidenceEmoji: '🔴' }
    ],
    lowConfidence: true,
    message: 'The image quality makes it difficult to identify all components clearly. Results may be limited.',
    rawGoal: 'Muscle Building',
    missing: [
      'Exact calorie count',
      'Complete micronutrient profile',
      'Precise ingredient identification'
    ]
  },
  goalType: 'Muscle Building',
  goalScore: 6.0,
  goal: 'Muscle Building'
};

export const fallbackMeal = {
  id: 'test-fallback',
  mealName: 'Unclear Image',
  imageUrl: 'https://example.com/fallback-meal.jpg',
  createdAt: new Date(),
  analysis: {
    description: 'We detected what appears to be food in this image, but details are unclear.',
    nutrients: [],
    feedback: [
      'The image quality prevents accurate nutrition analysis.'
    ],
    suggestions: [
      'Try taking a photo with better lighting.',
      'Ensure the camera is steady to prevent blur.',
      'Position the camera directly above the plate for best results.',
      'Make sure all food items are clearly visible in the frame.'
    ],
    goalScore: 5.0,
    goalName: 'General Health',
    scoreExplanation: 'Unable to provide an accurate score due to limited visibility of meal components.',
    positiveFoodFactors: [],
    negativeFoodFactors: [],
    detailedIngredients: [
      { name: 'Food Item', category: 'Unknown', confidence: 2.4, confidenceEmoji: '🔴' }
    ],
    fallback: true,
    message: 'We couldn\'t clearly identify the components of this meal. Please try again with a better quality photo.',
    rawGoal: 'General Health',
    missing: [
      'Nutritional breakdown',
      'Ingredient identification',
      'Calorie estimation',
      'Macronutrient content'
    ]
  },
  goalType: 'General Health',
  goalScore: 5.0,
  goal: 'General Health'
};

export const sessionMeal = {
  ...highConfidenceMeal,
  id: 'session-meal',
  mealName: 'Unsaved Session Meal',
  // This would typically be displayed with a session banner
};

export const emptyAnalysisMeal = {
  id: 'empty-analysis',
  mealName: 'No Analysis Available',
  imageUrl: 'https://example.com/meal-without-analysis.jpg',
  createdAt: new Date(),
  analysis: {},
  goalType: 'Sleep',
  goal: 'Sleep'
}; 