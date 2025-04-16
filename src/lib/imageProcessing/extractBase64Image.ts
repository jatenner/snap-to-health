/**
 * Safely extracts base64 image data from various input formats
 * 
 * @param input The input string that may contain base64 image data
 * @returns The extracted base64 image data or null if extraction fails
 */
export function extractBase64Image(input: string | null | undefined): string | null {
  try {
    // Return null if input is null or undefined
    if (!input) {
      console.log('extractBase64Image: Input is null or undefined');
      return null;
    }
    
    // If the input already starts with data:image, it's already a base64 string
    if (input.startsWith('data:image')) {
      return input;
    }
    
    // Try to extract base64 image data using regex
    const base64Regex = /data:image\/[^;]+;base64,[^\s]+/;
    const match = input.match(base64Regex);
    
    if (match && match[0]) {
      return match[0];
    }
    
    console.log('extractBase64Image: Could not extract base64 image data');
    return null;
  } catch (error) {
    console.error('Error extracting base64 image:', error);
    return null;
  }
} 