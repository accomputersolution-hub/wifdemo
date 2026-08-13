/**
 * Central Firebase initialization (modular Web SDK v9+).
 *
 * WHERE TO PASTE YOUR KEYS:
 * Replace every "YOUR_..." placeholder below with values from
 * Firebase Console → Project settings → Your apps → Web app → Config.
 *
 * Also enable in the Firebase Console:
 * - Authentication → Sign-in method → Email/Password
 * - Firestore Database → Create database
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
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
