import { getAuth } from 'firebase/auth';

/**
 * Checks if the current environment should use the Firestore proxy
 * @returns boolean indicating if the proxy should be used
 */
export const shouldUseFirestoreProxy = (): boolean => {
  // Only use proxy in development mode and on specific local ports
  return (
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    (
      window.location.origin.includes('localhost:3000') ||
      window.location.origin.includes('localhost:3001') ||
      window.location.origin.includes('localhost:3002') ||
      window.location.origin.includes('localhost:3003') ||
      window.location.origin.includes('localhost:3004') ||
      window.location.origin.includes('localhost:3005') ||
      window.location.origin.includes('localhost:3006') ||
      window.location.origin.includes('localhost:3007') ||
      window.location.origin.includes('localhost:3008') ||
      window.location.origin.includes('localhost:3009') ||
      window.location.origin.includes('localhost:3010')
    )
  );
};

/**
 * Gets the base URL for Firestore API calls
 * @returns The appropriate base URL (proxy or direct)
 */
export const getFirestoreBaseUrl = (): string => {
  if (shouldUseFirestoreProxy()) {
    return '/api/proxy/firestore';
  }
  
  // Use direct Firestore API in production
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
};

/**
 * Get a document from Firestore using the proxy when needed
 * @param collection The collection path
 * @param docId The document ID
 * @param options Additional query options
 * @returns The document data
 */
export const getDocument = async (
  collection: string,
  docId: string,
  options: Record<string, any> = {}
): Promise<any> => {
  try {
    // Get current user's ID token if authenticated
    const auth = getAuth();
    const user = auth.currentUser;
    let token = '';
    
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error('Error getting user token:', error);
      }
    }
    
    // Build the path
    const path = `${collection}/${docId}`;
    
    // Use proxy in development on localhost
    if (shouldUseFirestoreProxy()) {
      const proxyUrl = new URL('/api/proxy/firestore', window.location.origin);
      proxyUrl.searchParams.append('path', path);
      
      if (Object.keys(options).length > 0) {
        proxyUrl.searchParams.append('options', JSON.stringify(options));
      }
      
      const response = await fetch(proxyUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get document: ${response.statusText}`);
      }
      
      return await response.json();
    } else {
      // Direct API call for production
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get document: ${response.statusText}`);
      }
      
      return await response.json();
    }
  } catch (error) {
    console.error('Error in getDocument:', error);
    throw error;
  }
};

/**
 * Create a document in Firestore using the proxy when needed
 * @param collection The collection path
 * @param data The document data
 * @param docId Optional document ID (if not provided, Firestore will generate one)
 * @returns The created document data
 */
export const createDocument = async (
  collection: string,
  data: Record<string, any>,
  docId?: string
): Promise<any> => {
  try {
    // Get current user's ID token if authenticated
    const auth = getAuth();
    const user = auth.currentUser;
    let token = '';
    
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error('Error getting user token:', error);
      }
    }
    
    // Build the path
    const path = docId ? `${collection}/${docId}` : collection;
    
    // Convert data to Firestore format
    const firestoreData = convertToFirestoreFormat(data);
    
    // Use proxy in development on localhost
    if (shouldUseFirestoreProxy()) {
      const proxyUrl = new URL('/api/proxy/firestore', window.location.origin);
      proxyUrl.searchParams.append('path', path);
      
      const response = await fetch(proxyUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(firestoreData)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create document: ${response.statusText}`);
      }
      
      return await response.json();
    } else {
      // Direct API call for production
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(firestoreData)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create document: ${response.statusText}`);
      }
      
      return await response.json();
    }
  } catch (error) {
    console.error('Error in createDocument:', error);
    throw error;
  }
};

/**
 * Update a document in Firestore using the proxy when needed
 * @param collection The collection path
 * @param docId The document ID
 * @param data The document data to update
 * @returns The updated document data
 */
export const updateDocument = async (
  collection: string,
  docId: string,
  data: Record<string, any>
): Promise<any> => {
  try {
    // Get current user's ID token if authenticated
    const auth = getAuth();
    const user = auth.currentUser;
    let token = '';
    
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error('Error getting user token:', error);
      }
    }
    
    // Build the path
    const path = `${collection}/${docId}`;
    
    // Convert data to Firestore format
    const firestoreData = convertToFirestoreFormat(data);
    
    // Use proxy in development on localhost
    if (shouldUseFirestoreProxy()) {
      const proxyUrl = new URL('/api/proxy/firestore', window.location.origin);
      proxyUrl.searchParams.append('path', path);
      
      const response = await fetch(proxyUrl.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          fields: firestoreData.fields,
          // Include standard Firestore update mask
          updateMask: {
            fieldPaths: Object.keys(data)
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update document: ${response.statusText}`);
      }
      
      return await response.json();
    } else {
      // Direct API call for production
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          fields: firestoreData.fields,
          // Include standard Firestore update mask
          updateMask: {
            fieldPaths: Object.keys(data)
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update document: ${response.statusText}`);
      }
      
      return await response.json();
    }
  } catch (error) {
    console.error('Error in updateDocument:', error);
    throw error;
  }
};

/**
 * Delete a document in Firestore using the proxy when needed
 * @param collection The collection path
 * @param docId The document ID
 * @returns Success status
 */
export const deleteDocument = async (
  collection: string,
  docId: string
): Promise<boolean> => {
  try {
    // Get current user's ID token if authenticated
    const auth = getAuth();
    const user = auth.currentUser;
    let token = '';
    
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error('Error getting user token:', error);
      }
    }
    
    // Build the path
    const path = `${collection}/${docId}`;
    
    // Use proxy in development on localhost
    if (shouldUseFirestoreProxy()) {
      const proxyUrl = new URL('/api/proxy/firestore', window.location.origin);
      proxyUrl.searchParams.append('path', path);
      
      const response = await fetch(proxyUrl.toString(), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }
      
      return true;
    } else {
      // Direct API call for production
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }
      
      return true;
    }
  } catch (error) {
    console.error('Error in deleteDocument:', error);
    throw error;
  }
};

/**
 * Helper function to convert JavaScript objects to Firestore format
 * @param data The data to convert
 * @returns Firestore formatted data
 */
export const convertToFirestoreFormat = (data: Record<string, any>): any => {
  const fields: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    fields[key] = convertValueToFirestoreValue(value);
  }
  
  return { fields };
};

/**
 * Convert a JavaScript value to Firestore value format
 * @param value The value to convert
 * @returns Firestore formatted value
 */
const convertValueToFirestoreValue = (value: any): any => {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value };
  }
  
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(item => convertValueToFirestoreValue(item))
      }
    };
  }
  
  if (typeof value === 'object') {
    const fields: Record<string, any> = {};
    
    for (const [k, v] of Object.entries(value)) {
      fields[k] = convertValueToFirestoreValue(v);
    }
    
    return { mapValue: { fields } };
  }
  
  // Default to string if unknown type
  return { stringValue: String(value) };
};

// Helper to create a Firestore proxy URL
export const getFirestoreProxyUrl = (path: string, method: string = 'GET'): string => {
  if (!shouldUseFirestoreProxy()) {
    // Default Firebase URL format
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  }

  // For development: Use our own proxy endpoint
  return `/api/proxy/firestore?path=${encodeURIComponent(path)}&method=${method}`;
}; 