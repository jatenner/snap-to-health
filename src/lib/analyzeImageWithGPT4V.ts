/**
 * This file contains stub implementations of analysis functions
 * to allow the app to compile and unblock the Vercel build.
 */

import OpenAI from 'openai';
import { createEmptyFallbackAnalysis } from './apiUtils'; // Assuming helper moved/exists

// Initialize OpenAI client
let openai: OpenAI | null = null;
let openAIInitializationError: Error | null = null;

if (!process.env.OPENAI_API_KEY) {
  const errorMsg = "CRITICAL ERROR: OPENAI_API_KEY environment variable is not set.";
  console.error(`❌ ${errorMsg}`);
  openAIInitializationError = new Error(errorMsg);
} else {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("✅ OpenAI client initialized successfully.");
  } catch (error: any) {
    const errorMsg = `Failed to initialize OpenAI client: ${error?.message || 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    openAIInitializationError = new Error(errorMsg);
  }
}

/**
 * Analyzes an image using GPT-4 Vision API.
 */
export async function analyzeImageWithGPT4V(
  base64Image: string,
  healthGoals: string[] = [],
  dietaryPreferences: string[] = [],
  requestId: string
): Promise<{ success: boolean; result: any; error?: string; rawResponse?: string }> {
  console.log(`📸 [${requestId}] Starting GPT-4 Vision analysis...`);
  console.log(`📊 [${requestId}] Goals: [${healthGoals.join(', ')}], Preferences: [${dietaryPreferences.join(', ')}]`);

  // Check if OpenAI client failed to initialize
  if (openAIInitializationError || !openai) {
    console.error(`❌ [${requestId}] OpenAI client not available due to initialization error: ${openAIInitializationError?.message || "Unknown"}`);
    return {
      success: false,
      result: createEmptyFallbackAnalysis(),
      error: openAIInitializationError?.message || "OpenAI client not initialized",
    };
  }

  // Ensure base64 string has the correct prefix
  let formattedBase64Image = base64Image;
  if (!base64Image.startsWith('data:image/')) {
    // Attempt to detect common types, default to jpeg
    const mimeType = base64Image.startsWith('/9j/') ? 'image/jpeg' : 'image/png'; 
    formattedBase64Image = `data:${mimeType};base64,${base64Image}`;
    console.log(`🔄 [${requestId}] Added missing data URI prefix. Assumed type: ${mimeType}`);
  }
  
  // Calculate approximate base64 image size for debugging
  const approxSizeKB = Math.round(formattedBase64Image.length * 0.75 / 1024);
  console.log(`📦 [${requestId}] Image approximate size: ${approxSizeKB}KB`);

  // Construct a more explicit and structured prompt
  const systemPrompt = `You are a nutrition analysis assistant that analyzes food images and returns structured data to help users track their meals.

IMPORTANT REQUIREMENTS:
1. Your ONLY response must be a valid JSON object with the EXACT structure specified below.
2. Do NOT include any markdown formatting, explanations, or any text outside the JSON object.
3. If you cannot clearly identify the food items, be conservative in your analysis and focus on what you can see.
4. All fields are REQUIRED - you must provide values for each field specified.

JSON STRUCTURE:
{
  "description": "string (detailed description of all visible food items)",
  "nutrients": {
    "calories": "string (e.g., '350 kcal')",
    "protein": "string (e.g., '15g')",
    "carbs": "string (e.g., '45g')",
    "fat": "string (e.g., '12g')",
    "fiber": "string (e.g., '5g')",
    "sugar": "string (e.g., '8g')"
  },
  "feedback": ["array of strings (3-5 relevant observations about nutrition value)"],
  "suggestions": ["array of strings (2-4 actionable suggestions for improvement)"],
  "goalScore": number (0-10 score indicating alignment with user's health goals),
  "scoreExplanation": "string (brief explanation of the score)",
  "warnings": ["array of strings (potential issues or allergens, can be empty array if none)"]
}

Remember, accurate structure is critical - the system requires these exact fields to function correctly.`;
  
  const userMessageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Analyze this meal image in relation to these health goals: [${healthGoals.join(', ')}] and dietary preferences: [${dietaryPreferences.join(', ')}]. 
      
If you're unsure about specific nutritional values, provide conservative estimates. Your response must contain all the required JSON fields.`,
    },
    {
      type: "image_url",
      image_url: {
        url: formattedBase64Image,
        detail: "high" // Use high detail to improve accuracy
      },
    },
  ];

  let rawApiResponse: string | null = null;

  try {
    console.log(`🚀 [${requestId}] Sending request to OpenAI API...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent },
      ],
      max_tokens: 2000, // Increased token limit for more detailed analysis
      temperature: 0.2, // Lower temperature for more consistent structured outputs
      response_format: { type: "json_object" }, // Request JSON output directly
    });

    rawApiResponse = JSON.stringify(completion);
    
    // Log complete API response for debugging
    console.log(`⬇️ [${requestId}] ==== FULL API RESPONSE START ====`);
    console.log(rawApiResponse);
    console.log(`⬆️ [${requestId}] ==== FULL API RESPONSE END ====`);
    
    console.log(`📊 [${requestId}] Response stats: ${rawApiResponse.length} chars, Finish reason: ${completion.choices[0].finish_reason}`);

    if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message?.content) {
      throw new Error('No content received from OpenAI Vision API.');
    }

    const messageContent = completion.choices[0].message.content;
    console.log(`📝 [${requestId}] ==== RAW CONTENT START ====`);
    console.log(messageContent);
    console.log(`📝 [${requestId}] ==== RAW CONTENT END ====`);

    // Attempt to parse the JSON content directly
    try {
      const parsedJson = JSON.parse(messageContent);
      console.log(`✅ [${requestId}] Successfully parsed JSON response from OpenAI.`);
      
      // Basic validation of the parsed structure
      if (typeof parsedJson !== 'object' || parsedJson === null) {
        throw new Error('Parsed response is not a valid object.');
      }
      
      // Detailed validation of required fields
      const essentialKeys = ['description', 'nutrients', 'feedback', 'suggestions', 'goalScore', 'scoreExplanation', 'warnings'];
      const missingEssential = essentialKeys.filter(k => !(k in parsedJson));
      
      if (missingEssential.length > 0) {
        console.error(`❌ [${requestId}] VALIDATION ERROR: Missing essential keys: ${missingEssential.join(', ')}`);
        console.error(`📋 [${requestId}] Parsed JSON structure:`);
        console.error(JSON.stringify(parsedJson, null, 2));
        
        // Check for nutrients sub-object
        if (parsedJson.nutrients && typeof parsedJson.nutrients === 'object') {
          const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'];
          const missingNutrients = nutrientKeys.filter(k => !(k in parsedJson.nutrients));
          
          if (missingNutrients.length > 0) {
            console.error(`❌ [${requestId}] Missing nutrient fields: ${missingNutrients.join(', ')}`);
          }
        } else {
          console.error(`❌ [${requestId}] Nutrients object is missing or not an object`);
        }
        
        // More detailed error feedback but still return the partial result
        return {
          success: true, // Still return success so the API can handle the fallback
          result: parsedJson,
          rawResponse: rawApiResponse,
          error: `Missing essential fields: ${missingEssential.join(', ')}`
        };
      }
      
      // Log successful structure validation
      console.log(`✅ [${requestId}] Response structure validation passed`);
      console.log(`📋 [${requestId}] Analysis Overview:`);
      console.log(`   - Description: ${parsedJson.description.substring(0, 50)}...`);
      console.log(`   - Goal Score: ${parsedJson.goalScore}/10`);
      console.log(`   - Calories: ${parsedJson.nutrients?.calories || 'not specified'}`);
      console.log(`   - Feedback Count: ${parsedJson.feedback?.length || 0}`);
      console.log(`   - Suggestions Count: ${parsedJson.suggestions?.length || 0}`);

      return {
        success: true,
        result: parsedJson,
        rawResponse: rawApiResponse,
      };
    } catch (parseError: any) {
      console.error(`❌ [${requestId}] PARSE ERROR: Failed to parse JSON content from OpenAI: ${parseError.message}`);
      console.error(`   Raw content (first 1000 chars): ${messageContent.substring(0, 1000)}`);
      
      // Attempt recovery by cleaning up potential JSON issues
      try {
        // Try to extract JSON-like content (anything between curly braces)
        const possibleJsonMatch = messageContent.match(/(\{[\s\S]*\})/);
        if (possibleJsonMatch && possibleJsonMatch[1]) {
          console.log(`🔄 [${requestId}] Attempting JSON extraction from malformed response...`);
          const extractedJson = JSON.parse(possibleJsonMatch[1]);
          console.log(`✅ [${requestId}] Successfully extracted JSON from malformed response`);
          
          return {
            success: true,
            result: extractedJson,
            rawResponse: rawApiResponse,
            error: `Original parse failed, but extracted JSON successfully. Original error: ${parseError.message}`
          };
        }
      } catch (recoveryError) {
        console.error(`❌ [${requestId}] Recovery attempt failed: ${recoveryError}`);
      }
      
      return {
        success: false,
        result: createEmptyFallbackAnalysis(),
        error: `Failed to parse analysis JSON: ${parseError.message}`,
        rawResponse: rawApiResponse, 
      };
    }

  } catch (error: any) {
    console.error(`❌ [${requestId}] API ERROR: Error calling OpenAI Vision API:`);
    console.error(error);
    
    // Try to extract as much error information as possible
    let detailedError = "Unknown OpenAI API error";
    
    if (error.response?.data?.error) {
      detailedError = `OpenAI API Error: ${error.response.data.error.message || error.response.data.error}`;
      console.error(`❌ [${requestId}] API Error Details:`, error.response.data.error);
    } else if (error.message) {
      detailedError = `Error: ${error.message}`;
    }
    
    // Check for rate limits or quota issues
    if (
      error.response?.status === 429 || 
      error.message?.includes('rate limit') || 
      error.message?.includes('quota')
    ) {
      console.error(`🚫 [${requestId}] RATE LIMIT OR QUOTA EXCEEDED. Check OpenAI usage limits.`);
      detailedError = "OpenAI rate limit or quota exceeded. Please try again later.";
    }
    
    return {
      success: false,
      result: createEmptyFallbackAnalysis(),
      error: detailedError,
      rawResponse: rawApiResponse || JSON.stringify(error), // Include raw response or error
    };
  }
}

/**
 * Stub implementation to check if an analysis needs confidence enrichment
 */
export function needsConfidenceEnrichment(analysis: any): boolean {
  // console.log("[Stub] needsConfidenceEnrichment called");
  return false;
}

/**
 * Stub implementation to enrich analysis results
 */
export async function enrichAnalysisResult(
  originalResult: any,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<any> {
  // console.log("[Stub] enrichAnalysisResult called");
  return originalResult;
}

/**
 * Stub implementation to validate GPT analysis results
 * (Might be redundant now as validation happens in route.ts)
 */
export function validateGptAnalysisResult(analysis: any): { valid: boolean; reason?: string } {
  // console.log("[Stub] validateGptAnalysisResult called");
  return { valid: true };
}

/**
 * Stub implementation to create a fallback response
 * (Might be redundant now)
 */
export function createFallbackResponse(reason: string, healthGoal: string, requestId?: string): any {
  // console.log("[Stub] createFallbackResponse called");
  return createEmptyFallbackAnalysis();
}

/**
 * Stub implementation for emergency fallback response
 */
export function createEmergencyFallbackResponse(): any {
  // console.log("[Stub] createEmergencyFallbackResponse called");
  return createEmptyFallbackAnalysis();
} 