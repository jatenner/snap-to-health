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
  console.log(`[${requestId}] Starting GPT-4 Vision analysis...`);

  // Check if OpenAI client failed to initialize
  if (openAIInitializationError || !openai) {
    console.error(`[${requestId}] OpenAI client not available due to initialization error.`);
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
    console.log(`[${requestId}] Added missing data URI prefix. Assumed type: ${mimeType}`);
  }

  // Construct the prompt
  const systemPrompt = `You are a helpful nutrition assistant. Analyze the provided meal image based on the user\'s health goals and dietary preferences. Return ONLY a valid JSON object (no markdown formatting like \`\`\`json) containing the following keys: \"description\" (string, detailed description of the meal), \"nutrients\" (object, estimated nutritional values like calories, protein, carbs, fat as strings with units e.g., \"150 kcal\"), \"feedback\" (array of strings, positive/negative feedback related to goals), \"suggestions\" (array of strings, actionable suggestions), \"goalScore\" (number, 0-10 score indicating alignment with goals), \"scoreExplanation\" (string, reason for the score), \"warnings\" (array of strings, potential issues like allergens or unhealthy aspects). Be concise but informative.`;
  
  const userMessageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Analyze this meal image. User Health Goals: [${healthGoals.join(', ')}]. Dietary Preferences: [${dietaryPreferences.join(', ')}]. Provide response in JSON format as described.`,
    },
    {
      type: "image_url",
      image_url: {
        url: formattedBase64Image,
        detail: "low" // Use low detail to save costs/time initially, can be adjusted
      },
    },
  ];

  let rawApiResponse: string | null = null;

  try {
    console.log(`[${requestId}] Sending request to OpenAI API...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent },
      ],
      max_tokens: 1500, // Adjust as needed
      response_format: { type: "json_object" }, // Request JSON output directly
    });

    rawApiResponse = JSON.stringify(completion);
    console.log(`[${requestId}] Raw OpenAI Response received (length: ${rawApiResponse.length}). Choice 0 Finish Reason: ${completion.choices[0].finish_reason}`);

    if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message?.content) {
      throw new Error('No content received from OpenAI Vision API.');
    }

    const messageContent = completion.choices[0].message.content;
    console.log(`[${requestId}] OpenAI Message Content (raw): ${messageContent.substring(0, 200)}...`);

    // Attempt to parse the JSON content directly
    try {
      const parsedJson = JSON.parse(messageContent);
      console.log(`[${requestId}] Successfully parsed JSON response from OpenAI.`);
      
      // Basic validation of the parsed structure
      if (typeof parsedJson !== 'object' || parsedJson === null) {
        throw new Error('Parsed response is not a valid object.');
      }
      
      // --- Add minimal check for key fields ---
      const essentialKeys = ['description', 'nutrients', 'goalScore'];
      const missingEssential = essentialKeys.filter(k => !(k in parsedJson));
      if (missingEssential.length > 0) {
        console.warn(`[${requestId}] Parsed JSON missing essential keys: ${missingEssential.join(', ')}`);
        // Optionally enrich with fallback values for missing keys here
        // For now, we let the main route handler validate required fields
      }
      // --- End minimal check ---

      return {
        success: true,
        result: parsedJson, // Return the parsed JSON object
        rawResponse: rawApiResponse,
      };
    } catch (parseError: any) {
      console.error(`[${requestId}] Failed to parse JSON content from OpenAI: ${parseError.message}`);
      console.error(`[${requestId}] Raw content was: ${messageContent}`); // Log raw content on parse failure
      return {
        success: false,
        result: createEmptyFallbackAnalysis(),
        error: `Failed to parse analysis JSON: ${parseError.message}`,
        rawResponse: rawApiResponse, 
      };
    }

  } catch (error: any) {
    console.error(`[${requestId}] Error calling OpenAI Vision API:`, error);
    const errorMessage = error.response?.data?.error?.message || error.message || "Unknown OpenAI API error";
    return {
      success: false,
      result: createEmptyFallbackAnalysis(),
      error: errorMessage,
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