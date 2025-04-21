import { NextRequest, NextResponse } from 'next/server';
import { isValidAnalysis, normalizeAnalysisResult } from '@/lib/utils/analysisValidator';

export async function GET(request: NextRequest) {
  try {
    // Test case 1: Only required fields
    const testCase1 = {
      description: "Test meal with only required fields",
      nutrients: [
        { name: 'Calories', value: 500, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 20, unit: 'g', isHighlight: true }
      ]
    };
    
    // Test case 2: Missing description (should fail)
    const testCase2 = {
      nutrients: [
        { name: 'Calories', value: 500, unit: 'kcal', isHighlight: true }
      ],
      feedback: ["Test feedback"],
      suggestions: ["Test suggestion"]
    };
    
    // Test case 3: Missing nutrients (should fail)
    const testCase3 = {
      description: "Test meal with missing nutrients",
      feedback: ["Test feedback"],
      suggestions: ["Test suggestion"]
    };
    
    // Test case 4: With all fields
    const testCase4 = {
      description: "Complete test meal",
      nutrients: [
        { name: 'Calories', value: 500, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 20, unit: 'g', isHighlight: true }
      ],
      feedback: ["Test feedback"],
      suggestions: ["Test suggestion"],
      modelInfo: {
        model: "test-model",
        usedFallback: false,
        ocrExtracted: true
      }
    };
    
    // Validate each test case
    const results = {
      testCase1: {
        isValid: isValidAnalysis(testCase1),
        normalized: normalizeAnalysisResult(testCase1)
      },
      testCase2: {
        isValid: isValidAnalysis(testCase2),
        normalized: normalizeAnalysisResult(testCase2)
      },
      testCase3: {
        isValid: isValidAnalysis(testCase3),
        normalized: normalizeAnalysisResult(testCase3)
      },
      testCase4: {
        isValid: isValidAnalysis(testCase4),
        normalized: normalizeAnalysisResult(testCase4)
      }
    };
    
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Error in validator test endpoint:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
} 