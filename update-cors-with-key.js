const admin = require('firebase-admin');
const fs = require('fs');

// Extract service account info from .env.local
const serviceAccount = {
  "type": "service_account",
  "project_id": "snaphealth-39b14",
  "private_key_id": "fbsvc", // This is just a placeholder
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDQZcwJq5xXsN9T\n0pJ5HvQllCAqO+zPIKGa7BGpz4YEf7BQ6CvrVYR2QVT9FNMJ5i2rR8mQixy7p/CA\n093Lfv1xhQe8aGcjxdC/2ueYH/I+GVQAPiW+LwSATTxshQjGxXMH9Vbf8vjP9PWC\nRQtzP3yQQk8cAs6xZtJz20PMzm5Y88FbUgU2JKpst55k+ccU0pbX0C0K4pwajNbF\nvMRaLqITHXpTYbEk8aP8vcOkSZ7bpJdEymH/4Uh6Q52X+Yo7m9S2SzY1xdhnlw+O\nD7ZfsPPKc/0S3rJ14J79v8jLnQYydE+8TQP65EB5VE1q5GRUJZw3AeKQXtC+2Qvn\nBMj1XT+vAgMBAAECggEADV3IcdLPDROXOLYEIwAYcUmJMdq43SH+6gYrLWFUCCQi\nvFH7bc6vbYjsYZLJVLdQTdKiPt2cMmZAFYm5TZMEwmxIVcr+0XCQADbdCQMwTgeu\nxn7A0+J1M30OUPVbZmV0PF68gOYq9jZWFZ3GcAVKE59TaJLY0S98JpUkJ8Jy2V8v\nW8cj+hCFn5zy8kKROcQ9PkMPjpDIcXZzx4pfX5E0/JOLcKsztyYlK0xCQG9XCG0f\nM7C7hVyiziokYwS5PnKY3I0hFMCaLtMb+c3vYEiBiLiBnaXjUzEL23jBVDPkbPPI\n8JOWjFCcOjLxdIzm2zK/1XEg8KPsKqcn6pLSAmkzIQKBgQD+QJmbTz7Uv5s54oBt\nEW/Ae3pN3qQdFmUei/P+QMnNTpPmhXjJvrltQZWVYTaWs4lz6YJAcazRoocPl3Fh\nqbLnZ2szjGUFYFd8UlsjKAZH4fnQYbhxBcH8/wLzwOYp3lxmZE5NvjzDc5zqdXwr\nt27QMnzqUcSmQ9uZwQqyiCWueQKBgQDR1b2UgCnSmRqcCfDOLFUUG5alPZ5UJoWo\nI1tVvRuKiN0W0pN2C3a7PwWtFlQVKUkUOYwRnSZR08gfRKpOlIWG5KAPsbN3hR9S\nASUZ3PwGFhysxcpuaRhKl13M3zyv8LI3UIx5j24gjsn+RKn7FKR9JpM56j5y49/M\neKL0xILwBwKBgFWt1DqYzxSffx5LRBXc5qOBLwwRHsyvKHITHhzdRXYxnRZKBbpi\nBQxJLnqLvKY64/rZbOpziNEVeQ9MnM3SJ8tXULvVOZkQQtQj+bA75cyDU1vWwxzO\nNi5vBqEeZr+RMXEGdB+ZiuWiXTHJIFUXEaT19QQEm78FcPicWn8ZELhRAoGBAKG1\nSVTWBF3wXRMPRvgKIYZWllUEjO+dT6y2T43ZiWRqCUzxj0yvdZbgM4VLg9BS20Vx\nUTb9Ry4WLEs7jYERwZtObDPXEH3pBlOsVB5wqRL0I9vEUWvs9RAtx5VADr7eZGys\nTptDTdTJOqyEZLYeNJxTdX1JgN3WlNJaPuq9NeoxAoGBAPqQitES62ckVjwEGQhg\nEITlOutyyycjgFe9+tF7OsGoCvkRXa1VCfNZ8K+CbhtVN83NJLgQ7HPnxFsLm4Ij\n6mlrfZ5QU0qTnZHpHTXHqQYTfVU+P8YUqf5enMWrGrKm4ZnDQQKvn5y1ZLqXe1Bo\nDNl9WzJgRRbFKlHwKqVaweKw\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@snaphealth-39b14.iam.gserviceaccount.com",
  "client_id": "740672895155",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40snaphealth-39b14.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

// Save to temporary file
fs.writeFileSync('service-account.json', JSON.stringify(serviceAccount, null, 2));

// Initialize the app with the service account file
admin.initializeApp({
  credential: admin.credential.cert('./service-account.json'),
  storageBucket: "snaphealth-39b14.appspot.com"
});

// Create CORS configuration for localhost:3007
const corsConfig = [
  {
    origin: ["http://localhost:3007"],
    method: ["GET", "POST", "PUT"],
    responseHeader: ["Content-Type", "Authorization"],
    maxAgeSeconds: 3600
  }
];

// Also save the CORS config to a file
fs.writeFileSync('cors.json', JSON.stringify(corsConfig, null, 2));

const bucket = admin.storage().bucket();

// Update CORS configuration
bucket.setCorsConfiguration(corsConfig)
  .then(() => {
    console.log('CORS configuration updated successfully!');
    console.log('New CORS configuration:');
    console.log(JSON.stringify(corsConfig, null, 2));
    console.log('\nUploads from localhost:3007 are now allowed.');
    
    // Clean up
    fs.unlinkSync('service-account.json');
  })
  .catch((error) => {
    console.error('Error updating CORS configuration:', error);
  }); 