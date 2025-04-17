/**
 * Constants for OpenAI models and configuration
 */

// Default GPT model for image analysis
export const GPT_MODEL = 'gpt-4o';

// Modern vision model (when available)
export const GPT_VISION_MODEL = 'gpt-4o';

// Fallback models in order of preference
export const FALLBACK_MODELS = [
  'gpt-4o',
  'gpt-4-vision-preview',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo-16k'
];

// API request configuration
export const API_CONFIG = {
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.2,
  TOP_P: 0.9,
  FREQUENCY_PENALTY: 0,
  PRESENCE_PENALTY: 0
}; 