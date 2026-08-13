/**
 * Cloud Firestore user document helpers.
 *
 * Collection: users/{uid}
 * Fields written by this portal:
 * - email, displayName, createdAt, updatedAt
 * - selectedPlan (latest plan the user clicked / chose)
 * - activePlan (plan after successful payment, includes wifi creds / MAC)
 * - connectionStatus: connected | disconnected
 * - transactionStatus: none | selected | pending | paid | active
 * - lastTransaction (amount, method, paidAt, etc.)
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { db } from "./firebase.js";

export function userRef(uid) {
  return doc(db, "users", uid);
}

export async function createUserDocument(user, extras = {}) {
  const ref = userRef(user.uid);
  const existing = await getDoc(ref);

  if (existing.exists()) {
    await updateDoc(ref, {
      email: user.email || null,
      displayName: extras.displayName ?? user.displayName ?? null,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(ref, {
    uid: user.uid,
    email: user.email || null,
    displayName: extras.displayName ?? user.displayName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    selectedPlan: null,
    activePlan: null,
    transactionStatus: "none",
    lastTransaction: null,
  });
}

export async function getUserDocument(uid) {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Called when the user selects a pricing plan in the UI.
 */
export async function saveSelectedPlan(uid, planPayload) {
  await updateDoc(userRef(uid), {
    selectedPlan: {
      ...planPayload,
      selectedAt: serverTimestamp(),
    },
    transactionStatus: "selected",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Called when checkout starts (payment pending).
 */
export async function markTransactionPending(uid, transactionPayload) {
  await updateDoc(userRef(uid), {
    transactionStatus: "pending",
    lastTransaction: {
      ...transactionPayload,
      status: "pending",
      updatedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Called after a successful (demo) payment — activates the plan.
 */
export async function activatePlan(uid, { plan, transaction }) {
  await updateDoc(userRef(uid), {
    selectedPlan: plan,
    activePlan: {
      ...plan,
      activatedAt: serverTimestamp(),
    },
    connectionStatus: plan.connectionStatus || "connected",
    transactionStatus: "active",
    lastTransaction: {
      ...transaction,
      status: "paid",
      paidAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update Wi‑Fi connection / MAC binding status on the user document.
 */
export async function setConnectionStatus(uid, { connectionStatus, activePlanPatch = null }) {
  const payload = {
    connectionStatus,
    updatedAt: serverTimestamp(),
  };

  if (activePlanPatch) {
    payload.activePlan = activePlanPatch;
  }

  await updateDoc(userRef(uid), payload);
}

/**
 * Patch missing credential / device fields on an existing active plan.
 */
export async function ensureActivePlanDetails(uid, activePlan) {
  await updateDoc(userRef(uid), {
    activePlan,
    updatedAt: serverTimestamp(),
  });
}

export function friendlyFirestoreError(error) {
  const code = error && error.code;
  if (code === "permission-denied") {
    return "Firestore permission denied. Check security rules for users/{uid}.";
  }
  if (code === "unavailable") {
    return "Firestore is unavailable. Check your network / project setup.";
  }
  return (error && error.message) || "Could not update user data.";
}
