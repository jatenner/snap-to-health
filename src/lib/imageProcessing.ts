/**
 * Utility functions for image processing
 */

/**
 * Extracts a base64 image from various input formats
 * @param formData The input data containing an image file
 * @param requestId A unique ID for request tracking
 * @returns A base64-encoded data URL
 */
export async function extractBase64Image(formData: any, requestId: string = 'unknown'): Promise<string> {
  console.time(`⏱️ [${requestId}] extractBase64Image`);
  
  try {
    // Safety check - ensure formData is valid
    if (!formData) {
      console.warn(`⚠️ [${requestId}] Input is null or undefined`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('No input provided for image extraction');
    }
    
    // Get the file from FormData or use the input directly based on type
    let rawFile = null;
    
    if (typeof formData === 'object' && 'get' in formData && typeof formData.get === 'function') {
      // It's FormData, try to get both 'file' and 'image' fields
      rawFile = formData.get('file') || formData.get('image') || null;
    } else {
      // It's not FormData, use it directly
      rawFile = formData;
    }
    
    // Enhanced debug logging for the file
    const fileInfo = {
      type: typeof rawFile,
      constructor: rawFile?.constructor?.name || 'undefined',
      isNull: rawFile === null,
      isUndefined: rawFile === undefined,
      hasProperties: rawFile ? Object.keys(Object(rawFile)).slice(0, 20) : [],
      isFormDataEntryValue: rawFile !== null && 
                          rawFile !== undefined && 
                          typeof rawFile === 'object' && 
                          'size' in Object(rawFile)
    };
    
    console.log(`📝 [${requestId}] Image file info:`, JSON.stringify(fileInfo, null, 2));
    
    // Early exit if no file is provided
    if (!rawFile) {
      console.warn(`⚠️ [${requestId}] No image file provided in input`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('No image file provided in input');
    }
    
    // Check if it's already a data URL (base64 string)
    if (typeof rawFile === 'string') {
      if (rawFile.startsWith('data:')) {
        console.log(`✅ [${requestId}] Input is already a data URL, using directly`);
        console.log(`📊 [${requestId}] Data URL length: ${rawFile.length} chars`);
        console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
        return rawFile;
      } else if (/^[A-Za-z0-9+/=]+$/.test(rawFile)) {
        // It's a raw base64 string without the data URL prefix
        console.log(`✅ [${requestId}] Input is a raw base64 string, adding data URL prefix`);
        const dataUrl = `data:image/jpeg;base64,${rawFile}`;
        console.log(`📊 [${requestId}] Data URL length: ${dataUrl.length} chars`);
        console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
        return dataUrl;
      }
    }
    
    // Try to determine the file type and size
    let fileType: string = 'unknown';
    let fileSize: number = 0;
    
    // Try to access common properties based on file type
    try {
      const fileAny = rawFile as any;
      
      if (fileAny && typeof fileAny === 'object') {
        // Extract type if available
        if (fileAny.type) {
          fileType = String(fileAny.type);
        }
        
        // Extract size if available
        if (fileAny.size !== undefined) {
          fileSize = Number(fileAny.size);
          
          // Additional validation for empty files
          if (fileSize === 0) {
            console.warn(`⚠️ [${requestId}] File has zero size`);
            console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
            throw new Error('Empty file (zero bytes)');
          }
        }
        
        // For File objects, log name and last modified if available
        if (fileAny.name) {
          console.log(`📄 [${requestId}] File name:`, String(fileAny.name));
        }
      }
    } catch (propError) {
      console.warn(`⚠️ [${requestId}] Error getting file properties:`, propError);
      // Continue - don't throw since we can still try conversion methods
    }
    
    console.log(`📝 [${requestId}] File details - Type: ${fileType}, Size: ${fileSize} bytes`);
    
    // Convert the file to base64 using different methods depending on the file type
    let buffer: Buffer | null = null;
    const conversionSteps: string[] = [];
    const conversionErrors: string[] = [];
    
    // Handle File or Blob with arrayBuffer method
    if (!buffer && rawFile && typeof rawFile === 'object' && 'arrayBuffer' in rawFile && typeof rawFile.arrayBuffer === 'function') {
      conversionSteps.push('Converting File/Blob using arrayBuffer');
      try {
        const bytes = await rawFile.arrayBuffer();
        console.log(`📊 [${requestId}] arrayBuffer returned ${bytes.byteLength} bytes`);
        
        if (bytes && bytes.byteLength > 0) {
          // Safely create buffer - wrap in try/catch to prevent crashes
          try {
            buffer = Buffer.from(new Uint8Array(bytes));
            console.log(`✓ [${requestId}] Successfully converted using arrayBuffer (${bytes.byteLength} bytes)`);
          } catch (bufferError: any) {
            conversionErrors.push(`Buffer.from error: ${bufferError.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] Failed to create Buffer from Uint8Array:`, bufferError);
          }
        } else {
          conversionErrors.push('arrayBuffer method returned empty bytes');
          console.warn(`⚠️ [${requestId}] arrayBuffer method returned empty bytes`);
        }
      } catch (arrayBufferError: any) {
        conversionErrors.push(`arrayBuffer error: ${arrayBufferError.message || 'unknown error'}`);
        console.warn(`⚠️ [${requestId}] arrayBuffer method failed:`, arrayBufferError);
        // Continue to next method
      }
    }
    
    // Handle string input (could be raw base64 without data URL prefix)
    if (!buffer && typeof rawFile === 'string') {
      conversionSteps.push('Converting string to buffer');
      try {
        // Check if it looks like base64 (no data URL prefix)
        if (/^[A-Za-z0-9+/=]+$/.test(rawFile)) {
          try {
            buffer = Buffer.from(rawFile, 'base64');
            console.log(`✓ [${requestId}] Successfully converted string as base64 (${buffer.length} bytes)`);
          } catch (base64Error: any) {
            conversionErrors.push(`Base64 conversion error: ${base64Error.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] Failed to convert string as base64:`, base64Error);
          }
        } else {
          // Try as UTF-8 as a last resort
          buffer = Buffer.from(rawFile, 'utf-8');
          console.log(`⚠️ [${requestId}] Converted string as UTF-8 (not ideal for binary data) (${buffer.length} bytes)`);
        }
      } catch (stringError: any) {
        conversionErrors.push(`String conversion error: ${stringError.message || 'unknown error'}`);
        console.warn(`⚠️ [${requestId}] Failed to convert string to buffer:`, stringError);
      }
    }
    
    // If still no buffer, try other methods or fallback
    if (!buffer) {
      console.error(`❌ [${requestId}] Failed to convert image using all available methods`);
      console.error(`❌ [${requestId}] Attempted methods: ${conversionSteps.join(', ')}`);
      console.error(`❌ [${requestId}] Errors: ${conversionErrors.join('; ')}`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('Failed to convert image to base64 - no conversion method succeeded');
    }
    
    // Log buffer size
    console.log(`📊 [${requestId}] Buffer created with size: ${buffer.length} bytes`);
    
    // Convert buffer to base64
    const base64 = buffer.toString('base64');
    console.log(`📊 [${requestId}] Generated base64 string length: ${base64.length} chars`);
    
    // Determine MIME type - prefer actual file type, but fall back to jpeg if unknown
    const mimeType = fileType !== 'unknown' ? fileType : 'image/jpeg'; 
    console.log(`🔍 [${requestId}] Using MIME type: ${mimeType}`);
    
    // Construct complete data URL with correct MIME type
    const base64Image = `data:${mimeType};base64,${base64}`;
    
    console.log(`✅ [${requestId}] Successfully extracted base64 image (${base64Image.length} total chars)`);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    return base64Image;
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to extract base64 image:`, error);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    throw error;
  }
} 