#!/bin/bash

# Fix for the 500 error in analyzeImage route.ts when invalid images are uploaded
echo "Fixing image validation in analyzeImage endpoint"

# Create backup
cp src/app/api/analyzeImage/route.ts src/app/api/analyzeImage/route.ts.backup-$(date +%Y%m%d%H%M%S)

# Add _meta object to POST handler response initialization
sed -i '' 's/errorDetails: \[\]/errorDetails: \[\]\n    },\n    _meta: {\n      imageError: null  \/\/ Add this to track image-related errors/g' src/app/api/analyzeImage/route.ts

# Fix the image extraction try/catch block to handle null inputs gracefully
sed -i '' 's/base64Image = await extractBase64Image(rawFile, requestId);/try {\n        base64Image = await extractBase64Image(rawFile, requestId);\n      } catch (conversionError) {\n        const error = `Image could not be converted to base64: ${conversionError?.message || "Unknown conversion error"}`;\n        console.error(`❌ [${requestId}] ${error}`);\n        responseData._meta.imageError = error;\n        responseData.errors.push(error);\n        responseData.debug.errorDetails.push({ step: "image_extraction", error, details: conversionError });\n        responseData.message = error;\n        \
        return createAnalysisResponse({\n          ...responseData,\n          success: false,\n          fallback: true,\n          analysis: createEmptyFallbackAnalysis()\n        });\n      }/g' src/app/api/analyzeImage/route.ts

# Update the !base64Image check to return a proper response
sed -i '' '/if (!base64Image) {/,/}/c\
      if (!base64Image) {\
        const error = "Failed to extract valid image data";\
        responseData.errors.push(error);\
        responseData.debug.errorDetails.push({ step: "image_extraction", error });\
        responseData.message = "Failed to extract valid image data";\
        responseData._meta.imageError = error;\
        \
        console.error(`❌ [${requestId}] ${error}`);\
        return createAnalysisResponse({\
          ...responseData,\
          success: false,\
          fallback: true,\
          analysis: createEmptyFallbackAnalysis()\
        });\
      }' src/app/api/analyzeImage/route.ts

# Fix the main try/catch block to always return valid JSON
sed -i '' 's/} catch (error: any) {/} catch (error: any) {\
    \/\/ Catch-all for any unexpected errors during processing\
    const fatalError = `Fatal error in analysis API: ${error?.message || "Unknown error"}`;\
    \
    \/\/ Always return a structured response, even for fatal errors\
    return createAnalysisResponse({\
      status: 200,\
      success: false,\
      requestId,\
      message: "An unexpected error occurred",\
      errors: [fatalError],\
      debug: {\
        requestId,\
        errorDetails: [{ \
          step: "fatal_error", \
          error: fatalError, \
          details: error?.stack || error \
        }]\
      },\
      _meta: {\
        imageError: fatalError\
      },\
      fallback: true,\
      analysis: createEmptyFallbackAnalysis()\
    });\
/g' src/app/api/analyzeImage/route.ts

echo "Fixed image validation in analyzeImage endpoint" 