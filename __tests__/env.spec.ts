import { assertFirebasePrivateKey } from '../src/utils/validateEnv';

describe('Environment Variable Validation', () => {
  // Store original environment variables
  const originalEnv = { ...process.env };
  
  // Reset environment variables after each test
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  
  describe('assertFirebasePrivateKey', () => {
    it('should pass with a valid Firebase private key in Base-64 format', () => {
      // Valid PEM private key in Base-64 format (this is a mock example, not a real key)
      const mockValidKey = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSXR3SUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NBbTh3Z2dKckFnRUFBb0lDQVFEYnFIWGJuOVNFCmN1NHdPbnJNaU1uTUlsbVU0a0Z0NnNKZVc3cDN3aytOem52YWN2c0gra1FNR3FLWWtPUHd1MkE0WHVVTy9BazMKcVhCOVBFYlpnZHkrY0pKbzF0YmV3RXBPNTQvZS9QQnZTY1NjVjcrWDJQTTNTa0FRcjlDZFZ6bE05UFJ4WnNRbApGLzc3Y3dUdmJ5UkJibnFieDYyQkZhRzlUeVNqVGlBWXhNQitYUWRCcmFDUU5SeWhNeVlXV3BsL2dkNzhuVHFMCnBLZlFQZnJXejZxL1FOVHByeUhsa3UxUzNmdUNPTnhMOWlrbGhYNWx0TGJoUUx6K0JUSGJyRlUxVjlJajBoRXUKQ1o1SzZnbHhkOWVXcW9YMDBabVVQUVFxbzd0Wnd4M1JtdmRFbVc5V0xMR3N1bmwrTW10eVJTbDlLWGZiQUF1OApXMWxGOWx0UStFOEZxckE2RnJ3UEJWWnFTT3Jma2NMMXR0b3FrbFlxOHhPL3p5WU5iZEVRRWVhTWIrY1NjWDk5CnRQVGNyK3Iwdk96Y2N0ZjI5K3dQZWlMQWtPOUVqTXB2Z2xBTVNnaldlOXZ5QTFyY0xUcXNudStRb0pqOUhodm8KOWcrODdBS29aRWdVWW5QK1dkeEMzbFhVSjhXT0JxcldnQVhrbjVGbzZvL2hEQUVDQXdFQUFRSkJBSmZaQjQ1Ngp1aGdyeGNkZEM0TUcK'
      
      // Set the environment variable
      process.env.FIREBASE_PRIVATE_KEY_BASE64 = mockValidKey;
      
      // Assertion should not throw
      expect(() => assertFirebasePrivateKey()).not.toThrow();
      expect(assertFirebasePrivateKey()).toBe(true);
    });
    
    it('should throw an error if FIREBASE_PRIVATE_KEY_BASE64 is missing', () => {
      // Clear the environment variable
      delete process.env.FIREBASE_PRIVATE_KEY_BASE64;
      
      // Assertion should throw with specific message
      expect(() => assertFirebasePrivateKey()).toThrow(
        'Missing FIREBASE_PRIVATE_KEY_BASE64 environment variable'
      );
    });
    
    it('should throw an error if FIREBASE_PRIVATE_KEY_BASE64 is empty', () => {
      // Set an empty environment variable
      process.env.FIREBASE_PRIVATE_KEY_BASE64 = '';
      
      // Assertion should throw with specific message
      expect(() => assertFirebasePrivateKey()).toThrow(
        'Missing FIREBASE_PRIVATE_KEY_BASE64 environment variable'
      );
    });
    
    it('should throw an error if the Base-64 string is invalid', () => {
      // Set an invalid Base-64 string
      process.env.FIREBASE_PRIVATE_KEY_BASE64 = 'This is not a valid Base-64 string!';
      
      // Assertion should throw
      expect(() => assertFirebasePrivateKey()).toThrow(
        'Failed to decode FIREBASE_PRIVATE_KEY_BASE64'
      );
    });
    
    it('should throw an error if the decoded key is not in PEM format', () => {
      // Set a valid Base-64 string but not a PEM key
      process.env.FIREBASE_PRIVATE_KEY_BASE64 = Buffer.from('This is just some random text, not a PEM key').toString('base64');
      
      // Assertion should throw with specific message
      expect(() => assertFirebasePrivateKey()).toThrow(
        'The decoded FIREBASE_PRIVATE_KEY_BASE64 is not in valid PEM format'
      );
    });
    
    it('should throw an error if the decoded key is too short', () => {
      // Create a short PEM-like string
      const shortKey = '-----BEGIN PRIVATE KEY-----\nTooShort\n-----END PRIVATE KEY-----';
      process.env.FIREBASE_PRIVATE_KEY_BASE64 = Buffer.from(shortKey).toString('base64');
      
      // Assertion should throw with specific message
      expect(() => assertFirebasePrivateKey()).toThrow(
        'The decoded FIREBASE_PRIVATE_KEY_BASE64 appears to be too short'
      );
    });
    
    // Test with the actual key from the environment
    it('should validate the actual Firebase key from the environment if available', () => {
      // Skip this test if there's no key in the environment
      if (!originalEnv.FIREBASE_PRIVATE_KEY_BASE64) {
        console.warn('Skipping test: No FIREBASE_PRIVATE_KEY_BASE64 found in environment');
        return;
      }
      
      // Reset to the actual environment variable
      process.env.FIREBASE_PRIVATE_KEY_BASE64 = originalEnv.FIREBASE_PRIVATE_KEY_BASE64;
      
      // Assertion should not throw with the actual key
      expect(() => assertFirebasePrivateKey()).not.toThrow();
    });
  });
}); 