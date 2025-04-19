/**
 * Diagnostics utility for image analysis
 * Helps identify and log points of failure in the image analysis pipeline
 */

interface DiagnosticResult {
  stage: string;
  success: boolean;
  message: string;
  error?: any;
  data?: any;
  startTime: number;
  endTime: number;
  durationMs: number;
}

export interface AnalysisDiagnostics {
  requestId: string;
  overallSuccess: boolean;
  stages: DiagnosticResult[];
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  summary: string;
}

/**
 * Create a new diagnostics session for tracking image analysis pipeline
 */
export function createAnalysisDiagnostics(requestId: string): {
  diagnostics: AnalysisDiagnostics;
  recordStage: (stage: string, fn: () => Promise<any>) => Promise<any>;
  complete: (success: boolean) => AnalysisDiagnostics;
} {
  const startTime = Date.now();
  
  const diagnostics: AnalysisDiagnostics = {
    requestId,
    overallSuccess: false,
    stages: [],
    startTime,
    endTime: 0,
    totalDurationMs: 0,
    summary: ''
  };
  
  /**
   * Record a stage in the analysis pipeline
   * Wraps the function call with timing and error handling
   */
  const recordStage = async (stage: string, fn: () => Promise<any>) => {
    const stageStartTime = Date.now();
    
    console.log(`🔍 [${requestId}] Starting stage: ${stage}`);
    
    let success = false;
    let result = null;
    let error = null;
    
    try {
      result = await fn();
      success = true;
      console.log(`✅ [${requestId}] Completed stage: ${stage}`);
      return result;
    } catch (e) {
      error = e;
      console.error(`❌ [${requestId}] Failed at stage: ${stage}`, e);
      throw e;
    } finally {
      const stageEndTime = Date.now();
      const durationMs = stageEndTime - stageStartTime;
      
      diagnostics.stages.push({
        stage,
        success,
        message: success ? 'Completed successfully' : 'Failed',
        error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
        data: result ? (typeof result === 'object' ? summarizeObject(result) : result) : undefined,
        startTime: stageStartTime,
        endTime: stageEndTime,
        durationMs
      });
      
      console.log(`⏱️ [${requestId}] Stage ${stage} took ${durationMs}ms`);
    }
  };
  
  /**
   * Complete the diagnostics session and generate summary
   */
  const complete = (success: boolean) => {
    const endTime = Date.now();
    diagnostics.endTime = endTime;
    diagnostics.totalDurationMs = endTime - startTime;
    diagnostics.overallSuccess = success;
    
    // Generate summary
    const failedStages = diagnostics.stages.filter(s => !s.success);
    if (failedStages.length > 0) {
      diagnostics.summary = `Analysis failed at stage: ${failedStages[0].stage}. Error: ${failedStages[0].error || 'Unknown error'}`;
    } else if (diagnostics.stages.length === 0) {
      diagnostics.summary = 'No stages were recorded during analysis';
    } else {
      diagnostics.summary = `Analysis completed successfully in ${diagnostics.totalDurationMs}ms through ${diagnostics.stages.length} stages`;
    }
    
    // Log overall diagnostics
    console.log(`📊 [${requestId}] Analysis diagnostics completed:`);
    console.log(`📊 [${requestId}] Total duration: ${diagnostics.totalDurationMs}ms`);
    console.log(`📊 [${requestId}] Overall success: ${diagnostics.overallSuccess}`);
    console.log(`📊 [${requestId}] Summary: ${diagnostics.summary}`);
    
    return diagnostics;
  };
  
  return { diagnostics, recordStage, complete };
}

/**
 * Create a safe summary of an object for logging
 * Prevents circular references and limits the size
 */
function summarizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  try {
    // For arrays, summarize each item
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return `Array(${obj.length}) [${obj.length > 3 ? 
        `${JSON.stringify(obj[0])}, ... ${obj.length - 2} more items` : 
        obj.map(i => JSON.stringify(i)).join(', ')}]`;
    }
    
    // For objects, summarize key/values
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    
    const summary: Record<string, any> = {};
    
    // Include only top-level keys for brevity
    for (const key of keys.slice(0, 5)) {
      const value = obj[key];
      
      if (key === 'base64Image' || key === 'image' || key === 'data') {
        summary[key] = '[Large data truncated]';
      } else if (typeof value === 'object' && value !== null) {
        summary[key] = Array.isArray(value) ? 
          `Array(${value.length})` : 
          `Object(${Object.keys(value).length} keys)`;
      } else {
        summary[key] = value;
      }
    }
    
    if (keys.length > 5) {
      summary['...'] = `${keys.length - 5} more keys`;
    }
    
    return summary;
  } catch (e) {
    return '[Object could not be summarized]';
  }
}

/**
 * Check Nutritionix API credentials
 */
export async function checkNutritionixCredentials(): Promise<{
  success: boolean;
  appId: string | null;
  appIdValid: boolean;
  apiKey: string | null;
  apiKeyValid: boolean;
  error?: string;
}> {
  const appId = process.env.NUTRITIONIX_APP_ID;
  const apiKey = process.env.NUTRITIONIX_API_KEY;
  
  console.log('Checking Nutritionix credentials...');
  
  if (!appId || !apiKey) {
    return {
      success: false,
      appId: appId || null,
      appIdValid: false,
      apiKey: apiKey ? '********' : null,
      apiKeyValid: false,
      error: !appId && !apiKey ? 
        'Both Nutritionix App ID and API Key are missing' : 
        !appId ? 'Nutritionix App ID is missing' : 'Nutritionix API Key is missing'
    };
  }
  
  try {
    // Make a test request to the Nutritionix API
    const response = await fetch('https://trackapi.nutritionix.com/v2/search/instant?query=apple', {
      method: 'GET',
      headers: {
        'x-app-id': appId,
        'x-app-key': apiKey,
      },
    });
    
    const success = response.ok;
    const data = await response.json();
    
    return {
      success,
      appId,
      appIdValid: success,
      apiKey: '********',
      apiKeyValid: success,
      error: !success ? `API returned status ${response.status}: ${data.message || 'Unknown error'}` : undefined
    };
  } catch (error) {
    return {
      success: false,
      appId,
      appIdValid: false,
      apiKey: '********',
      apiKeyValid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check OCR configuration
 */
export function checkOCRConfig(): {
  enabled: boolean;
  confidenceThreshold: number;
  segmentationEnabled: boolean;
  serverless: boolean;
} {
  return {
    enabled: process.env.USE_OCR_EXTRACTION === 'true',
    confidenceThreshold: parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || '0.7'),
    segmentationEnabled: process.env.OCR_SEGMENTATION_ENABLED === 'true',
    serverless: process.env.VERCEL === '1'
  };
} 