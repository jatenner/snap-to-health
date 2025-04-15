'use client';

import { doc, getDoc, setDoc, updateDoc, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Creates a default user profile
 */
const createDefaultProfile = (userId: string) => {
  return {
    userId,
    healthGoal: 'Improve Sleep',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

/**
 * Fetches the current user's profile from Firestore
 * Creates a default profile if none exists
 */
export const getUserProfile = async (userId: string) => {
  if (!userId) return null;
  
  if (!db) {
    console.error('Firebase Firestore is not initialized');
    return null;
  }
  
  try {
    const userRef = doc(db as Firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data();
    } else {
      // Create a default profile if none exists
      const defaultProfile = createDefaultProfile(userId);
      await setDoc(userRef, defaultProfile);
      console.log('Created default profile for user', userId);
      return defaultProfile;
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    // Return a fallback profile rather than null to prevent UI issues
    return createDefaultProfile(userId);
  }
};

/**
 * Creates or updates a user profile in Firestore
 */
export const updateUserProfile = async (userId: string, data: any) => {
  if (!userId) return false;
  
  if (!db) {
    console.error('Firebase Firestore is not initialized');
    return false;
  }
  
  try {
    const userRef = doc(db as Firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      // Update existing profile
      await updateDoc(userRef, {
        ...data,
        updatedAt: new Date()
      });
    } else {
      // Create new profile
      await setDoc(userRef, {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
};

/**
 * Gets the current user's health goal from their profile
 */
export const getUserHealthGoal = async (userId: string) => {
  if (!userId) return 'Improve Sleep';
  
  if (!db) {
    console.error('Firebase Firestore is not initialized');
    return 'Improve Sleep';
  }
  
  try {
    const profile = await getUserProfile(userId);
    return profile?.healthGoal || 'Improve Sleep';
  } catch (error) {
    console.error('Error getting user health goal:', error);
    return 'Improve Sleep';
  }
}; 