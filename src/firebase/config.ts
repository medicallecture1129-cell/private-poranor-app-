import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Web app's Firebase configuration provided by the user
export const firebaseConfig = {
  apiKey: "AIzaSyDy1IFOYcPma4VFSguPMQ3P8gJHOS27niE",
  authDomain: "examportalonline-cb0a0.firebaseapp.com",
  projectId: "examportalonline-cb0a0",
  storageBucket: "examportalonline-cb0a0.firebasestorage.app",
  messagingSenderId: "991705340498",
  appId: "1:991705340498:web:abc98a9e4f2c3914611d8b",
  measurementId: "G-PVHS1KESXW"
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
