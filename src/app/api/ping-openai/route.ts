import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET(request: NextRequest) {
  try {
    // Initialize OpenAI client with API key from environment
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Try to list models to verify the API key works
    await openai.models.list();
    
    // If successful, return ok: true
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // If there's an error, return the error message
    console.error('OpenAI API ping failed:', err.message);
    return NextResponse.json({ 
      ok: false, 
      error: err.message,
      status: err.status || 500
    }, { status: 500 });
  }
} 