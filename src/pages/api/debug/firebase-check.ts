import { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';

interface DebugResult {
  success: boolean;
  timestamp: string;
  environment: string;
  privateKeyCheck: {
    base64KeyPresent: boolean;
    base64KeyLength?: number;
    decodedKeyValid?: boolean;
    hasPemHeader?: boolean;
    hasPemFooter?: boolean;
    hasNewlines?: boolean;
    newlineCount?: number;
    error?: string;
  };
  firebaseConnection: {
    adminInitialized: boolean;
    firestoreConnected: boolean;
    error?: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow this endpoint in development or with proper authorization
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const result: DebugResult = {
    success: false,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    privateKeyCheck: {
      base64KeyPresent: false,
    },
    firebaseConnection: {
      adminInitialized: false,
      firestoreConnected: false,
    }
  };

  // Check the private key
  try {
    const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    result.privateKeyCheck.base64KeyPresent = !!privateKeyBase64;
    
    if (privateKeyBase64) {
      result.privateKeyCheck.base64KeyLength = privateKeyBase64.length;

      // Decode and validate
      const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
      const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
      const hasNewlines = decodedKey.includes('\n');
      const newlineCount = (decodedKey.match(/\n/g) || []).length;
      
      result.privateKeyCheck.decodedKeyValid = hasPemHeader && hasPemFooter && hasNewlines;
      result.privateKeyCheck.hasPemHeader = hasPemHeader;
      result.privateKeyCheck.hasPemFooter = hasPemFooter;
      result.privateKeyCheck.hasNewlines = hasNewlines;
      result.privateKeyCheck.newlineCount = newlineCount;
    }
  } catch (error: any) {
    result.privateKeyCheck.error = error.message;
  }

  // Check Firebase Admin initialization
  try {
    result.firebaseConnection.adminInitialized = !!adminDb;

    if (adminDb) {
      // Try a simple Firestore operation
      await adminDb.collection('test').limit(1).get();
      result.firebaseConnection.firestoreConnected = true;
      result.success = true;
    }
  } catch (error: any) {
    result.firebaseConnection.error = error.message;
  }

  return res.status(200).json(result);
} 