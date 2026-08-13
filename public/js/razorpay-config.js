/**
 * Razorpay checkout helpers.
 *
 * KEY_SECRET never belongs in the browser.
 * When /api/create-order is available (local API or Cloud Functions on Blaze),
 * Standard Checkout with order_id + HMAC verify is used.
 * On Hosting without Functions (404), checkout falls back to Key ID + amount.
 */

/** Public Test Key ID only (never the Key Secret). */
export const RAZORPAY_KEY_ID = "rzp_test_TPM1bEMUthy8In";

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
