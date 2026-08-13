/**
 * Razorpay Standard Checkout — frontend config (KEY_ID only via API).
 *
 * KEY_SECRET never belongs in the browser. The create-order API returns
 * the public key_id with each order.
 */

/** Theme / merchant display for Razorpay Checkout modal */
export const RAZORPAY_CONFIG = {
  name: "Kaivalyadhama Hostel Wi‑Fi",
  currency: "INR",
  themeColor: "#7a1a32",
  testMode: true,
};

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
    /* empty */
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
