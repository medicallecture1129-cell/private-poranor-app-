import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Web app's Firebase configuration provided by the user
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDy1IFOYcPma4VFSguPMQ3P8gJHOS27niE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "examportalonline-cb0a0.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "examportalonline-cb0a0",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "examportalonline-cb0a0.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "991705340498",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:991705340498:web:abc98a9e4f2c3914611d8b",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-PVHS1KESXW"
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Safe Analytics initialization
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}
