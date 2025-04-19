import OpenAI from 'openai';
import { NutritionData, NutrientInfo } from './nutritionixApi';
import { GPT_MODEL } from './constants';

// Extend the NutritionData interface to include a source field
interface ExtendedNutritionData extends NutritionData {
  source: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '10000', 10),
});

/**
 * Fallback function to use GPT to generate nutrition data when Nutritionix fails
 * @param foodText The food description to analyze
 * @returns Structured nutrition data similar to Nutritionix format
 */
export async function callGptNutritionFallback(foodText: string): Promise<ExtendedNutritionData> {
  console.log(`[GPT Fallback] Generating nutrition data for: "${foodText}"`);
  
  // Default nutrients to ensure we always have them in the response
  const defaultNutrients: string[] = [
    'calories', 'protein', 'carbohydrates', 'fat', 
    'fiber', 'sugar', 'sodium', 'cholesterol'
  ];
  
  try {
    const response = await openai.chat.completions.create({
      model: GPT_MODEL,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `You are a nutrition analysis AI. Extract nutrition information from the food description. 
                    Provide estimates for calories, protein (g), carbohydrates (g), fat (g), fiber (g), sugar (g), 
                    sodium (mg), and cholesterol (mg). Also identify all ingredients. Format your response as JSON.`
        },
        {
          role: 'user',
          content: `Analyze the nutrition content of this meal: "${foodText}"`
        }
      ],
      response_format: { type: 'json_object' }
    });

    // Extract the JSON from the response
    const content = response.choices[0]?.message?.content || '{}';
    let nutritionData: any;
    
    try {
      nutritionData = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse GPT response as JSON:', e);
      nutritionData = {
        calories: 0,
        protein: 0,
        carbohydrates: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        cholesterol: 0,
        ingredients: []
      };
    }
    
    // Convert to NutritionData format
    const formattedNutrients: NutrientInfo[] = [
      {
        name: 'Calories',
        value: nutritionData.calories || 0,
        unit: 'kcal',
        isHighlight: true
      },
      {
        name: 'Protein',
        value: nutritionData.protein || 0,
        unit: 'g',
        isHighlight: true
      },
      {
        name: 'Carbohydrates',
        value: nutritionData.carbohydrates || nutritionData.carbs || 0,
        unit: 'g',
        isHighlight: true
      },
      {
        name: 'Fat',
        value: nutritionData.fat || 0,
        unit: 'g',
        isHighlight: true
      },
      {
        name: 'Fiber',
        value: nutritionData.fiber || 0,
        unit: 'g',
        isHighlight: false
      },
      {
        name: 'Sugar',
        value: nutritionData.sugar || 0,
        unit: 'g',
        isHighlight: false
      },
      {
        name: 'Sodium',
        value: nutritionData.sodium || 0,
        unit: 'mg',
        isHighlight: false
      },
      {
        name: 'Cholesterol',
        value: nutritionData.cholesterol || 0,
        unit: 'mg',
        isHighlight: false
      }
    ];
    
    // Extract ingredients from response or use a simple split on commas
    const ingredients = nutritionData.ingredients || 
                       foodText.split(',').map((i: string) => i.trim());
    
    console.log(`[GPT Fallback] Successfully generated nutrition data with ${formattedNutrients.length} nutrients`);
    
    return {
      nutrients: formattedNutrients,
      foods: [],
      raw: nutritionData,
      source: 'gpt'
    };
  } catch (error) {
    console.error('[GPT Fallback] Error generating nutrition data:', error);
    
    // Return minimal data structure on failure
    return {
      nutrients: defaultNutrients.map(name => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: 0,
        unit: name === 'calories' ? 'kcal' : name === 'sodium' || name === 'cholesterol' ? 'mg' : 'g',
        isHighlight: ['calories', 'protein', 'carbohydrates', 'fat'].includes(name)
      })),
      foods: [],
      raw: {},
      source: 'gpt_fallback_error'
    };
  }
} 