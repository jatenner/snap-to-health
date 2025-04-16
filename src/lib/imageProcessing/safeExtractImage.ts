import { validateBase64Image } from '@/lib/imageProcessing/validateImage';

// Image extraction and validation
export async function safeExtractImage(formData: FormData | null, jsonData: any): Promise<string | null> {
  try {
    let base64Image: string | null = null;

    // Handle FormData submission
    if (formData && formData.get('image')) {
      const imageFile = formData.get('image') as File;
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Image = buffer.toString('base64');
    } 
    // Handle JSON submission with base64 image
    else if (jsonData && typeof jsonData.image === 'string') {
      // Extract base64 data (if the prefix exists, remove it)
      const match = jsonData.image.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
      base64Image = match ? match[1] : jsonData.image;
    }

    // Validate the extracted image
    if (base64Image) {
      const validationResult = validateBase64Image(base64Image);
      if (!validationResult.valid) {
        console.warn(`Image validation failed: ${validationResult.error}`);
        return null;
      }
      // Return the base64 data *without* the prefix for consistency
      return base64Image;
    }

    console.warn('No image found in the request');
    return null;
  } catch (error) {
    console.error('Failed to extract image', error);
    return null;
  }
} 