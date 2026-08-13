/**
 * Razorpay Test Mode configuration.
 *
 * Paste your Test Key ID from:
 * Razorpay Dashboard → Account & Settings → API Keys → Generate Test Key
 *
 * Example: rzp_test_xxxxxxxxxxxxxxxxxxxx
 * Never put the Key Secret in frontend code.
 *
 * Also see FIREBASE_SETUP.md / README for portal deploy notes.
 */
export const RAZORPAY_KEY_ID = "rzp_test_TPM1bEMUthy8In";

export const RAZORPAY_CONFIG = {
  name: "Kaivalyadhama Hostel Wi‑Fi",
  currency: "INR",
  themeColor: "#7a1a32",
  /** Set true while using rzp_test_ keys for client demos. */
  testMode: true,
};

export function assertRazorpayKey() {
  if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes("YOUR_KEY_HERE")) {
    return false;
  }
  if (!String(RAZORPAY_KEY_ID).startsWith("rzp_test_") && RAZORPAY_CONFIG.testMode) {
    console.warn(
      "[Razorpay] Test mode is enabled but key does not start with rzp_test_."
    );
  }
  return true;
}
