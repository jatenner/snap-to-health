'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { FaLeaf, FaBalanceScale, FaHeart } from 'react-icons/fa';

export default function Home() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate a short loading time for the zen experience
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);
    
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="animate-gentle-float">
          <FaLeaf className="text-primary text-4xl mb-4" />
        </div>
        <p className="text-stone text-lg animate-fade-in">Centering your wellness journey...</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-4xl space-y-8 animate-fade-in">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary mb-4 animate-breath">
            Welcome to Your Path of Nourishment
          </h1>
          <p className="text-stone text-lg max-w-2xl mx-auto">
            Discover the harmony between what you eat and how you feel. 
            Each meal is an opportunity for mindfulness and nourishment on your wellness journey.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-sand/40 p-6 rounded-xl shadow-zen animate-slide-up" style={{animationDelay: '0.1s'}}>
            <div className="flex items-center mb-4">
              <FaLeaf className="text-leaf text-2xl mr-3" />
              <h3 className="text-xl font-medium text-primary">Listen to Your Body</h3>
            </div>
            <p className="text-stone">Tune into what your body truly needs and discover foods that bring balance to your unique constitution.</p>
          </div>
          
          <div className="bg-sand/40 p-6 rounded-xl shadow-zen animate-slide-up" style={{animationDelay: '0.2s'}}>
            <div className="flex items-center mb-4">
              <FaBalanceScale className="text-water text-2xl mr-3" />
              <h3 className="text-xl font-medium text-primary">Find Your Balance</h3>
            </div>
            <p className="text-stone">Create harmony between nourishment, movement, and rest to support your body's natural wisdom.</p>
          </div>
          
          <div className="bg-sand/40 p-6 rounded-xl shadow-zen animate-slide-up" style={{animationDelay: '0.3s'}}>
            <div className="flex items-center mb-4">
              <FaHeart className="text-blossom text-2xl mr-3" />
              <h3 className="text-xl font-medium text-primary">Nourish with Intention</h3>
            </div>
            <p className="text-stone">Each meal is a chance to honor your body with foods that fuel your purpose and support your wellness journey.</p>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-center gap-4 animate-fade-in" style={{animationDelay: '0.6s'}}>
          <Link href="/upload" className="px-8 py-3 bg-primary text-background rounded-lg shadow-leaf hover:bg-leaf transition-all duration-300 text-center">
            Begin Your Mindful Journey
          </Link>
          <Link href="/login" className="px-8 py-3 border border-primary text-primary rounded-lg hover:bg-sand/30 transition-all duration-300 text-center">
            Sign In to Your Path
          </Link>
        </div>
      </div>
    </main>
  );
} 