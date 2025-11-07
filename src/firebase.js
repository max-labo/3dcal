// Firebase Configuration
// Get your config from Firebase Console:
// 1. Go to https://console.firebase.google.com/
// 2. Select your project > Project Settings (⚙️ icon)
// 3. Scroll to "Your apps" section
// 4. Select your web app (or create one)
// 5. Copy the config values from "SDK setup and configuration" > "Config"

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDyCYPSXGrjC3K6ygEbMCpcbD2zKJnt0QU",
  authDomain: "d-cal-4c474.firebaseapp.com",
  projectId: "d-cal-4c474",
  storageBucket: "d-cal-4c474.firebasestorage.app",
  messagingSenderId: "228971550211",
  appId: "1:228971550211:web:4e0110b42181bb7dcf2036",
  measurementId: "G-EPK9YZGPCP" // Optional: for Firebase Analytics
};

// Check if Firebase is configured (it is now!)
const isFirebaseConfigured = true;

let app, auth, db, googleProvider;

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    
    // Initialize Firebase Authentication and get a reference to the service
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    
    // Initialize Cloud Firestore and get a reference to the service
    db = getFirestore(app);
  } catch (error) {
    console.error("Firebase initialization error:", error);
    // Export null values if initialization fails
    auth = null;
    db = null;
    googleProvider = null;
  }
} else {
  console.warn("Firebase is not configured. Please update src/firebase.js with your Firebase config.");
  // Export null values if not configured
  auth = null;
  db = null;
  googleProvider = null;
}

export { auth, db, googleProvider };
export default app;

