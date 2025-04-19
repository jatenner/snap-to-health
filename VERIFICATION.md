# OCR-based Meal Analysis - Verification Guide

This guide will help you verify that the OCR-based meal analysis pipeline is working correctly after deployment.

## Prerequisites

Ensure your environment is properly configured with:

- Valid OpenAI API key for text models (GPT-4o) in `.env.local`
- Nutritionix API credentials in `.env.local`
- Firebase production credentials in `.env.local`
- Proper configuration of environment variables in Vercel

## Test Cases for Verification

### 1. Simple Text Image Upload

**Test**: Upload a simple image with clear text describing food items.

**Expected Behavior**:
- OCR should extract the text
- Text should be analyzed to identify food items
- Nutritionix API should return nutritional data
- Results should show a detailed analysis with:
  - Identified ingredients
  - Nutritional breakdown
  - Feedback based on health goals
  - Goal-specific score

### 2. Complex Meal Image

**Test**: Upload an image of a complex meal with multiple ingredients.

**Expected Behavior**:
- OCR should extract available text or use fallback
- Analysis should identify multiple ingredients
- Results should display a complete nutritional analysis
- Feedback should be relevant to the identified food items

### 3. Error Handling

**Test**: Upload a non-food image or an image with no text.

**Expected Behavior**:
- System should gracefully handle the situation
- Fallback text extraction should be used
- User should receive meaningful feedback
- Should not crash or display technical errors

## Verification Checklist

- [ ] Image upload works without errors
- [ ] OCR text extraction produces usable results
- [ ] Food item identification works from extracted text
- [ ] Nutritionix API returns nutritional data
- [ ] Analysis results are displayed correctly
- [ ] User's health goals are incorporated into feedback
- [ ] Application handles errors gracefully
- [ ] Response times are acceptable (under 30 seconds)
- [ ] Saving to Firebase works properly (for logged-in users)

## Understanding Logs

Key log indicators to verify proper functioning:

1. `🔍 [requestId] Running OCR to extract text from image`
2. `✅ [requestId] OCR successful, extracted X characters`
3. `🔍 [requestId] Analyzing extracted text to identify meal components`
4. `🔍 [requestId] Getting nutrition data for identified ingredients`
5. `✅ [requestId] Nutrition data retrieved successfully`

If you see fallback messages like:
- `⚠️ [requestId] Using fallback OCR text due to...`

This indicates the fallback system is working as expected in challenging cases. 