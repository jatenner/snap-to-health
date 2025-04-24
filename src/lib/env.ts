/**
 * Environment configuration utilities
 * Centralizes access to environment variables with proper typing and defaults
 */

// Vision and OCR settings
export const USE_GPT4_VISION = process.env.USE_GPT4_VISION === 'true'
export const USE_OCR_EXTRACTION = process.env.USE_OCR_EXTRACTION === 'true'
export const OCR_CONFIDENCE_THRESHOLD = parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || '0.7')

// API configuration
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY
export const OPENAI_TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10)
export const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID
export const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY

// Server environment detection
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
export const IS_VERCEL = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL)
export const VERCEL_ENV = process.env.VERCEL_ENV || 'development'

// Feature flags
export const ENABLE_DEBUG_LOGS = process.env.ENABLE_DEBUG_LOGS === 'true' || !IS_PRODUCTION

/**
 * Validates if required API keys are present
 * @returns Object with validation status for each key
 */
export function validateApiKeys() {
  return {
    openai: Boolean(OPENAI_API_KEY),
    nutritionix: Boolean(NUTRITIONIX_APP_ID && NUTRITIONIX_API_KEY),
  }
}

/**
 * Logs the current environment configuration (safe version for logging)
 * Doesn't log actual key values, just whether they're present
 */
export function logEnvironmentConfig() {
  if (!ENABLE_DEBUG_LOGS) return
  
  console.log('🔧 Environment Configuration:')
  console.log(`- Environment: ${IS_PRODUCTION ? 'production' : 'development'}`)
  console.log(`- Vercel: ${IS_VERCEL ? 'yes' : 'no'}`)
  console.log(`- Vision enabled: ${USE_GPT4_VISION ? 'yes' : 'no'}`)
  console.log(`- OCR fallback: ${USE_OCR_EXTRACTION ? 'yes' : 'no'}`)
  console.log(`- OpenAI API key: ${OPENAI_API_KEY ? 'present' : 'missing'}`)
  console.log(`- Nutritionix keys: ${(NUTRITIONIX_APP_ID && NUTRITIONIX_API_KEY) ? 'present' : 'missing'}`)
} 