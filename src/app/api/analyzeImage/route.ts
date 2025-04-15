import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Function to extract base64 from FormData image
async function extractBase64Image(formData: FormData): Promise<string> {
  const file = formData.get('image') as File;
  
  if (!file) {
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
    throw new Error(`Invalid file type: ${file.type}. Only images are accepted.`);
  }
  
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    
    console.log('Successfully converted image to base64');
    console.log('Base64 length:', base64.length);
    
    if (base64.length === 0) {
      throw new Error('Image conversion resulted in empty base64 string');
    }
    
    return base64;
  } catch (error: any) {
    console.error('Error converting image to base64:', error);
    throw new Error(`Failed to convert image to base64: ${error.message}`);
  }
}

// Request function with retry and timeout capabilities
async function fetchWithRetryAndTimeout(url: string, options: any, retries = 2, timeout = 30000) {
  return new Promise(async (resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      console.log(`Request to ${url} timed out after ${timeout}ms`);
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);
    
    // Attempt fetch with retries
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
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
    reject(lastError || new Error('All fetch attempts failed'));
  });
}

// Function to analyze the image with GPT-4 Vision
async function analyzeWithGPT4Vision(base64Image: string, healthGoal: string) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  console.log('OpenAI API Key available:', !!OPENAI_API_KEY);
  console.log('Base64 image length:', base64Image.length);
  console.log('Base64 image preview:', base64Image.substring(0, 50) + '...');
  console.log('Health goal:', healthGoal);
  
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  try {
    console.log('Sending request to OpenAI API...');
    
    // Get goal-specific prompt
    const goalPrompt = getGoalSpecificPrompt(healthGoal);
    
    // Log the prompt being used
    console.log(`Analyzing image with health goal: ${healthGoal}`);
    console.log(`Using ${goalPrompt.length} character prompt for this goal`);
    
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
              text: `You are an expert nutritionist and performance coach who specializes in analyzing meals for specific health goals. Analyze the image of this meal and return the result as strict JSON.

The user's specific health goal is: "${healthGoal}"

${goalPrompt}

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
      temperature: 0.5,  // Lower temperature for more deterministic output
      response_format: { type: "json_object" }  // Force JSON response
    };
    
    console.log('Request URL:', 'https://api.openai.com/v1/chat/completions');
    console.log('Request model:', requestPayload.model);
    
    // Use enhanced fetch with retry and timeout
    const response = await fetchWithRetryAndTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload)
      },
      2, // 2 retries
      60000 // 60 second timeout
    ) as Response;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error:', errorText);
      throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.json();
    console.log('GPT-4 Vision Analysis Complete');
    
    if (
      !responseData.choices || 
      !responseData.choices[0] || 
      !responseData.choices[0].message || 
      !responseData.choices[0].message.content
    ) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    const analysisText = responseData.choices[0].message.content;
    
    try {
      // Parse the JSON response
      const analysisJson = JSON.parse(analysisText.trim());
      console.log('Analysis JSON parsed successfully');
      return analysisJson;
    } catch (parseError) {
      console.error('Error parsing JSON from GPT response:', parseError);
      console.error('Raw response:', analysisText);
      
      // Try to extract JSON using regex if parsing fails
      const jsonMatch = analysisText.match(/({[\s\S]*})/);
      if (jsonMatch && jsonMatch[0]) {
        try {
          const extractedJson = JSON.parse(jsonMatch[0]);
          console.log('Extracted JSON using regex');
          return extractedJson;
        } catch (extractError) {
          console.error('Failed to extract JSON with regex:', extractError);
        }
      }
      
      throw new Error('Failed to parse analysis result');
    }
  } catch (error) {
    console.error('Error analyzing image with GPT-4 Vision:', error);
    throw error;
  }
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
async function getNutritionData(ingredients: string[]) {
  // In a production app, you would keep these keys in environment variables
  const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID;
  const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY;
  
  console.log('Nutritionix API credentials available:', !!NUTRITIONIX_APP_ID && !!NUTRITIONIX_API_KEY);
  
  if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_API_KEY) {
    throw new Error('Nutritionix API credentials are not configured');
  }

  try {
    const nutritionData = [];
    
    for (const ingredient of ingredients) {
      console.log(`Fetching nutrition data for: ${ingredient}`);
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
        }
      );
      
      console.log(`Received nutrition data for: ${ingredient}`);
      
      if (response.data.foods && response.data.foods.length > 0) {
        const food = response.data.foods[0];
        nutritionData.push({
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
        });
      }
    }
    
    return nutritionData;
  } catch (error) {
    console.error('Error fetching nutrition data from Nutritionix:', error);
    return [];
  }
}

// Function to format the response
function formatResponse(
  gptAnalysis: any,
  nutritionData: any[],
  healthGoal: string
) {
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
  
  // Final response object with all required fields
  return {
    description: gptAnalysis.description || 'A meal containing various ingredients and nutrients.',
    nutrients,
    feedback: gptAnalysis.feedback || ['Try to eat a balanced meal with protein, healthy fats, and complex carbohydrates.'],
    suggestions: gptAnalysis.suggestions || ['Consider adding more vegetables to your next meal.'],
    goalScore,
    goalName,
    scoreExplanation,
    positiveFoodFactors,
    negativeFoodFactors,
    rawGoal: healthGoal
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

export async function POST(request: NextRequest) {
  console.log('Received image analysis request');
  
  try {
    // Check content type
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Content type must be multipart/form-data' }, { status: 400 });
    }
    
    // Parse form data
    const formData = await request.formData();
    console.log('Form data keys:', Array.from(formData.keys()));
    
    // Extract image file
    const imageFile = formData.get('image') as File;
    const healthGoal = formData.get('healthGoal') as string || 'Improve overall health';
    
    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }
    
    console.log('Received image:', imageFile.name, 'type:', imageFile.type, 'size:', imageFile.size);
    console.log('Health goal:', healthGoal);
    
    // Convert image to base64
    const base64Image = await extractBase64Image(formData);
    if (!base64Image) {
      return NextResponse.json({ error: 'Failed to extract image' }, { status: 400 });
    }
    
    console.log('Successfully extracted image as base64');
    
    try {
      // Call GPT-4 Vision API
      console.log('Calling GPT-4 Vision API...');
      const startTime = Date.now();
      const gptAnalysis = await analyzeWithGPT4Vision(base64Image, healthGoal);
      const endTime = Date.now();
      console.log(`GPT-4 Vision analysis completed in ${(endTime - startTime) / 1000}s`);
      
      let ingredientList: string[] = [];
      if (gptAnalysis.ingredientList && Array.isArray(gptAnalysis.ingredientList)) {
        ingredientList = gptAnalysis.ingredientList;
      } else if (typeof gptAnalysis.ingredientList === 'string') {
        // Handle case where GPT returns a string instead of array
        ingredientList = gptAnalysis.ingredientList.split(',').map((item: string) => item.trim());
      }
      
      // Fetch nutrition data for ingredients
      console.log('Fetching nutrition data for ingredients...');
      let nutritionData: any[] = [];
      try {
        if (ingredientList.length > 0) {
          nutritionData = await getNutritionData(ingredientList);
        } else {
          console.warn('No ingredients detected for nutrition lookup');
        }
      } catch (nutritionError) {
        console.error('Error fetching nutrition data:', nutritionError);
        // Continue without nutrition data
      }
      
      // Format the response
      console.log('Formatting response...');
      const formattedResponse = formatResponse(gptAnalysis, nutritionData, healthGoal);
      
      // Return the formatted response
      return NextResponse.json(formattedResponse);
    } catch (analysisError: any) {
      console.error('Analysis error:', analysisError);
      return NextResponse.json(
        { error: `Analysis failed: ${analysisError.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Request processing error:', error);
    return NextResponse.json(
      { error: `Request processing failed: ${error.message}` }, 
      { status: 500 }
    );
  }
} 