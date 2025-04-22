// Simple test endpoint for OpenAI API using Pages API which doesn't require middleware
// or additional configuration to bypass Vercel authentication

export default async function handler(req, res) {
  // Log the request for debugging
  console.log('OpenAI test endpoint called');
  
  try {
    // Check if OpenAI key is set
    const openAIApiKey = process.env.OPENAI_API_KEY;
    
    if (!openAIApiKey) {
      console.error('Missing OpenAI API key');
      return res.status(500).json({
        error: 'Server configuration error: Missing API credentials',
        success: false
      });
    }
    
    // Import OpenAI from outside to avoid issues with Next.js
    const { OpenAI } = await import('openai');
    
    // Initialize OpenAI client with API key
    const openai = new OpenAI({
      apiKey: openAIApiKey,
    });
    
    // Make a simple API call to verify the key works
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Say 'The OpenAI API key is working correctly' in one sentence"
        }
      ],
      max_tokens: 20
    });
    
    const result = response.choices[0]?.message?.content || "No response";
    
    return res.status(200).json({
      result,
      success: true,
      apiKeyPrefix: openAIApiKey.substring(0, 8) + "...",
      apiKeyLength: openAIApiKey.length,
      isProjKey: openAIApiKey.startsWith('sk-proj-'),
      isOrgKey: openAIApiKey.startsWith('sk-org-'),
      model: "gpt-3.5-turbo"
    });
  } catch (error) {
    console.error('API key test failed:', error.message);
    
    // Determine if this is an authentication error
    const isAuthError = error.status === 401 || 
                       (error.message && error.message.includes('auth')) ||
                       (error.message && error.message.includes('API key'));
    
    return res.status(isAuthError ? 401 : 500).json({ 
      error: `OpenAI API test failed: ${error.message}`,
      success: false,
      isAuthError
    });
  }
} 