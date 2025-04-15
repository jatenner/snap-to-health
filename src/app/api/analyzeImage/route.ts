import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Trigger new Vercel deployment - 15 Apr 2025
// Request concurrency tracking
let activeRequests = 0;
const requestStartTimes = new Map<string, number>();
const MAX_CONCURRENT_REQUESTS = 10; // Limit concurrent requests for stability

// Function to extract base64 from FormData image
async function extractBase64Image(formData: FormData): Promise<string> {
  console.time('extractBase64Image');
  const file = formData.get('image') as File;
  
  if (!file) {
    console.timeEnd('extractBase64Image');
    throw new Error('No image file provided');
  }
  
  console.log('Image file details:', {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: new Date(file.lastModified).toISOString()
  });
  
  // Validate image type
  if (!file.type.startsWith('image/')) {
    console.timeEnd('extractBase64Image');
    throw new Error(`Invalid file type: ${file.type}. Only images are accepted.`);
  }
  
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    
    console.log('Successfully converted image to base64');
    console.log('Base64 length:', base64.length);
    
    if (base64.length === 0) {
      console.timeEnd('extractBase64Image');
      throw new Error('Image conversion resulted in empty base64 string');
    }
    
    console.timeEnd('extractBase64Image');
    return base64;
  } catch (error: any) {
    console.error('Error converting image to base64:', error);
    console.timeEnd('extractBase64Image');
    throw new Error(`Failed to convert image to base64: ${error.message}`);
  }
}

// Request function with retry and timeout capabilities
async function fetchWithRetryAndTimeout(url: string, options: any, retries = 2, timeout = 30000) {
  console.time('fetchWithRetryAndTimeout');
  return new Promise(async (resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      console.log(`Request to ${url} timed out after ${timeout}ms`);
      console.timeEnd('fetchWithRetryAndTimeout');
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);
    
    // Attempt fetch with retries
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        console.timeEnd('fetchWithRetryAndTimeout');
        resolve(response);
        return;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed:`, error);
        lastError = error;
        // Wait before retrying (exponential backoff)
        if (i < retries) {
          const delay = Math.min(1000 * (2 ** i), 10000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    clearTimeout(timeoutId);
    console.timeEnd('fetchWithRetryAndTimeout');
    reject(lastError || new Error('All fetch attempts failed'));
  });
}

// Function to analyze the image with GPT-4 Vision
async function analyzeWithGPT4Vision(base64Image: string, healthGoal: string, requestId: string) {
  console.time(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  console.log(`[${requestId}] Base64 image length:`, base64Image.length);
  console.log(`[${requestId}] Health goal:`, healthGoal);
  
  if (!OPENAI_API_KEY) {
    console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
    throw new Error('OpenAI API key is not configured');
  }

  // Try with primary prompt first, then fallback to simpler prompt if needed
  let attempt = 1;
  let lastError = null;

  while (attempt <= 2) {
    try {
      console.log(`[${requestId}] GPT-4 Vision attempt ${attempt} starting...`);
      
      // Create an AbortController for timeout management
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.error(`[${requestId}] OpenAI request aborted due to timeout (45s)`);
      }, 45000); // 45 second timeout (to stay within Vercel's limits)

      console.log(`[${requestId}] Sending request to OpenAI API...`);
      
      // Get goal-specific prompt
      const goalPrompt = getGoalSpecificPrompt(healthGoal);
      
      // Use more resilient prompt for low-quality images
      const primarySystemPrompt = `You are a world-class nutritionist looking at a food photo. Even if the photo is blurry, dim, or low quality, try your best to identify the meal. 

The user's specific health goal is: "${healthGoal}"

${goalPrompt}`;

      // Simpler fallback prompt for retry attempts
      const fallbackSystemPrompt = attempt === 1 ? primarySystemPrompt 
        : `You are a world-class nutritionist analyzing a food photo. The image may be unclear, but make your best estimation of what food is shown. 
        
If you can see any food at all, please identify it. If the image is completely unidentifiable, describe it as "a meal" and estimate basic nutrition values.

Even with limited visual information, provide a response that follows the JSON format.`;
      
      // Log the prompt being used
      console.log(`[${requestId}] Analyzing image with health goal: ${healthGoal}`);
      console.log(`[${requestId}] Using ${attempt === 1 ? 'primary' : 'fallback'} prompt (${fallbackSystemPrompt.length} chars)`);
      
      // Configure request headers for better performance
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'  // Use latest API features
      };
      
      // Configure request parameters for better response
      const requestPayload = {
        model: "gpt-4o",  // Using GPT-4o for faster response
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: `${fallbackSystemPrompt}

Return ONLY valid JSON that can be parsed with JSON.parse(). Use this exact format:
{
  "description": "A concise description of the meal focusing on key components",
  "ingredientList": ["ingredient1", "ingredient2", ...],
  "basicNutrition": {
    "calories": "estimated calories",
    "protein": "estimated protein in grams",
    "carbs": "estimated carbs in grams",
    "fat": "estimated fat in grams"
  },
  "goalImpactScore": 7,
  "goalName": "${formatGoalName(healthGoal)}",
  "scoreExplanation": "Clear explanation of how this meal supports or hinders the specific goal, based on scientific evidence",
  "positiveFoodFactors": [
    "Specific way ingredient X helps with the goal due to nutrient Y",
    "Specific way ingredient Z supports the goal"
  ],
  "negativeFoodFactors": [
    "Specific limitation of ingredient A for this goal",
    "How ingredient B might be suboptimal for the goal"
  ],
  "feedback": [
    "Actionable, goal-specific feedback point 1",
    "Actionable, goal-specific feedback point 2"
  ],
  "suggestions": [
    "Specific, evidence-based recommendation 1",
    "Specific, evidence-based recommendation 2"
  ]
}

IMPORTANT GUIDELINES:
1. Score must be between 1-10 (10 being the most beneficial for the goal)
2. Be specific and quantitative in your analysis - mention actual nutrients and compounds when relevant
3. Do not repeat the same information across different sections
4. Every single insight must directly relate to the user's goal of "${healthGoal}"
5. Use plain language to explain complex nutrition concepts
6. Explain WHY each factor helps or hinders the goal (e.g., "High magnesium content aids recovery by relaxing muscles and reducing inflammation")
7. Suggestions should be specific and actionable, not general tips
8. Avoid redundancy between positiveFoodFactors, negativeFoodFactors, feedback, and suggestions
9. Focus on the user's specific goal, not general healthy eating advice

Do not return any explanation or text outside the JSON block. Your entire response must be valid JSON only.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "low" // Use low detail for faster processing
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: attempt === 1 ? 0.5 : 0.7,  // Higher temperature on second attempt for more creativity
        response_format: { type: "json_object" }  // Force JSON response
      };
      
      console.log(`[${requestId}] Request URL: https://api.openai.com/v1/chat/completions`);
      console.log(`[${requestId}] Request model:`, requestPayload.model);
      
      const startTime = Date.now();
      
      try {
        // Use native fetch with the AbortController signal for timeout management
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        
        // Clear the timeout since the request completed
        clearTimeout(timeoutId);
        
        const endTime = Date.now();
        console.log(`[${requestId}] OpenAI API request completed in ${(endTime - startTime) / 1000}s`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${requestId}] OpenAI API Error Status:`, response.status);
          console.error(`[${requestId}] OpenAI API Error Response:`, errorText);
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`OpenAI API Error (attempt ${attempt}): ${response.status} ${response.statusText}`);
          attempt++;
          continue;
        }
        
        const responseData = await response.json();
        console.log(`[${requestId}] GPT-4 Vision Analysis Complete`);
        
        if (
          !responseData.choices || 
          !responseData.choices[0] || 
          !responseData.choices[0].message || 
          !responseData.choices[0].message.content
        ) {
          console.error(`[${requestId}] Invalid OpenAI response structure:`, JSON.stringify(responseData));
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`Invalid response structure from OpenAI API (attempt ${attempt})`);
          attempt++;
          continue;
        }
        
        const analysisText = responseData.choices[0].message.content;
        
        try {
          // Parse the JSON response
          const analysisJson = JSON.parse(analysisText.trim());
          console.log(`[${requestId}] Analysis JSON parsed successfully`);
          console.log(`[${requestId}] GPT-4 Vision analysis completed in ${(endTime - startTime) / 1000}s`);
          console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
          return analysisJson;
        } catch (parseError) {
          console.error(`[${requestId}] Error parsing JSON from GPT response (attempt ${attempt}):`, parseError);
          console.error(`[${requestId}] Raw response:`, analysisText);
          
          // Try to extract JSON using regex if parsing fails
          const jsonMatch = analysisText.match(/({[\s\S]*})/);
          if (jsonMatch && jsonMatch[0]) {
            try {
              const extractedJson = JSON.parse(jsonMatch[0]);
              console.log(`[${requestId}] Extracted JSON using regex on attempt ${attempt}`);
              console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
              return extractedJson;
            } catch (extractError) {
              console.error(`[${requestId}] Failed to extract JSON with regex (attempt ${attempt}):`, extractError);
            }
          }
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`Failed to parse analysis result (attempt ${attempt}): ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
          attempt++;
          continue;
        }
      } catch (fetchError: unknown) {
        // Clear the timeout in case of errors
        clearTimeout(timeoutId);
        
        // Check if this is an abort error
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`[${requestId}] OpenAI request aborted due to timeout on attempt ${attempt}`);
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`OpenAI request timed out after 45 seconds (attempt ${attempt})`);
          attempt++;
          continue;
        }
        
        // Other fetch errors
        console.error(`[${requestId}] Error fetching from OpenAI API (attempt ${attempt}):`, fetchError);
        
        // Store this error but try again if it's our first attempt
        lastError = fetchError instanceof Error 
          ? new Error(`Fetch error on attempt ${attempt}: ${fetchError.message}`) 
          : new Error(`Unknown fetch error occurred on attempt ${attempt}`);
        attempt++;
        continue;
      }
    } catch (error) {
      console.error(`[${requestId}] Error analyzing image with GPT-4 Vision (attempt ${attempt}):`, error);
      
      // Store this error but try again if it's our first attempt
      lastError = error instanceof Error 
        ? new Error(`Error on attempt ${attempt}: ${error.message}`) 
        : new Error(`Unknown error on attempt ${attempt}`);
      attempt++;
      continue;
    }
  }
  
  // If we've reached here, all attempts failed
  console.error(`[${requestId}] All GPT-4 Vision attempts failed. Last error:`, lastError);
  console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
  
  // Throw the last error we encountered
  throw lastError || new Error('Failed to analyze image after multiple attempts');
}

// Helper function to get goal-specific prompts
function getGoalSpecificPrompt(healthGoal: string): string {
  // Normalize the goal text for comparison
  const normalizedGoal = healthGoal.toLowerCase().trim();
  
  // Create a base template that works for any goal
  const basePrompt = `For the specific health goal of "${healthGoal}", analyze this meal for:

1. NUTRIENTS RELEVANT TO THIS GOAL:
   - Identify key nutrients, compounds, and bioactive components that specifically support this goal
   - Note any nutrient deficiencies or excesses that may impact this goal

2. TIMING AND PORTION FACTORS:
   - Consider meal timing in relation to the goal (pre/post-workout, morning energy, evening recovery, etc.)
   - Assess portion sizes and macronutrient ratios as they relate to the stated goal

3. SCIENTIFIC CONTEXT:
   - Reference relevant nutritional science and research findings when explaining benefits or concerns
   - Consider biological mechanisms that connect the meal composition to the specific goal

4. PRACTICAL IMPACT:
   - Evaluate how this exact meal composition supports or hinders the specific goal
   - Suggest research-backed modifications tailored to better support the goal

When scoring this meal (1-10 scale), consider:
- 8-10: Excellent support with multiple evidence-based components that directly aid this goal
- 5-7: Moderate support with some beneficial elements but evidence-based room for improvement
- 1-4: Limited support or contains elements that may work against this specific goal based on research`;

  // Goal-specific additional analysis prompts
  if (normalizedGoal.includes('sleep') || normalizedGoal.includes('insomnia') || normalizedGoal.includes('rest')) {
    return `${basePrompt}

SLEEP-SPECIFIC ANALYSIS:
- Evaluate tryptophan content (precursor to serotonin and melatonin)
- Check for magnesium, potassium, and calcium (muscle relaxation and nervous system regulation)
- Assess vitamin B6 levels (helps convert tryptophan to serotonin)
- Look for natural sources of melatonin (cherries, nuts)
- Identify sleep disruptors: caffeine, alcohol, tyramine, high-sugar, highly processed foods
- Note if meal is too heavy/large for evening consumption (digestive burden)
- Reference timing considerations (ideally 2-3 hours before sleep)

Particularly note the glycemic index/load as blood sugar spikes can disrupt sleep architecture and increase nocturnal awakenings.`;
  } 
  else if (normalizedGoal.includes('weight') || normalizedGoal.includes('fat loss') || normalizedGoal.includes('lean') || normalizedGoal.includes('slim')) {
    return `${basePrompt}

WEIGHT MANAGEMENT-SPECIFIC ANALYSIS:
- Assess protein adequacy (research suggests 25-30g per meal for satiety and thermogenesis)
- Evaluate fiber content (targeting 7-10g per meal for satiety and digestive health)
- Calculate approximate caloric density and portion appropriateness
- Examine added sugar content and refined carbohydrate presence (insulin response)
- Check for healthy fats that promote satiety without excessive calories
- Identify compounds that support metabolic rate (e.g., capsaicin, catechins)
- Note water content of foods (hydration and fullness)

Reference protein leverage hypothesis (prioritizing protein can reduce overall caloric intake) and the satiety index of included foods.`;
  }
  else if (normalizedGoal.includes('muscle') || normalizedGoal.includes('strength') || normalizedGoal.includes('bulk') || normalizedGoal.includes('gain mass')) {
    return `${basePrompt}

MUSCLE BUILDING-SPECIFIC ANALYSIS:
- Calculate complete protein content (aiming for 20-40g with essential amino acids)
- Assess leucine content specifically (2-3g threshold for maximal muscle protein synthesis)
- Evaluate carbohydrate adequacy for glycogen replenishment and anabolic signaling
- Check for anti-inflammatory compounds that support recovery
- Identify micronutrients crucial for muscle growth (zinc, magnesium, vitamin D)
- Note creatine sources if present (primarily in meat)
- Assess overall caloric adequacy for tissue building (slight surplus needed)

Reference protein timing (anabolic window), leucine threshold for MPS activation, and mTOR pathway support from various nutrients.`;
  }
  else if (normalizedGoal.includes('energy') || normalizedGoal.includes('fatigue') || normalizedGoal.includes('alertness') || normalizedGoal.includes('focus') || normalizedGoal.includes('productivity')) {
    return `${basePrompt}

ENERGY-SPECIFIC ANALYSIS:
- Evaluate complex carbohydrate content for sustained glucose release
- Assess B-vitamin content (B1, B2, B3, B5, B6, B12) for energy metabolism
- Check iron content and sources (heme vs. non-heme) for oxygen transport
- Note presence of natural stimulants (caffeine, theobromine, etc.)
- Identify potential blood sugar stabilizers (fiber, protein, healthy fats)
- Examine hydration factors (dehydration is a major energy depleter)
- Check for CoQ10, L-carnitine, and other mitochondrial support nutrients

Reference glycemic load impact on energy curves, steady vs. spiking blood glucose patterns, and the role of proper mitochondrial function in sustained energy production.`;
  }
  else if (normalizedGoal.includes('heart') || normalizedGoal.includes('cardiac') || normalizedGoal.includes('blood pressure') || normalizedGoal.includes('cholesterol')) {
    return `${basePrompt}

CARDIOVASCULAR HEALTH-SPECIFIC ANALYSIS:
- Assess omega-3 fatty acid content (EPA/DHA primarily) for anti-inflammatory effects
- Evaluate fiber profile, especially soluble fiber for cholesterol management
- Check sodium-to-potassium ratio (ideally lower sodium, higher potassium)
- Identify polyphenols, flavonoids, and antioxidants that support endothelial function
- Note plant sterols/stanols that can reduce cholesterol absorption
- Examine magnesium and calcium levels for vascular health and blood pressure
- Check for L-arginine sources that support nitric oxide production

Reference DASH and Mediterranean dietary patterns, research on nitric oxide production, and the impact of specific fatty acid profiles on cardiovascular markers.`;
  }
  else if (normalizedGoal.includes('recovery') || normalizedGoal.includes('inflammation') || normalizedGoal.includes('pain') || normalizedGoal.includes('injury') || normalizedGoal.includes('healing')) {
    return `${basePrompt}

RECOVERY-SPECIFIC ANALYSIS:
- Evaluate anti-inflammatory compounds (omega-3s, turmeric/curcumin, ginger)
- Assess antioxidant content (vitamin C, E, selenium, flavonoids, anthocyanins)
- Check for collagen-supporting nutrients (vitamin C, copper, glycine sources)
- Note protein adequacy and quality for tissue repair (complete amino acid profile)
- Identify compounds that modulate inflammatory pathways (resveratrol, quercetin)
- Check for prebiotics/probiotics that support gut health (systemic inflammation reducer)
- Examine electrolyte profile for hydration optimization

Reference the resolution phase of inflammation, research on cytokine modulation by nutrients, and antioxidant capacity measured by ORAC values.`;
  }
  else if (normalizedGoal.includes('immune') || normalizedGoal.includes('sick') || normalizedGoal.includes('cold') || normalizedGoal.includes('flu') || normalizedGoal.includes('infection')) {
    return `${basePrompt}

IMMUNE SUPPORT-SPECIFIC ANALYSIS:
- Assess vitamin C content (neutrophil function, antioxidant protection)
- Evaluate zinc levels (T-cell production, thymus function)
- Check for vitamin D content (critical immune modulator)
- Identify prebiotic and probiotic content (gut-immune axis support)
- Note selenium and vitamin E levels (antioxidant defense system)
- Check for immune-supporting herbs/spices (elderberry, garlic, oregano, etc.)
- Examine protein adequacy (crucial for antibody production)

Reference the impact on innate vs. adaptive immunity, immunomodulatory effects of various nutrients, and research on gut microbiome diversity for immune resilience.`;
  }
  else if (normalizedGoal.includes('digestion') || normalizedGoal.includes('gut') || normalizedGoal.includes('stomach') || normalizedGoal.includes('ibs') || normalizedGoal.includes('bloat')) {
    return `${basePrompt}

DIGESTIVE HEALTH-SPECIFIC ANALYSIS:
- Evaluate prebiotic fiber sources (diversity and quantity)
- Assess probiotic content (fermented foods, live cultures)
- Check for common digestive irritants (excessive FODMAPs, gluten if sensitive)
- Identify anti-inflammatory components for gut lining support
- Note presence of digestive enzymes or enzyme-supporting foods
- Examine hydration factors and fluid content
- Check for polyphenols that support microbiome diversity

Reference research on short-chain fatty acid production, microbiome diversity impacts, and the enteric nervous system response to various food compounds.`;
  }
  else if (normalizedGoal.includes('brain') || normalizedGoal.includes('cognitive') || normalizedGoal.includes('memory') || normalizedGoal.includes('mental')) {
    return `${basePrompt}

COGNITIVE FUNCTION-SPECIFIC ANALYSIS:
- Assess omega-3 fatty acid content, especially DHA for brain cell structure
- Evaluate antioxidant profile for neuronal protection
- Check for choline content (acetylcholine precursor) for memory and learning
- Identify flavonoids that promote neuroplasticity and cerebral blood flow
- Note presence of vitamin E, B vitamins (especially B12, folate) for cognitive support
- Check for compounds that cross the blood-brain barrier (curcumin, resveratrol)
- Examine glucose availability for brain energy

Reference research on BDNF (brain-derived neurotrophic factor) production, neuroinflammation pathways, and the gut-brain axis connections.`;
  }
  else if (normalizedGoal.includes('run') || normalizedGoal.includes('marathon') || normalizedGoal.includes('workout') || normalizedGoal.includes('training') || normalizedGoal.includes('endurance') || normalizedGoal.includes('exercise') || normalizedGoal.includes('gym')) {
    return `${basePrompt}

ATHLETIC PERFORMANCE-SPECIFIC ANALYSIS:
- Evaluate carbohydrate content and type for glycogen replenishment
- Assess protein quality and quantity for recovery and adaptation
- Check electrolyte balance (sodium, potassium, magnesium) for hydration
- Identify anti-inflammatory compounds that may aid recovery
- Note nitrate content (beets, leafy greens) for potential performance benefits
- Check antioxidant balance (moderate amounts support recovery)
- Examine timing in relation to training (pre, during, post-workout considerations)

Reference research on glycogen supercompensation, protein timing for recovery, nitric oxide production for blood flow, and exercise-induced inflammation management.`;
  }
  else {
    // Return the enhanced base prompt for any other goal type
    return basePrompt;
  }
}

// Function to get nutrition data from Nutritionix API
async function getNutritionData(ingredients: string[]): Promise<Array<{
  ingredient: string;
  data: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    potassium: number;
    magnesium: number;
    calcium: number;
    iron: number;
  };
}>> {
  console.time('getNutritionData');
  // In a production app, you would keep these keys in environment variables
  const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID;
  const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY;
  
  console.log('Nutritionix API credentials available:', !!NUTRITIONIX_APP_ID && !!NUTRITIONIX_API_KEY);
  
  if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_API_KEY) {
    console.timeEnd('getNutritionData');
    throw new Error('Nutritionix API credentials are not configured');
  }

  try {
    const nutritionData: Array<{
      ingredient: string;
      data: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
        sugar: number;
        sodium: number;
        potassium: number;
        magnesium: number;
        calcium: number;
        iron: number;
      };
    }> = [];
    
    // Create a global timeout for all Nutritionix API calls
    const globalTimeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => {
        console.warn('Nutritionix API global timeout reached after 10 seconds');
        reject(new Error('Nutritionix API global timeout after 10 seconds'));
      }, 10000); // 10 second global timeout
    });
    
    // Use Promise.allSettled with timeout to fetch all ingredients
    const nutritionPromises = ingredients.map(async (ingredient) => {
      console.log(`Fetching nutrition data for: ${ingredient}`);
      
      try {
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per ingredient
        
        const response = await axios.post(
          'https://trackapi.nutritionix.com/v2/natural/nutrients',
          {
            query: ingredient,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-app-id': NUTRITIONIX_APP_ID,
              'x-app-key': NUTRITIONIX_API_KEY,
            },
            signal: controller.signal,
            timeout: 5000, // Also set axios timeout
          }
        );
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        console.log(`Received nutrition data for: ${ingredient}`);
        
        if (response.data.foods && response.data.foods.length > 0) {
          const food = response.data.foods[0];
          return {
            ingredient,
            data: {
              calories: food.nf_calories,
              protein: food.nf_protein,
              carbs: food.nf_total_carbohydrate,
              fat: food.nf_total_fat,
              fiber: food.nf_dietary_fiber,
              sugar: food.nf_sugars,
              sodium: food.nf_sodium,
              potassium: food.nf_potassium,
              magnesium: food.full_nutrients.find((n: any) => n.attr_id === 304)?.value || 0,
              calcium: food.full_nutrients.find((n: any) => n.attr_id === 301)?.value || 0,
              iron: food.full_nutrients.find((n: any) => n.attr_id === 303)?.value || 0,
            },
          };
        }
        return null;
      } catch (err: any) {
        // If this individual ingredient lookup fails, don't fail the whole process
        console.error(`Error fetching nutrition for "${ingredient}":`, err.message);
        return null;
      }
    });
    
    // Use Promise.race to handle the global timeout
    try {
      const results = await Promise.race([
        Promise.allSettled(nutritionPromises),
        globalTimeoutPromise.then(() => {
          throw new Error('Nutritionix API calls timed out after 10 seconds');
        })
      ]) as PromiseSettledResult<any>[];
      
      // Process the results, including any that were fulfilled
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          nutritionData.push(result.value);
        }
      });
      
      console.log(`Successfully processed ${nutritionData.length} out of ${ingredients.length} ingredients`);
    } catch (timeoutError) {
      console.warn('Nutrition data collection timed out, proceeding with partial data:', timeoutError);
      // We'll continue with whatever nutrition data we've collected so far
    }
    
    console.timeEnd('getNutritionData');
    return nutritionData;
  } catch (error) {
    console.error('Error fetching nutrition data from Nutritionix:', error);
    console.timeEnd('getNutritionData');
    // Return empty array instead of failing the whole process
    return [];
  }
}

// Function to format the response
function formatResponse(
  gptAnalysis: any,
  nutritionData: any[],
  healthGoal: string
): {
  description: string;
  nutrients: any[];
  feedback: string[];
  suggestions: string[];
  goalScore?: number;
  goalName: string;
  scoreExplanation?: string;
  positiveFoodFactors?: string[];
  negativeFoodFactors?: string[];
  rawGoal: string;
  // Add new properties to match what we're setting in the POST handler
  status?: string;
  success?: boolean;
  fallback?: boolean;
  message?: string;
  _meta?: any;
} {
  // Extend the supportive nutrients map with more detailed, goal-specific nutrients
  const nutrientSupportMap: Record<string, string[]> = {
    'Sleep': ['magnesium', 'calcium', 'potassium', 'tryptophan', 'vitamin b6', 'melatonin', 'fiber'],
    'Weight Management': ['protein', 'fiber', 'water', 'chromium', 'green tea', 'caffeine'],
    'Muscle Building': ['protein', 'leucine', 'calcium', 'creatine', 'vitamin d', 'zinc', 'magnesium'],
    'Energy': ['b vitamins', 'iron', 'magnesium', 'carbohydrate', 'copper', 'vitamin c'],
    'Heart Health': ['potassium', 'magnesium', 'omega-3', 'fiber', 'antioxidant', 'vitamin e', 'vitamin d'],
    'Recovery': ['protein', 'antioxidant', 'omega-3', 'turmeric', 'vitamin c', 'vitamin e', 'zinc', 'magnesium'],
    'Immune': ['vitamin c', 'vitamin d', 'zinc', 'selenium', 'probiotics', 'vitamin a'],
    'Performance': ['carbohydrate', 'protein', 'electrolytes', 'iron', 'creatine', 'beta-alanine', 'nitrates'],
    'Post Run Recovery': ['protein', 'carbohydrate', 'potassium', 'magnesium', 'antioxidants', 'electrolytes', 'fluids', 'tart cherry'],
    'Digestion': ['fiber', 'probiotics', 'water', 'ginger', 'papaya', 'mint', 'cinnamon'],
    'Cognitive Function': ['omega-3', 'antioxidant', 'vitamin e', 'flavonoids', 'vitamin b12', 'folate', 'choline']
  };

  // Define negative nutrients for specific goals
  const negativeNutrientMap: Record<string, string[]> = {
    'Sleep': ['caffeine', 'alcohol', 'sugar', 'fat', 'spice', 'tyramine'],
    'Weight Management': ['added sugar', 'refined carbs', 'trans fat', 'saturated fat', 'artificial sweeteners'],
    'Muscle Building': ['alcohol', 'excess fiber', 'food allergens'],
    'Energy': ['simple sugar', 'alcohol', 'high fat', 'artificial additives'],
    'Heart Health': ['sodium', 'trans fat', 'saturated fat', 'cholesterol', 'added sugar'],
    'Recovery': ['alcohol', 'processed food', 'sugar', 'omega-6', 'trans fat'],
    'Immune': ['alcohol', 'added sugar', 'processed foods', 'artificial additives'],
    'Performance': ['high fat', 'high fiber', 'alcohol', 'caffeine'],
    'Post Run Recovery': ['alcohol', 'excess caffeine', 'high fat', 'low carb', 'dehydrating foods'],
    'Digestion': ['fried foods', 'processed meat', 'alcohol', 'artificial additives', 'excess fat'],
    'Cognitive Function': ['trans fat', 'excess saturated fat', 'refined sugar', 'alcohol', 'artificial additives']
  };
  
  // Use a more nuanced approach for determining goal type
  const goalType = getGoalCategoryType(healthGoal);
  
  // Get the appropriate beneficial and negative nutrients lists, with fallback to a general health list
  const supportiveNutrientList = nutrientSupportMap[goalType] || [
    'protein', 'fiber', 'vitamin', 'mineral', 'antioxidant', 'omega-3', 'polyphenol', 'water'
  ];
  
  const harmfulNutrients = negativeNutrientMap[goalType] || [
    'added sugar', 'trans fat', 'saturated fat', 'excess sodium', 'artificial', 'processed'
  ];
  
  // Ensure we have basic nutrition values, even if estimated
  const basicNutrition = gptAnalysis.basicNutrition || {
    calories: "300-400",
    protein: "15-20",
    carbs: "30-40",
    fat: "10-15"
  };
  
  // Prepare the nutrients array with smarter highlighting based on the goal
  const nutrients = [
    {
      name: 'Calories',
      value: basicNutrition.calories,
      unit: 'kcal',
      isHighlight: goalType === 'Weight Management' || goalType === 'Muscle Building',
    },
    {
      name: 'Protein',
      value: basicNutrition.protein,
      unit: 'g',
      isHighlight: goalType === 'Muscle Building' || goalType === 'Recovery' || goalType === 'Athletic Performance' || goalType === 'Weight Management',
    },
    {
      name: 'Carbs',
      value: basicNutrition.carbs,
      unit: 'g',
      isHighlight: goalType === 'Energy' || goalType === 'Athletic Performance',
    },
    {
      name: 'Fat',
      value: basicNutrition.fat,
      unit: 'g',
      isHighlight: goalType === 'Heart Health' || goalType === 'Cognitive Function',
    },
  ];
  
  // Add detailed nutrient data from Nutritionix with smarter context awareness
  if (nutritionData.length > 0) {
    // First, collect all nutrients from all ingredients
    const aggregatedNutrients: {[key: string]: {value: number, unit: string}} = {};
    
    nutritionData.forEach(item => {
      const data = item.data;
      
      // List of common nutrients with their units
      const micronutrients = [
        { name: 'Magnesium', value: data.magnesium, unit: 'mg' },
        { name: 'Potassium', value: data.potassium, unit: 'mg' },
        { name: 'Calcium', value: data.calcium, unit: 'mg' },
        { name: 'Fiber', value: data.fiber, unit: 'g' },
        { name: 'Sugar', value: data.sugar, unit: 'g' },
        { name: 'Sodium', value: data.sodium, unit: 'mg' },
        { name: 'Iron', value: data.iron, unit: 'mg' },
        { name: 'Zinc', value: data.zinc || 0, unit: 'mg' },
        { name: 'Vitamin C', value: data.vitamin_c || 0, unit: 'mg' },
        { name: 'Vitamin D', value: data.vitamin_d || 0, unit: 'µg' },
        { name: 'Vitamin E', value: data.vitamin_e || 0, unit: 'mg' },
        { name: 'Vitamin B6', value: data.vitamin_b6 || 0, unit: 'mg' },
        { name: 'Vitamin B12', value: data.vitamin_b12 || 0, unit: 'µg' },
        { name: 'Folate', value: data.folate || 0, unit: 'µg' },
        { name: 'Selenium', value: data.selenium || 0, unit: 'µg' },
        { name: 'Omega-3', value: data.omega_3 || 0, unit: 'g' }
      ];
      
      // Aggregate values across all ingredients
      micronutrients.forEach(nutrient => {
        if (nutrient.value > 0) {
          if (!aggregatedNutrients[nutrient.name]) {
            aggregatedNutrients[nutrient.name] = { value: 0, unit: nutrient.unit };
          }
          aggregatedNutrients[nutrient.name].value += nutrient.value;
        }
      });
    });
    
    // Then add the aggregated nutrients to the final nutrients array
    Object.entries(aggregatedNutrients).forEach(([name, data]) => {
      const lowerName = name.toLowerCase();
      
      // Determine if this nutrient is supportive or negative for the user's goal
      const isHighlight = supportiveNutrientList.some(supportive => 
        lowerName.includes(supportive.toLowerCase()) || supportive.includes(lowerName)
      );
      
      const isNegative = harmfulNutrients.some(negative => 
        lowerName.includes(negative.toLowerCase()) || negative.includes(lowerName)
      );
      
      // Add to the nutrients array
      nutrients.push({
        name,
        value: data.value.toFixed(1),
        unit: data.unit,
        isHighlight: isHighlight && !isNegative,
      });
    });
  }
  
  // Use the goalImpactScore provided by GPT, or calculate a scientifically informed score
  let goalScore = gptAnalysis.goalImpactScore || 0;
  let scoreExplanation = gptAnalysis.scoreExplanation || '';
  let positiveFoodFactors = gptAnalysis.positiveFoodFactors || [];
  let negativeFoodFactors = gptAnalysis.negativeFoodFactors || [];
  
  // If GPT didn't provide a goal score or it's outside the valid range, calculate a fallback score
  if (!goalScore || goalScore < 1 || goalScore > 10) {
    // Calculate a score based on the goal with more nuanced logic
    let calculatedScore = 5; // Start with a neutral score
    
    // Count the number of supportive and negative nutrients present
    let supportiveCount = 0;
    let negativeCount = 0;
    
    nutrients.forEach(nutrient => {
      const name = nutrient.name.toLowerCase();
      
      // Check for supportive nutrients
      if (supportiveNutrientList.some(supportive => 
        name.includes(supportive.toLowerCase()) || supportive.includes(name)
      )) {
        supportiveCount++;
        calculatedScore += 0.5; // Add half a point for each supportive nutrient
      }
      
      // Check for negative nutrients
      if (harmfulNutrients.some(negative => 
        name.includes(negative.toLowerCase()) || negative.includes(name)
      )) {
        negativeCount++;
        calculatedScore -= 0.75; // Subtract points for negative nutrients
      }
    });
    
    // Add bonus points for balanced meals with multiple supportive nutrients
    if (supportiveCount >= 3) {
      calculatedScore += 1;
    }
    
    // Add goal-specific bonus points
    if (goalType === 'Muscle Building' && parseFloat(basicNutrition.protein) >= 20) {
      calculatedScore += 1; // Bonus for high protein for muscle building
    }
    
    if (goalType === 'Weight Management' && nutrients.some(n => n.name.toLowerCase() === 'fiber' && parseFloat(n.value) >= 5)) {
      calculatedScore += 1; // Bonus for high fiber for weight management
    }
    
    if (goalType === 'Heart Health' && nutrients.some(n => n.name.toLowerCase() === 'omega-3')) {
      calculatedScore += 1; // Bonus for omega-3 for heart health
    }
    
    // Ensure score is between 1 and 10
    goalScore = Math.max(1, Math.min(10, Math.round(calculatedScore)));
    
    // Generate a research-informed explanation if none exists
    if (!scoreExplanation) {
      if (goalScore >= 8) {
        scoreExplanation = `This meal provides excellent nutritional support for your ${healthGoal} goal with multiple research-backed components.`;
      } else if (goalScore >= 5) {
        scoreExplanation = `This meal provides moderate support for your ${healthGoal} goal, though some evidence-based adjustments could enhance benefits.`;
      } else {
        scoreExplanation = `This meal may not be optimal for your ${healthGoal} goal based on current nutritional research.`;
      }
    }
    
    // Generate smart positive/negative factors if not provided by GPT
    if (positiveFoodFactors.length === 0) {
      // Generate positive factors based on ingredients and the goal type
      if (gptAnalysis.ingredientList) {
        const ingredients: string[] = Array.isArray(gptAnalysis.ingredientList) 
          ? gptAnalysis.ingredientList 
          : typeof gptAnalysis.ingredientList === 'string'
            ? gptAnalysis.ingredientList.split(',').map((item: string) => item.trim())
            : [];
            
        // Generate goal-specific positive factors
        positiveFoodFactors = generatePositiveFactors(ingredients, goalType, nutrients);
      }
    }
    
    if (negativeFoodFactors.length === 0) {
      // Generate negative factors based on ingredients and the goal type
      if (gptAnalysis.ingredientList) {
        const ingredients: string[] = Array.isArray(gptAnalysis.ingredientList) 
          ? gptAnalysis.ingredientList 
          : typeof gptAnalysis.ingredientList === 'string'
            ? gptAnalysis.ingredientList.split(',').map((item: string) => item.trim())
            : [];
            
        // Generate goal-specific negative factors
        negativeFoodFactors = generateNegativeFactors(ingredients, goalType, nutrients);
      }
    }
  }
  
  // Format the goal name for display
  const goalName = formatGoalName(healthGoal);
  
  // Now return the object with all properties
  return {
    description: gptAnalysis.description || 'A meal containing various ingredients and nutrients.',
    nutrients,
    feedback: gptAnalysis.feedback || ['Try to eat a balanced meal with protein, healthy fats, and complex carbohydrates.'],
    suggestions: gptAnalysis.suggestions || ['Consider adding more vegetables to your next meal.'],
    goalScore,
    goalName: formatGoalName(healthGoal),
    scoreExplanation,
    positiveFoodFactors,
    negativeFoodFactors,
    rawGoal: healthGoal,
    status: 'success',
    success: true,
    fallback: false,
    message: '',
    _meta: undefined
  };
}

// Helper function to generate positive factors based on ingredients and goal type
function generatePositiveFactors(ingredients: string[], goalType: string, nutrients: any[]): string[] {
  const positiveFactors: string[] = [];
  
  // Goal-specific ingredient analysis
  switch (goalType) {
    case 'Sleep':
      if (ingredients.some(i => i.toLowerCase().includes('milk') || i.toLowerCase().includes('dairy'))) {
        positiveFactors.push('Contains dairy with tryptophan and calcium that support melatonin production');
      }
      if (ingredients.some(i => i.toLowerCase().includes('cherry') || i.toLowerCase().includes('kiwi') || i.toLowerCase().includes('banana'))) {
        positiveFactors.push('Contains natural sources of melatonin and sleep-promoting compounds');
      }
      if (ingredients.some(i => i.toLowerCase().includes('turkey') || i.toLowerCase().includes('chicken') || i.toLowerCase().includes('nuts'))) {
        positiveFactors.push('Contains tryptophan-rich foods that support serotonin production');
      }
      break;
      
    case 'Muscle Building':
      if (ingredients.some(i => 
        i.toLowerCase().includes('chicken') || 
        i.toLowerCase().includes('beef') || 
        i.toLowerCase().includes('fish') || 
        i.toLowerCase().includes('egg') || 
        i.toLowerCase().includes('greek yogurt')
      )) {
        positiveFactors.push('Contains complete proteins with essential amino acids for muscle synthesis');
      }
      if (ingredients.some(i => i.toLowerCase().includes('rice') || i.toLowerCase().includes('potato') || i.toLowerCase().includes('pasta'))) {
        positiveFactors.push('Contains complex carbohydrates for glycogen replenishment and recovery');
      }
      if (nutrients.some(n => n.name.toLowerCase() === 'zinc' || n.name.toLowerCase() === 'magnesium')) {
        positiveFactors.push('Contains minerals essential for testosterone production and muscle function');
      }
      break;
      
    case 'Energy':
      if (ingredients.some(i => i.toLowerCase().includes('oats') || i.toLowerCase().includes('brown rice') || i.toLowerCase().includes('quinoa'))) {
        positiveFactors.push('Contains slow-releasing complex carbs for sustained energy');
      }
      if (ingredients.some(i => i.toLowerCase().includes('spinach') || i.toLowerCase().includes('leafy green') || i.toLowerCase().includes('red meat'))) {
        positiveFactors.push('Contains iron-rich foods that support oxygen transport and energy production');
      }
      if (nutrients.some(n => n.name.toLowerCase().includes('b vitamin'))) {
        positiveFactors.push('Contains B vitamins that support energy metabolism and cell function');
      }
      break;
      
    case 'Heart Health':
      if (ingredients.some(i => i.toLowerCase().includes('salmon') || i.toLowerCase().includes('fish') || i.toLowerCase().includes('flax') || i.toLowerCase().includes('chia'))) {
        positiveFactors.push('Contains omega-3 fatty acids that support cardiovascular health');
      }
      if (ingredients.some(i => i.toLowerCase().includes('berry') || i.toLowerCase().includes('colorful vegetable') || i.toLowerCase().includes('fruit'))) {
        positiveFactors.push('Contains antioxidants and polyphenols that support heart health');
      }
      if (ingredients.some(i => i.toLowerCase().includes('bean') || i.toLowerCase().includes('lentil') || i.toLowerCase().includes('oat'))) {
        positiveFactors.push('Contains soluble fiber that helps manage cholesterol levels');
      }
      break;
      
    case 'Recovery':
      if (ingredients.some(i => i.toLowerCase().includes('berry') || i.toLowerCase().includes('cherry') || i.toLowerCase().includes('pineapple'))) {
        positiveFactors.push('Contains anti-inflammatory compounds and antioxidants that reduce muscle soreness');
      }
      if (ingredients.some(i => i.toLowerCase().includes('salmon') || i.toLowerCase().includes('tuna') || i.toLowerCase().includes('olive oil'))) {
        positiveFactors.push('Contains omega-3 and healthy fats that reduce inflammation');
      }
      if (ingredients.some(i => i.toLowerCase().includes('turmeric') || i.toLowerCase().includes('ginger'))) {
        positiveFactors.push('Contains natural anti-inflammatory compounds that support recovery');
      }
      break;
      
    case 'Athletic Performance':
      if (ingredients.some(i => i.toLowerCase().includes('beet') || i.toLowerCase().includes('leafy green'))) {
        positiveFactors.push('Contains nitrates that may improve blood flow and exercise performance');
      }
      if (ingredients.some(i => i.toLowerCase().includes('banana') || i.toLowerCase().includes('sweet potato') || i.toLowerCase().includes('whole grain'))) {
        positiveFactors.push('Contains ideal carbohydrates for pre-workout energy and glycogen storage');
      }
      if (ingredients.some(i => i.toLowerCase().includes('greek yogurt') || i.toLowerCase().includes('cottage cheese') || i.toLowerCase().includes('chicken'))) {
        positiveFactors.push('Contains high-quality protein for muscle recovery and adaptation');
      }
      break;
      
    default:
      // Generic positive factors for any health goal
      if (ingredients.some(i => 
        i.toLowerCase().includes('vegetable') || 
        i.toLowerCase().includes('broccoli') || 
        i.toLowerCase().includes('spinach') || 
        i.toLowerCase().includes('kale')
      )) {
        positiveFactors.push('Contains nutrient-dense vegetables with vitamins, minerals, and antioxidants');
      }
      if (ingredients.some(i => i.toLowerCase().includes('protein') || i.toLowerCase().includes('chicken') || i.toLowerCase().includes('fish'))) {
        positiveFactors.push('Contains quality protein for tissue maintenance and satiety');
      }
      if (ingredients.some(i => i.toLowerCase().includes('whole grain') || i.toLowerCase().includes('brown rice') || i.toLowerCase().includes('quinoa'))) {
        positiveFactors.push('Contains complex carbohydrates for sustained energy release');
      }
  }
  
  // Add at least one generic positive factor if none were generated
  if (positiveFactors.length === 0) {
    positiveFactors.push('Contains nutrients that contribute to overall health and wellbeing');
  }
  
  return positiveFactors;
}

// Helper function to generate negative factors based on ingredients and goal type
function generateNegativeFactors(ingredients: string[], goalType: string, nutrients: any[]): string[] {
  const negativeFactors: string[] = [];
  
  // Goal-specific ingredient analysis for negative factors
  switch (goalType) {
    case 'Sleep':
      if (ingredients.some(i => i.toLowerCase().includes('coffee') || i.toLowerCase().includes('chocolate') || i.toLowerCase().includes('tea'))) {
        negativeFactors.push('Contains caffeine which may disrupt sleep by blocking adenosine receptors');
      }
      if (ingredients.some(i => i.toLowerCase().includes('sugar') || i.toLowerCase().includes('dessert') || i.toLowerCase().includes('candy'))) {
        negativeFactors.push('Contains added sugars which may cause blood sugar fluctuations during sleep');
      }
      if (ingredients.some(i => i.toLowerCase().includes('spicy') || i.toLowerCase().includes('hot sauce') || i.toLowerCase().includes('chili'))) {
        negativeFactors.push('Contains spicy elements that may cause digestive discomfort and disrupt sleep');
      }
      break;
      
    case 'Weight Management':
      if (ingredients.some(i => i.toLowerCase().includes('sugar') || i.toLowerCase().includes('syrup') || i.toLowerCase().includes('sweet'))) {
        negativeFactors.push('Contains added sugars which may contribute to caloric surplus and insulin resistance');
      }
      if (ingredients.some(i => i.toLowerCase().includes('fried') || i.toLowerCase().includes('oil') || i.toLowerCase().includes('creamy'))) {
        negativeFactors.push('Contains high caloric density from oils/fats that may exceed energy needs');
      }
      if (ingredients.some(i => i.toLowerCase().includes('refined') || i.toLowerCase().includes('white bread') || i.toLowerCase().includes('processed'))) {
        negativeFactors.push('Contains refined carbohydrates that may spike blood sugar and increase hunger');
      }
      break;
      
    case 'Heart Health':
      if (ingredients.some(i => i.toLowerCase().includes('salt') || i.toLowerCase().includes('processed meat') || i.toLowerCase().includes('canned'))) {
        negativeFactors.push('Contains sodium which may elevate blood pressure in sensitive individuals');
      }
      if (ingredients.some(i => i.toLowerCase().includes('butter') || i.toLowerCase().includes('cheese') || i.toLowerCase().includes('cream'))) {
        negativeFactors.push('Contains saturated fats which research links to increased LDL cholesterol');
      }
      if (ingredients.some(i => i.toLowerCase().includes('processed') || i.toLowerCase().includes('package') || i.toLowerCase().includes('fast food'))) {
        negativeFactors.push('Contains processed ingredients with trans fats or oxidized oils that may impair heart health');
      }
      break;
      
    case 'Recovery':
      if (ingredients.some(i => i.toLowerCase().includes('processed') || i.toLowerCase().includes('fried') || i.toLowerCase().includes('refined'))) {
        negativeFactors.push('Contains pro-inflammatory ingredients that may delay recovery');
      }
      if (ingredients.some(i => i.toLowerCase().includes('alcohol') || i.toLowerCase().includes('beer') || i.toLowerCase().includes('wine'))) {
        negativeFactors.push('Contains alcohol which impairs protein synthesis and recovery processes');
      }
      if (nutrients.some(n => n.name.toLowerCase() === 'sugar' && parseFloat(n.value) > 10)) {
        negativeFactors.push('Contains excess sugar which may increase systemic inflammation');
      }
      break;
      
    default:
      // Generic negative factors for any health goal
      if (ingredients.some(i => i.toLowerCase().includes('sugar') || i.toLowerCase().includes('syrup') || i.toLowerCase().includes('candy'))) {
        negativeFactors.push('Contains added sugars that provide calories with minimal nutritional benefit');
      }
      if (ingredients.some(i => i.toLowerCase().includes('processed') || i.toLowerCase().includes('packaged') || i.toLowerCase().includes('fast food'))) {
        negativeFactors.push('Contains processed elements with potential additives and lower nutrient density');
      }
      if (nutrients.some(n => n.name.toLowerCase() === 'sodium' && parseFloat(n.value) > 500)) {
        negativeFactors.push('Contains higher sodium levels which may not be ideal for some health goals');
      }
  }
  
  return negativeFactors;
}

// Helper function to determine the goal category type in a more nuanced way
function getGoalCategoryType(healthGoal: string): string {
  const goalLower = healthGoal.toLowerCase();
  
  if (goalLower.includes('sleep') || goalLower.includes('insomnia') || goalLower.includes('rest')) 
    return 'Sleep';
  
  if (goalLower.includes('weight') || goalLower.includes('fat') || goalLower.includes('lean') || goalLower.includes('slim')) 
    return 'Weight Management';
  
  if (goalLower.includes('muscle') || goalLower.includes('strength') || goalLower.includes('bulk') || goalLower.includes('gain mass')) 
    return 'Muscle Building';
  
  if (goalLower.includes('energy') || goalLower.includes('fatigue') || goalLower.includes('tired') || goalLower.includes('focus')) 
    return 'Energy';
  
  if (goalLower.includes('heart') || goalLower.includes('cardiac') || goalLower.includes('blood pressure') || goalLower.includes('cholesterol')) 
    return 'Heart Health';
  
  if (goalLower.includes('recovery') || goalLower.includes('inflammation') || goalLower.includes('pain') || goalLower.includes('soreness') || goalLower.includes('injury')) 
    return 'Recovery';
  
  if (goalLower.includes('immune') || goalLower.includes('sick') || goalLower.includes('cold') || goalLower.includes('flu') || goalLower.includes('virus')) 
    return 'Immune Support';
  
  if (goalLower.includes('digest') || goalLower.includes('gut') || goalLower.includes('stomach') || goalLower.includes('bloat') || goalLower.includes('ibs')) 
    return 'Digestive Health';
  
  if (goalLower.includes('brain') || goalLower.includes('cognitive') || goalLower.includes('memory') || goalLower.includes('focus') || goalLower.includes('mental')) 
    return 'Cognitive Function';
  
  if (goalLower.includes('run') || goalLower.includes('workout') || goalLower.includes('performance') || goalLower.includes('training') || goalLower.includes('exercise') || goalLower.includes('endurance') || goalLower.includes('gym')) 
    return 'Athletic Performance';
  
  // If no specific match is found, make an intelligent guess
  if (goalLower.includes('health') || goalLower.includes('overall') || goalLower.includes('wellbeing') || goalLower.includes('wellness')) 
    return 'General Health';
  
  // Default to General Health if no pattern is recognized
  return 'General Health';
}

// Helper function to format goal name for display
function formatGoalName(healthGoal: string): string {
  // Normalize the goal text
  const normalizedGoal = healthGoal.toLowerCase().trim();
  
  if (normalizedGoal.includes('sleep')) {
    return 'Sleep Impact';
  } 
  else if (normalizedGoal.includes('weight') || normalizedGoal.includes('fat loss')) {
    return 'Weight Management';
  }
  else if (normalizedGoal.includes('muscle') || normalizedGoal.includes('strength')) {
    return 'Muscle Building';
  }
  else if (normalizedGoal.includes('energy')) {
    return 'Energy';
  }
  else if (normalizedGoal.includes('heart') || normalizedGoal.includes('cardiac')) {
    return 'Heart Health';
  }
  else if (normalizedGoal.includes('recovery') || normalizedGoal.includes('inflammation')) {
    return 'Recovery';
  }
  else {
    // Capitalize first letter of each word for a generic goal
    return healthGoal
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Helper function to check if GPT results are valid and contain identified ingredients
function isValidGptAnalysis(gptAnalysis: any): { isValid: boolean; reason: string | null } {
  console.log('Validating GPT analysis results...');

  // Check if we have any result at all
  if (!gptAnalysis) {
    return { isValid: false, reason: 'No analysis result returned' };
  }

  // Check if we have an ingredients list
  if (!gptAnalysis.ingredientList || !Array.isArray(gptAnalysis.ingredientList) || gptAnalysis.ingredientList.length === 0) {
    console.log('GPT did not identify any ingredients in the image');
    return { isValid: false, reason: 'no_ingredients' };
  }

  // Check if ingredients look valid (not just placeholders or error messages)
  const suspiciousIngredients = gptAnalysis.ingredientList.filter((ingredient: string) => 
    ingredient.toLowerCase().includes('unable to') || 
    ingredient.toLowerCase().includes('not clear') || 
    ingredient.toLowerCase().includes('can\'t identify') ||
    ingredient.toLowerCase().includes('cannot identify') ||
    ingredient.toLowerCase().includes('unclear image') ||
    ingredient.toLowerCase().includes('not visible') ||
    ingredient.toLowerCase().includes('blurry')
  );

  if (suspiciousIngredients.length > 0 && suspiciousIngredients.length >= gptAnalysis.ingredientList.length / 2) {
    console.log('Found suspicious ingredients suggesting unclear image:', suspiciousIngredients);
    return { isValid: false, reason: 'unclear_image' };
  }

  // Check if description suggests an unclear image
  if (gptAnalysis.description && 
     (gptAnalysis.description.toLowerCase().includes('unclear') || 
      gptAnalysis.description.toLowerCase().includes('blurry') ||
      gptAnalysis.description.toLowerCase().includes('not visible') ||
      gptAnalysis.description.toLowerCase().includes('unable to identify') ||
      gptAnalysis.description.toLowerCase().includes('poor quality'))) {
    console.log('Description suggests unclear image:', gptAnalysis.description);
    return { isValid: false, reason: 'unclear_image_description' };
  }

  return { isValid: true, reason: null };
}

// Function to create a friendly fallback message based on the validation failure reason
function createFallbackResponse(reason: string, healthGoal: string, requestId: string): any {
  console.log(`[${requestId}] Creating fallback response for reason: ${reason}`);
  
  let fallbackMessage = '';
  let reasonCode = '';
  
  switch (reason) {
    case 'no_ingredients':
      fallbackMessage = "We couldn't identify any ingredients in your photo. Please try a clearer image with better lighting, or try again with a different angle.";
      reasonCode = 'no_ingredients';
      break;
    case 'unclear_image':
    case 'unclear_image_description':
      fallbackMessage = "Your photo appears to be blurry or unclear. For better results, try taking a photo with more light, less glare, and make sure the food is clearly visible.";
      reasonCode = 'unclear_image';
      break;
    default:
      fallbackMessage = "We had trouble analyzing your meal. Please try again with a clearer photo that shows all the food items.";
      reasonCode = 'analysis_failed';
  }

  // Create a minimal analysis with helpful feedback
  return {
    fallback: true,
    success: false,
    reason: reasonCode,
    fallbackMessage,
    description: "Unidentified meal",
    ingredientList: [],
    basicNutrition: {
      calories: "unknown",
      protein: "unknown",
      carbs: "unknown",
      fat: "unknown"
    },
    goalName: formatGoalName(healthGoal),
    goalImpactScore: 0,
    feedback: [
      fallbackMessage,
      "Try a photo with better lighting and ensure all food items are clearly visible.",
      "Make sure your meal is in focus and there isn't excessive glare or shadows."
    ],
    suggestions: [
      "Take photos in natural daylight when possible",
      "Ensure the camera lens is clean and the food is in focus",
      "Take the photo from directly above the plate for best results"
    ]
  };
}

export async function POST(request: NextRequest) {
  // Generate unique request ID for tracking
  const requestId = Math.random().toString(36).substring(2, 10);
  
  // Track active requests and start time
  activeRequests++;
  requestStartTimes.set(requestId, Date.now());
  
  console.time(`⏱️ [${requestId}] analyzeImage`);
  console.log(`🔄 [${requestId}] New request (${activeRequests} concurrent requests)`);
  
  try {
    // Check if we've exceeded concurrent request limit
    if (activeRequests > MAX_CONCURRENT_REQUESTS) {
      requestStartTimes.delete(requestId);
      activeRequests--;
      console.log(`⚠️ [${requestId}] Request rejected - concurrent limit reached (${activeRequests}/${MAX_CONCURRENT_REQUESTS})`);
      return NextResponse.json(
        { 
          status: 'error',
          success: false, 
          fallback: true,
          message: 'Server is busy processing too many requests. Please try again in a moment.',
          ingredients: [],
          description: '',
          nutrition: null,
          _meta: { requestId, concurrentRequests: activeRequests }
        },
        { status: 429 }
      );
    }

    // Check content type of request
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({
        status: 'error',
        success: false,
        fallback: true,
        message: `Unsupported content type: ${contentType}. Please use multipart/form-data.`,
        ingredients: [],
        description: '',
        nutrition: null,
        _meta: { requestId }
      }, { status: 400 });
    }

    // Parse form data with error handling
    let formData;
    try {
      formData = await request.formData();
    } catch (formDataError) {
      console.error(`❌ [${requestId}] FormData Error:`, formDataError);
      return NextResponse.json({
        status: 'error',
        success: false,
        fallback: true,
        message: 'Failed to parse form data. Please check your request format.',
        ingredients: [],
        description: '',
        nutrition: null,
        _meta: { requestId }
      }, { status: 400 });
    }
    
    const healthGoal = (formData.get('healthGoal') as string) || 'General Health';

    // Calculate time remaining until serverless function timeout (9.5s safety margin)
    const MAX_EXECUTION_TIME = 10 * 1000; // 10 seconds for Vercel
    const SAFETY_MARGIN = 500; // 0.5 second safety margin
    const timeElapsed = Date.now() - (requestStartTimes.get(requestId) || Date.now());
    const timeRemaining = MAX_EXECUTION_TIME - timeElapsed - SAFETY_MARGIN;
    
    console.log(`⏱️ [${requestId}] Time remaining: ${timeRemaining}ms`);

    // Set up global timeout promise to ensure we return before serverless timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Global timeout: Request exceeded execution time limit'));
      }, Math.max(timeRemaining, 0));
    });

    // Extract base64 image with error handling 
    let base64Image: string;
    try {
      base64Image = await extractBase64Image(formData);
      console.log(`[${requestId}] Successfully extracted base64 image (${base64Image.length} chars)`);
    } catch (imageError: any) {
      console.error(`❌ [${requestId}] Image Error:`, imageError.message);
      return NextResponse.json({
        status: 'error',
        success: false,
        fallback: true,
        message: `Failed to process image: ${imageError.message}`,
        ingredients: [],
        description: '',
        nutrition: null,
        _meta: { requestId }
      }, { status: 400 });
    }

    // Run API calls in parallel with Promise.allSettled and proper error handling
    let results;
    try {
      results = await Promise.race([
        Promise.allSettled([
          // Analyze with GPT-4 Vision
          analyzeWithGPT4Vision(base64Image, healthGoal, requestId),
          
          // Get nutrition data from Nutritionix (disabled for now to simplify)
          // getNutritionData(["dummy"]) // Placeholder to avoid breaking the array structure
        ]),
        timeoutPromise
      ]);
    } catch (timeoutError) {
      console.error(`❌ [${requestId}] Timeout Error:`, timeoutError);
      // Clean up tracking data
      requestStartTimes.delete(requestId);
      activeRequests--;
      
      return NextResponse.json({
        status: 'timeout',
        success: false,
        fallback: true,
        message: 'Analysis took too long. Please try a clearer image or try again later.',
        ingredients: [],
        description: 'Analysis timed out',
        nutrition: null,
        _meta: { requestId, error: 'Timeout exceeded' }
      }, { status: 408 });
    }

    // Clean up tracking data
    requestStartTimes.delete(requestId);
    activeRequests--;

    // Safe defaults in case processing fails
    let gptAnalysis: any = null;
    let nutritionixData: any = null;
    let analysisFailed = false;
    let failureReason = '';

    // Process the results with comprehensive error handling
    if (Array.isArray(results)) {
      const [gptResult] = results;
      
      // Process GPT result with safe fallbacks
      if (gptResult && gptResult.status === 'fulfilled') {
        if (gptResult.value) {
          gptAnalysis = gptResult.value;
          
          // Validate the GPT analysis
          const { isValid, reason } = isValidGptAnalysis(gptAnalysis);
          
          if (!isValid) {
            console.log(`⚠️ [${requestId}] GPT analysis invalid: ${reason}`);
            // Create a fallback response with friendly messaging
            gptAnalysis = createFallbackResponse(reason || 'unknown', healthGoal, requestId);
            analysisFailed = true;
            failureReason = reason || 'unknown';
            
            console.log(`✅ [${requestId}] Created fallback response due to unclear image`);
          } else {
            console.log(`✅ [${requestId}] GPT analysis valid`);
          }
        } else {
          console.error(`❌ [${requestId}] GPT Error: Empty response received`);
          gptAnalysis = createFallbackResponse('empty_response', healthGoal, requestId);
          analysisFailed = true;
          failureReason = 'empty_response';
        }
      } else if (gptResult) {
        // Handle rejected promise case
        const errorMessage = gptResult.reason instanceof Error ? 
          gptResult.reason.message : 
          typeof gptResult.reason === 'string' ? 
            gptResult.reason : 'Unknown GPT error';
            
        console.error(`❌ [${requestId}] GPT Error:`, errorMessage);
        gptAnalysis = createFallbackResponse('api_error', healthGoal, requestId);
        analysisFailed = true;
        failureReason = 'api_error';
      } else {
        console.error(`❌ [${requestId}] GPT Error: Invalid result structure`);
        gptAnalysis = createFallbackResponse('api_error', healthGoal, requestId);
        analysisFailed = true;
        failureReason = 'invalid_structure';
      }

      // Process nutrition data if available (safely handle the second result)
      if (results.length > 1 && results[1] && results[1].status === 'fulfilled') {
        nutritionixData = results[1].value;
        console.log(`✅ [${requestId}] Nutrition data fetched successfully`);
      } else {
        console.warn(`⚠️ [${requestId}] Nutrition data not available`);
      }
    } else {
      console.error(`❌ [${requestId}] Unexpected Error: Invalid results format`, results);
      gptAnalysis = createFallbackResponse('unexpected_error', healthGoal, requestId);
      analysisFailed = true;
      failureReason = 'invalid_results_format';
    }

    // Always ensure we have valid gptAnalysis to avoid null references
    if (!gptAnalysis) {
      console.error(`❌ [${requestId}] Critical Error: Missing analysis result`);
      gptAnalysis = createFallbackResponse('missing_analysis', healthGoal, requestId);
      analysisFailed = true;
      failureReason = 'missing_analysis';
    }

    // Format the response, with fallback handling for formatting errors
    let response;
    try {
      response = formatResponse(gptAnalysis, nutritionixData || [], healthGoal);
      
      // Add meta information about the analysis result
      response._meta = {
        requestId,
        analysisFailed,
        failureReason,
        processingTimeMs: Date.now() - (requestStartTimes.get(requestId) || Date.now())
      };
      
      // Add success/fallback flags for frontend consistency
      response.success = !analysisFailed;
      response.fallback = analysisFailed;
      response.status = analysisFailed ? 'fallback' : 'success';
      
      if (analysisFailed) {
        response.message = gptAnalysis.fallbackMessage || 'Analysis could not be completed. Please try again with a clearer image.';
      }
      
    } catch (formatError) {
      console.error(`❌ [${requestId}] Formatting Error:`, formatError);
      
      // Last resort fallback if even formatting fails
      response = {
        status: 'error',
        success: false,
        fallback: true,
        message: 'Failed to format analysis results. Please try again.',
        description: 'Analysis failed',
        ingredients: [],
        nutrients: [],
        feedback: ['Please try again with a clearer image.'],
        suggestions: ['Ensure the image is well-lit and in focus.'],
        goalScore: 0,
        goalName: formatGoalName(healthGoal),
        _meta: { 
          requestId,
          error: formatError instanceof Error ? formatError.message : 'Unknown formatting error',
          analysisFailed: true,
          failureReason: 'formatting_error'
        }
      };
    }

    console.timeEnd(`⏱️ [${requestId}] analyzeImage`);
    console.log(`✅ [${requestId}] Analysis complete - ${analysisFailed ? 'Using fallback' : 'Success'}`);
    
    // Return the response with appropriate status code
    return NextResponse.json(response, { 
      status: analysisFailed ? 200 : 200 // Always return 200 to avoid frontend errors, handle failure in response body
    });
    
  } catch (error: unknown) {
    // Ultimate fallback - this should never happen if our error handling is complete
    console.error(`❌ [${requestId}] Unhandled Error:`, error);
    
    // Clean up tracking data
    requestStartTimes.delete(requestId);
    activeRequests--;
    
    console.timeEnd(`⏱️ [${requestId}] analyzeImage`);
    
    // Safe error message extraction
    const errorMessage = error instanceof Error ? error.message : 
      (typeof error === 'string' ? error : 'Unknown error');
    
    return NextResponse.json(
      {
        status: 'error',
        success: false,
        fallback: true,
        message: 'An unexpected error occurred during analysis. Please try again.',
        ingredients: [],
        description: '',
        nutrition: null,
        goalName: 'Analysis Failed',
        goalScore: 0,
        feedback: ['Please try again with a different image.'],
        suggestions: ['Make sure your image is clear and well-lit.'],
        _meta: { 
          requestId, 
          error: errorMessage,
          location: 'unhandled_exception'
        }
      },
      { status: 200 } // Return 200 even for errors to avoid frontend crashes
    );
  }
}