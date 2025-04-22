import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'jest-fetch-mock';

// Mock the function to avoid actual API calls during testing
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data) => ({ ...data })),
  },
}));

// Mock uuid to provide predictable request IDs
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-request-id'),
}));

// Setup fetch mock
beforeAll(() => {
  fetch.enableMocks();
});

beforeEach(() => {
  fetch.resetMocks();
  jest.clearAllMocks();
});

// Import the function after setting up all mocks
import { analyzeWithGPT4Vision } from '@/lib/gptVision';

describe('analyzeWithGPT4Vision', () => {
  const mockBase64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const mockHealthGoal = 'general health';
  const mockRequestId = 'test-request-id';
  
  it('should successfully analyze an image', async () => {
    // Mock successful API response
    const mockApiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              description: 'A healthy salad',
              ingredientList: ['lettuce', 'tomato'],
              detailedIngredients: [
                { name: 'lettuce', category: 'vegetable', confidence: 9.0 },
                { name: 'tomato', category: 'vegetable', confidence: 8.5 }
              ],
              confidence: 8.5,
              basicNutrition: {
                calories: '150',
                protein: '5g',
                carbs: '20g',
                fat: '7g'
              },
              goalImpactScore: 8,
              goalName: "General Health",
              scoreExplanation: "This meal is healthy",
              positiveFoodFactors: ["High in fiber"],
              negativeFoodFactors: [],
              feedback: ["Great choice"],
              suggestions: ["Add some protein"],
              imageChallenges: []
            })
          }
        }
      ]
    };

    fetch.mockResponseOnce(JSON.stringify(mockApiResponse));
    
    // Call the function
    const result = await analyzeWithGPT4Vision(mockBase64Image, mockHealthGoal, mockRequestId);
    
    // Assertions
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions', 
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: expect.any(String),
        signal: expect.any(Object)
      })
    );
    
    // Check result structure
    expect(result).toMatchObject({
      description: 'A healthy salad',
      ingredientList: expect.arrayContaining(['lettuce', 'tomato']),
      confidence: 8.5,
      reasoningLogs: expect.any(Array)
    });
  });

  it('should handle API errors and retry', async () => {
    // First call fails
    fetch.mockRejectOnce(new Error('API Error'));
    
    // Second call succeeds
    const mockApiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              description: 'A healthy salad',
              ingredientList: ['lettuce', 'tomato'],
              confidence: 7.0,
            })
          }
        }
      ]
    };
    fetch.mockResponseOnce(JSON.stringify(mockApiResponse));
    
    const result = await analyzeWithGPT4Vision(mockBase64Image, mockHealthGoal, mockRequestId);
    
    // Assertions
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      description: 'A healthy salad',
      confidence: 7.0,
    });
  });

  it('should handle malformed JSON responses', async () => {
    // Mock API response with malformed JSON
    const mockApiResponse = {
      choices: [
        {
          message: {
            content: 'Not a valid JSON { "description": broken json'
          }
        }
      ]
    };
    fetch.mockResponseOnce(JSON.stringify(mockApiResponse));
    
    const result = await analyzeWithGPT4Vision(mockBase64Image, mockHealthGoal, mockRequestId);
    
    // Assertions - function should extract JSON using regex or create fallback structure
    expect(result).toBeDefined();
    expect(result).toHaveProperty('reasoningLogs');
  });

  it('should handle timeout gracefully', async () => {
    // Simulate timeout by never resolving the promise
    fetch.mockImplementationOnce(() => new Promise((resolve) => {
      // This promise won't resolve during the test
      setTimeout(resolve, 60000);
    }));
    
    // We need to mock AbortController for this test
    const mockAbort = jest.fn();
    global.AbortController = jest.fn().mockImplementation(() => ({
      signal: {},
      abort: mockAbort
    }));
    
    try {
      await analyzeWithGPT4Vision(mockBase64Image, mockHealthGoal, mockRequestId);
    } catch (error) {
      expect(error).toBeDefined();
      expect(mockAbort).toHaveBeenCalled();
    }
  });
}); 