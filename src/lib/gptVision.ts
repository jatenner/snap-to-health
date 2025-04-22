import { OpenAI } from 'openai';
import { GPT_MODEL, API_CONFIG, FEATURE_FLAGS } from './constants';

// Remove the global OpenAI client initialization
// const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyzes an image using OpenAI's GPT-4 Vision API to provide meal analysis
 * 
 * @param base64Image Base64-encoded image to analyze
 * @param healthGoal Health goal to consider in the analysis
 * @param requestId Unique ID for request tracking
 * @returns Analysis result from GPT-4 Vision
 */
export async function analyzeWithGPT4Vision(base64Image: string, healthGoal: string, requestId: string) {
  // Validate API key first
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`[${requestId}] No OpenAI API key found in environment variables`);
    throw new Error('OpenAI API key not configured. Please check server environment.');
  }
  
  // Initialize OpenAI client inside the function
  const oai = new OpenAI({ apiKey });
  
  // Get the GPT-4 Vision prompt specific to the health goal
  const goalSpecificPrompt = getGoalSpecificPrompt(healthGoal);
  
  console.log(`[${requestId}] Requesting GPT-4 Vision analysis with ${goalSpecificPrompt.length} chars prompt`);
  console.log(`[${requestId}] Using model: ${GPT_MODEL}`);
  
  // Specialized system prompt for food analysis with vision
  const systemMessageContent = `You are an expert nutritionist analyzing food images.
You have deep knowledge of nutrition, dietary patterns, food ingredients, and their impact on various health goals.

The user's health goal is: "${healthGoal}".

${goalSpecificPrompt}

Carefully analyze the image of food and provide detailed nutritional insights structured as valid JSON.`;

  // Configure timeout
  const timeoutMs = API_CONFIG.DEFAULT_TIMEOUT_MS || 30000;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort('Operation timed out'), timeoutMs);
  
  try {
    // Start the API request
    const startTime = Date.now();
    
    // Call OpenAI API with vision capabilities
    const response = await oai.chat.completions.create({
      model: GPT_MODEL,
      max_tokens: 4000,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: systemMessageContent
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this food image with respect to my health goal: "${healthGoal}".
Return detailed nutritional analysis in valid JSON format with these fields:
- description: Clear description of the visible food items
- ingredientList: Array of visible ingredients
- detailedIngredients: Array of objects with {name, category, confidence}
- confidence: 1-10 score of analysis confidence
- basicNutrition: Object with calorie and macronutrient estimates
- goalImpactScore: 1-10 score of how well this meal supports the health goal
- goalName: Sanitized version of the health goal
- scoreExplanation: Explanation of the impact score
- positiveFoodFactors: Array of positive nutritional aspects
- negativeFoodFactors: Array of concerns for the health goal
- feedback: Array of specific feedback points
- suggestions: Array of actionable suggestions
- imageChallenges: Array of any issues with image analysis

For partial or unclear images, provide your best estimate and indicate lower confidence.
IMPORTANT: Return ONLY valid JSON with no surrounding text.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    }, {
      signal: abortController.signal
    });

    // Log time and token usage
    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] GPT-4 Vision completed in ${processingTime}ms
- Prompt tokens: ${response.usage?.prompt_tokens || 'unknown'}
- Completion tokens: ${response.usage?.completion_tokens || 'unknown'}
- Total tokens: ${response.usage?.total_tokens || 'unknown'}`);

    // Parse the response content and extract the JSON
    let jsonResult;
    try {
      if (response.choices && response.choices[0]?.message?.content) {
        const content = response.choices[0].message.content;
        jsonResult = JSON.parse(content);
      } else {
        throw new Error("Empty or invalid response from GPT-4 Vision");
      }
    } catch (jsonError) {
      console.error(`[${requestId}] Failed to parse JSON from response:`, jsonError);
      throw new Error(`Failed to parse GPT response: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }

    // Add processing metadata to the result
    return {
      ...jsonResult,
      processingTimeMs: processingTime,
      modelUsed: GPT_MODEL,
      requestId,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] GPT-4 Vision analysis failed:`, errorMessage);
    
    // Check if this is an API key or authentication issue
    if (errorMessage.includes('API key') || 
        errorMessage.includes('authentication') || 
        errorMessage.includes('401')) {
      console.error(`[${requestId}] API key authentication error detected.`);
    }
    
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generates a goal-specific prompt for better analysis quality
 */
function getGoalSpecificPrompt(healthGoal: string): string {
  // Convert goal to lowercase for matching
  const goal = healthGoal.toLowerCase();
  
  // Customize prompt based on health goal
  if (goal.includes('sleep') || goal.includes('insomnia') || goal.includes('rest')) {
    return `SLEEP GOAL FOCUS: 
When analyzing this meal, pay special attention to:
1. Tryptophan content which helps produce serotonin and melatonin
2. Magnesium and B6 which are important for sleep regulation
3. Effects of sugar, caffeine, and alcohol that may disrupt sleep
4. Timing considerations for the meal relative to bedtime
5. Foods that may cause digestive discomfort and affect sleep quality`;
  } 
  else if (goal.includes('weight') || goal.includes('fat') || goal.includes('calorie') || goal.includes('slim')) {
    return `WEIGHT MANAGEMENT FOCUS:
When analyzing this meal, emphasize:
1. Caloric density and overall calorie content
2. Protein content which increases satiety
3. Fiber content that promotes fullness
4. Added sugars that may contribute to weight gain
5. Portion sizes and nutrient density
6. Processed vs. whole food components`;
  }
  else if (goal.includes('muscle') || goal.includes('strength') || goal.includes('build') || goal.includes('protein')) {
    return `MUSCLE BUILDING FOCUS:
When analyzing this meal, prioritize:
1. Total protein content and quality of protein sources
2. Distribution of essential amino acids, especially leucine
3. Supporting nutrients like zinc and magnesium for recovery
4. Carbohydrate content for energy and glycogen replenishment
5. Overall caloric sufficiency for muscle growth`;
  }
  
  // Default comprehensive analysis for general health
  return `GENERAL HEALTH FOCUS:
When analyzing this meal, consider balanced nutrition including:
1. Macro and micronutrient balance
2. Presence of essential vitamins and minerals
3. Balance of healthy fats, complex carbohydrates, and lean proteins
4. Presence of antioxidants and phytonutrients
5. Potential inflammatory or anti-inflammatory properties`;
}

/**
 * Helper function to format health goal to a standardized display name
 */
export function formatGoalName(healthGoal: string): string {
  if (!healthGoal) return 'General Health';
  
  const goal = healthGoal.toLowerCase();
  
  if (goal.includes('weight loss') || goal.includes('lose weight')) {
    return 'Weight Loss';
  } else if (goal.includes('muscle') || goal.includes('strength')) {
    return 'Build Muscle';
  } else if (goal.includes('keto') || goal.includes('low carb')) {
    return 'Low Carb';
  } else if (goal.includes('heart') || goal.includes('blood pressure')) {
    return 'Heart Health';
  } else if (goal.includes('diabetes') || goal.includes('blood sugar')) {
    return 'Blood Sugar Management';
  } else {
    // Capitalize first letter of each word
    return healthGoal
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

/**
 * Function to convert GPT-4 Vision result to the standard AnalysisResult format
 */
export interface AnalysisResult {
  description: string;
  nutrients: Array<{
    name: string;
    value: string | number;
    unit: string;
    isHighlight: boolean;
    percentOfDailyValue?: number;
    amount?: number;
  }>;
  feedback: string[];
  suggestions: string[];
  detailedIngredients: Array<{
    name: string;
    category: string;
    confidence: number;
    confidenceEmoji?: string;
  }>;
  goalScore: {
    overall: number;
    specific: Record<string, number>;
  };
  goalName?: string;
  modelInfo?: {
    model: string;
    usedFallback: boolean;
    ocrExtracted: boolean;
    usedLabelDetection?: boolean;
    detectedLabel?: string | null;
    labelConfidence?: number;
  };
  lowConfidence?: boolean;
  fallback?: boolean;
  source?: string;
  saved?: boolean;
  savedMealId?: string;
  saveError?: string;
  rawTextResponse?: string;
  _meta?: {
    ocrText?: string;
    foodTerms?: string[];
    isNutritionLabel?: boolean;
    foodConfidence?: number;
    debugTrace?: string;
    ocrConfidence?: number;
    usedLabelDetection?: boolean;
    detectedLabel?: string | null;
    labelConfidence?: number;
  };
  no_result?: boolean;
}

export function convertVisionResultToAnalysisResult(
  visionResult: any, 
  requestId: string, 
  healthGoal: string
): AnalysisResult {
  console.log(`[${requestId}] Converting GPT-4 Vision result to AnalysisResult format`);
  
  // Extract basic nutrition values from the Vision API response
  const basicNutrition = visionResult.basicNutrition || {};
  
  // Helper function to parse a nutrition value that might be a string with units
  const parseNutritionValue = (value: string | number): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    
    // Extract the numeric portion from strings like "500 kcal" or "25g"
    const match = value.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  };
  
  // Convert nutrient values
  const nutrients = [
    { 
      name: 'Calories', 
      value: parseNutritionValue(basicNutrition.calories || '0'), 
      unit: 'kcal', 
      isHighlight: true 
    },
    { 
      name: 'Protein', 
      value: parseNutritionValue(basicNutrition.protein || '0'), 
      unit: 'g', 
      isHighlight: true 
    },
    { 
      name: 'Carbohydrates', 
      value: parseNutritionValue(basicNutrition.carbs || '0'), 
      unit: 'g', 
      isHighlight: true 
    },
    { 
      name: 'Fat', 
      value: parseNutritionValue(basicNutrition.fat || '0'), 
      unit: 'g', 
      isHighlight: true 
    }
  ];
  
  // Convert detailed ingredients adding confidence emojis
  const detailedIngredients = (visionResult.detailedIngredients || []).map((ingredient: any) => {
    // Calculate emoji based on confidence level
    let confidenceEmoji = '❓'; // Default/unknown
    const confidence = ingredient.confidence || 0;
    
    if (confidence >= 8) confidenceEmoji = '✅'; // High confidence
    else if (confidence >= 5) confidenceEmoji = '🟡'; // Medium confidence
    else confidenceEmoji = '❓'; // Low confidence
    
    return {
      name: ingredient.name,
      category: ingredient.category || 'food',
      confidence: confidence,
      confidenceEmoji
    };
  });
  
  // Combine feedback from multiple sources if available
  const combinedFeedback = [
    ...(visionResult.feedback || []),
    ...(visionResult.positiveFoodFactors || []).map((item: string) => `✅ ${item}`),
    ...(visionResult.negativeFoodFactors || []).map((item: string) => `⚠️ ${item}`)
  ];
  
  // Create the standardized analysis result
  const result: AnalysisResult = {
    description: visionResult.description || `Analysis of meal for ${formatGoalName(healthGoal)}`,
    nutrients,
    feedback: combinedFeedback,
    suggestions: visionResult.suggestions || [],
    detailedIngredients,
    goalScore: {
      overall: visionResult.goalImpactScore || 5,
      specific: {}
    },
    goalName: formatGoalName(healthGoal),
    modelInfo: {
      model: "gpt-4o",
      usedFallback: false,
      ocrExtracted: false
    },
    source: 'gpt-4o',
    _meta: {
      debugTrace: `Analyzed directly with GPT-4o Vision${visionResult.imageChallenges ? '. Image challenges: ' + visionResult.imageChallenges.join(', ') : ''}`
    }
  };
  
  return result;
} 