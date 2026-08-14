/**
 * Central Firebase initialization (modular Web SDK v9+).
 *
 * Web app config for project hostel-wifi-160db.
 * Update values from Firebase Console → Project settings → Your apps → Web.
 *
 * Also enable in the Firebase Console:
 * - Authentication → Sign-in method → Email/Password
 * - Firestore Database → Create database
 * - Authentication → Authorized domains (Hosting URLs after deploy)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAfpa63EqIaO0TYBCrk9y-BWPWDoFraXzo",
  authDomain: "hostel-wifi-160db.firebaseapp.com",
  projectId: "hostel-wifi-160db",
  storageBucket: "hostel-wifi-160db.firebasestorage.app",
  messagingSenderId: "372215574372",
  appId: "1:372215574372:web:2f5424506214f71c38d471",
  // Optional:
  // measurementId: "YOUR_MEASUREMENT_ID",
};

function assertConfig() {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => typeof value === "string" && value.startsWith("YOUR_"))
    .map(([key]) => key);

  if (missing.length) {
    console.warn(
      "[Firebase] Replace placeholders in js/firebase.js before using Auth/Firestore:",
      missing.join(", ")
    );
  }
}

assertConfig();

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
