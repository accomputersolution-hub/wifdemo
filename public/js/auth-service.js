/**
 * Firebase Authentication helpers (email / password).
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { auth } from "./firebase.js?v=2.1";
import { createUserDocument } from "./user-service.js?v=2.1";

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUp({ email, password, displayName = "" }) {
  // Ensure we never keep a previous Auth session while creating a new account.
  if (auth.currentUser) {
    await signOut(auth);
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }

  await createUserDocument(credential.user, {
    displayName: displayName.trim() || null,
  });

  return credential.user;
}

export async function signIn({ email, password }) {
  // Switch accounts cleanly: drop any existing Auth session first.
  if (auth.currentUser) {
    await signOut(auth);
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logOut() {
  // Firebase Auth signOut — clears IndexedDB / persisted auth session.
  await signOut(auth);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function friendlyAuthError(error) {
  const code = error && error.code;
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and Firebase config.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "Firebase API key is invalid. Update js/firebase.js.";
    default:
      return (error && error.message) || "Authentication failed.";
  }
}
