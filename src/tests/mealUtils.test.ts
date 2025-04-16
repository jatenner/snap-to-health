import { trySaveMeal } from '../lib/mealUtils';
import * as mealUtils from '../lib/mealUtils';

// Mock the Firestore functionality
jest.mock('../lib/mealUtils', () => {
  const originalModule = jest.requireActual('../lib/mealUtils');
  return {
    ...originalModule,
    saveMealToFirestore: jest.fn(),
  };
});

// Mock console methods to reduce noise in test output
console.warn = jest.fn();
console.error = jest.fn();
console.log = jest.fn();

describe('trySaveMeal', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return success when meal is saved successfully', async () => {
    // Mock implementation for successful save
    const mockMealId = 'test-meal-id-123';
    (mealUtils.saveMealToFirestore as jest.Mock).mockResolvedValueOnce(mockMealId);

    // Test inputs
    const mockAnalysis = { 
      success: true, 
      fallback: false,
      description: 'Test meal',
      nutrients: []
    };
    const mockImageUrl = 'https://example.com/test-image.jpg';
    const mockUserId = 'test-user-123';
    const mockMealName = 'Test Meal';

    // Call function
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: mockAnalysis,
      imageUrl: mockImageUrl,
      mealName: mockMealName,
      requestId: 'test-request',
      timeout: 1000
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.savedMealId).toBe(mockMealId);
    expect(mealUtils.saveMealToFirestore).toHaveBeenCalledWith(
      mockUserId, 
      mockImageUrl, 
      mockAnalysis, 
      mockMealName
    );
    expect(result.error).toBeUndefined();
    expect(result.timeoutTriggered).toBeUndefined();
  });

  test('should handle missing userId', async () => {
    // Test inputs with missing userId
    const mockAnalysis = { success: true, fallback: false };
    const mockImageUrl = 'https://example.com/test-image.jpg';

    // Call function
    const result = await trySaveMeal({
      userId: '', // Empty userId
      analysis: mockAnalysis,
      imageUrl: mockImageUrl,
      requestId: 'test-request'
    });

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('Authentication required');
    expect(mealUtils.saveMealToFirestore).not.toHaveBeenCalled();
  });

  test('should reject when analysis has fallback enabled', async () => {
    // Test inputs with fallback in analysis
    const mockAnalysis = { success: true, fallback: true };
    const mockImageUrl = 'https://example.com/test-image.jpg';
    const mockUserId = 'test-user-123';

    // Call function
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: mockAnalysis,
      imageUrl: mockImageUrl,
      requestId: 'test-request'
    });

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('Cannot save insufficient analysis results');
    expect(mealUtils.saveMealToFirestore).not.toHaveBeenCalled();
  });

  test('should reject when analysis is not successful', async () => {
    // Test inputs with unsuccessful analysis
    const mockAnalysis = { success: false, fallback: false };
    const mockImageUrl = 'https://example.com/test-image.jpg';
    const mockUserId = 'test-user-123';

    // Call function
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: mockAnalysis,
      imageUrl: mockImageUrl,
      requestId: 'test-request'
    });

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('Cannot save insufficient analysis results');
    expect(mealUtils.saveMealToFirestore).not.toHaveBeenCalled();
  });

  test('should generate placeholder URL when imageUrl is missing', async () => {
    // Mock implementation for successful save
    const mockMealId = 'test-meal-id-123';
    (mealUtils.saveMealToFirestore as jest.Mock).mockResolvedValueOnce(mockMealId);

    // Test inputs with missing imageUrl
    const mockAnalysis = { success: true, fallback: false };
    const mockUserId = 'test-user-123';

    // Call function
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: mockAnalysis,
      imageUrl: '', // Empty imageUrl
      requestId: 'test-request'
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.savedMealId).toBe(mockMealId);
    expect(mealUtils.saveMealToFirestore).toHaveBeenCalledTimes(1);
    
    // Check that the first parameter is userId, and second contains placeholder URL
    const saveMealCall = (mealUtils.saveMealToFirestore as jest.Mock).mock.calls[0];
    expect(saveMealCall[0]).toBe(mockUserId);
    expect(saveMealCall[1]).toContain('https://storage.googleapis.com/snaphealth-39b14.appspot.com/placeholder-meal');
  });

  test('should handle Firestore save errors', async () => {
    // Mock implementation for a failed save
    const mockError = new Error('Firestore error');
    (mealUtils.saveMealToFirestore as jest.Mock).mockRejectedValueOnce(mockError);

    // Test inputs
    const mockAnalysis = { success: true, fallback: false };
    const mockImageUrl = 'https://example.com/test-image.jpg';
    const mockUserId = 'test-user-123';

    // Call function
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: mockAnalysis,
      imageUrl: mockImageUrl,
      requestId: 'test-request'
    });

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toEqual(mockError);
    expect(mealUtils.saveMealToFirestore).toHaveBeenCalledTimes(1);
  });

  test('should handle timeout during save operation', async () => {
    // Mock implementation that never resolves (simulates timeout)
    (mealUtils.saveMealToFirestore as jest.Mock).mockImplementationOnce(() => {
      return new Promise((resolve) => {
        // This promise is intentionally not resolved to trigger timeout
        setTimeout(() => resolve('this-will-never-happen'), 5000);
      });
    });

    // Test inputs
    const mockAnalysis = { success: true, fallback: false };
    const mockImageUrl = 'https://example.com/test-image.jpg';
    const mockUserId = 'test-user-123';

    // Call function with short timeout
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: mockAnalysis,
      imageUrl: mockImageUrl,
      requestId: 'test-request',
      timeout: 10 // Very short timeout to speed up test
    });

    // Assertions
    expect(result.success).toBe(false);
    expect(result.timeoutTriggered).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('timed out after');
    expect(mealUtils.saveMealToFirestore).toHaveBeenCalledTimes(1);
  });

  test('should reject invalid analysis object', async () => {
    // Test inputs with invalid analysis (null)
    const mockUserId = 'test-user-123';
    const mockImageUrl = 'https://example.com/test-image.jpg';

    // Call function with null analysis
    const result = await trySaveMeal({
      userId: mockUserId,
      analysis: null as any, // Force type to bypass TypeScript check
      imageUrl: mockImageUrl,
      requestId: 'test-request'
    });

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('Cannot save meal with invalid analysis data');
    expect(mealUtils.saveMealToFirestore).not.toHaveBeenCalled();
  });
}); 