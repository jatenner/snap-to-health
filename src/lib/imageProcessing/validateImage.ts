/**
 * Image validation utilities
 */

// Maximum file size in bytes (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Valid image MIME types
export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

/**
 * Validates an image file based on size and type
 * 
 * @param file The file to validate
 * @returns An object with validation result and error message if any
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  try {
    // Check if file exists
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return { 
        valid: false, 
        error: `File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      };
    }

    // Check file type
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      return { 
        valid: false, 
        error: `Invalid file type. Supported types: ${VALID_IMAGE_TYPES.join(', ')}` 
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating image:', error);
    return { valid: false, error: 'An unexpected error occurred while validating the image' };
  }
}

/**
 * Validates a base64 image string
 * 
 * @param base64String The base64 string to validate
 * @returns An object with validation result and error message if any
 */
export function validateBase64Image(base64String: string): { valid: boolean; error?: string } {
  try {
    // Check if string exists
    if (!base64String) {
      return { valid: false, error: 'No image data provided' };
    }

    // Check if it's a valid image data URL
    if (!base64String.startsWith('data:image/')) {
      return { valid: false, error: 'Invalid image data format' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating base64 image:', error);
    return { valid: false, error: 'An unexpected error occurred while validating the image' };
  }
} 