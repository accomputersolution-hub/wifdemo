/**
 * Razorpay checkout helpers.
 *
 * KEY_SECRET never belongs in the browser.
 * Public Key ID comes from js/env.js (generated from root .env via
 * `npm run sync:razorpay-env`). Backend uses process.env.RAZORPAY_*.
 */

import {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_FINGERPRINT,
} from "./env.js?v=3.6";

export { RAZORPAY_KEY_ID, RAZORPAY_KEY_FINGERPRINT };

/** Theme / merchant display for Razorpay Checkout modal */
export const RAZORPAY_CONFIG = {
  name: "PCN Hostel Wi‑Fi",
  currency: "INR",
  themeColor: "#1f6feb",
  testMode: true,
};

/**
 * Checkout display: enable all India methods supported by the Test key.
 * Includes Cards, Netbanking, UPI, Wallets, Pay Later, EMI, apps, etc.
 * `show_default_blocks: true` keeps any extra methods Razorpay enables on the account.
 */
export function getDomesticCheckoutConfig() {
  return {
    display: {
      blocks: {
        all: {
          name: "All payment methods",
          instruments: [
            { method: "upi" },
            { method: "card" },
            { method: "netbanking" },
            { method: "wallet" },
            { method: "paylater" },
            { method: "emi" },
            { method: "cardless_emi" },
            { method: "app" },
          ],
        },
      },
      sequence: ["block.all"],
      preferences: {
        show_default_blocks: true,
      },
    },
  };
}

/** Hostel support number — never use as Razorpay customer prefill. */
export const HELPLINE_MOBILE_DIGITS = "9322752851";

/**
 * Normalize to +91XXXXXXXXXX for Razorpay `prefill.contact`.
 * Returns "" when the value is missing/invalid/helpline.
 * Never substitutes any static phone number.
 */
export function normalizeIndiaMobile(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  let local = "";
  if (digits.length === 10) local = digits;
  else if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length > 12 && digits.startsWith("91")) local = digits.slice(2, 12);
  else return "";

  if (local === HELPLINE_MOBILE_DIGITS) return "";
  if (!/^[6-9]\d{9}$/.test(local)) return "";
  return "+91" + local;
}

/**
 * Build Razorpay `prefill` from the checkout form values only.
 * `contact` must be the mobile the user typed — no hardcoded phone.
 *
 * @param {{ name?: string, email?: string, contact?: string }} input
 * @returns {{ name?: string, email: string, contact: string, method?: string }}
 */
export function buildDomesticPrefill({ name = "", email = "", contact = "" } = {}) {
  const userEmail = String(email || "").trim();
  const userMobile = normalizeIndiaMobile(contact);

  const prefill = {
    email: userEmail,
    contact: userMobile,
  };

  const trimmedName = String(name || "").trim();
  if (trimmedName) prefill.name = trimmedName;

  // Razorpay: prefill.method works only when email AND contact are set.
  if (prefill.email && prefill.contact) {
    prefill.method = "upi";
  }

  return prefill;
}

/**
 * Backend base URL.
 * - Production (Firebase Hosting): same-origin → rewrite /api/** → Cloud Function
 * - Local static preview: Express API on PORT 3001
 */
export function getApiBase() {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:3001";
  }
  return "";
}

export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const res = await fetch(`${getApiBase()}/api/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    /* empty — Hosting may return HTML when API is missing */
  }

  if (!res.ok) {
    const err = new Error(data.error || `Create order failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (!data.order_id || !data.key_id) {
    throw new Error("Create order response missing order_id or key_id.");
  }

  return data;
}

/**
 * Prefer Standard order API; if unavailable (404 / network), return a
 * client-side checkout payload so Pay still opens on Firebase Hosting (Spark).
 */
export async function createOrderOrFallback({ amountPaise, receipt, notes }) {
  try {
    const order = await createRazorpayOrder({ amountPaise, receipt, notes });
    return { mode: "standard", order };
  } catch (error) {
    const status = error && error.status;
    const apiMissing =
      status === 404 ||
      status === 502 ||
      status === 503 ||
      (typeof status !== "number" &&
        /failed to fetch|network|load failed/i.test(String(error.message || "")));

    if (!apiMissing) {
      throw error;
    }

    if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes("YOUR_KEY")) {
      throw error;
    }

    console.warn(
      "[Razorpay] /api/create-order unavailable — using Key ID checkout fallback. Deploy Cloud Functions (Blaze) for Standard order + verify."
    );

    return {
      mode: "fallback",
      order: {
        key_id: RAZORPAY_KEY_ID,
        amount: Math.round(amountPaise),
        currency: "INR",
        order_id: null,
      },
    };
  }
}

export async function verifyRazorpayPayment({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  const res = await fetch(`${getApiBase()}/api/verify-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    /* empty */
  }

  if (!res.ok || !data.verified) {
    const err = new Error(
      data.error || `Payment verification failed (${res.status})`
    );
    err.status = res.status;
    throw err;
  }

  return data;
}

/**
 * Verify when API exists; skip verify on Hosting-only (404) fallback demos.
 */
export async function verifyPaymentOrSkip(response, { requireVerify }) {
  if (!requireVerify) {
    return { verified: true, skipped: true };
  }

  if (
    !response.razorpay_order_id ||
    !response.razorpay_payment_id ||
    !response.razorpay_signature
  ) {
    throw new Error("Missing Razorpay payment fields for verification.");
  }

  try {
    return await verifyRazorpayPayment(response);
  } catch (error) {
    if (error && (error.status === 404 || error.status === 502)) {
      console.warn(
        "[Razorpay] verify API unavailable — activating plan without server HMAC (Hosting-only)."
      );
      return { verified: true, skipped: true };
    }
    throw error;
  }
}
