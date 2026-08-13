/**
 * Razorpay Standard Checkout backend.
 *
 * POST /api/create-order  → Razorpay Orders API
 * POST /api/verify-payment → HMAC-SHA256 signature check
 *
 * Runs as:
 * - Local Express: `npm start` (from functions/) or `npm run api` (repo root)
 * - Firebase Cloud Function `api` (Hosting rewrite /api/**)
 */

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");

// Load secrets from repo-root .env first, then functions/.env (never commit these).
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

function getCredentials() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    const err = new Error(
      "Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env"
    );
    err.status = 500;
    throw err;
  }

  return { key_id, key_secret };
}

function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "razorpay-api" });
  });

  /**
   * STEP 1 — Create Razorpay order
   * Body: { amount (paise), currency?, receipt?, notes? }
   * Returns: { order_id, amount, currency, key_id }
   */
  app.post("/api/create-order", async (req, res) => {
    try {
      const amount = Number(req.body && req.body.amount);
      const currency = String((req.body && req.body.currency) || "INR").toUpperCase();
      const receipt = String(
        (req.body && req.body.receipt) || `rcpt_${Date.now()}`
      ).slice(0, 40);
      const notes = (req.body && req.body.notes) || {};

      if (!Number.isFinite(amount) || amount < 100) {
        return res.status(400).json({
          error: "Amount must be at least 100 paise.",
        });
      }

      let key_id;
      let key_secret;
      try {
        ({ key_id, key_secret } = getCredentials());
      } catch (credErr) {
        return res.status(500).json({ error: credErr.message });
      }

      const razorpay = new Razorpay({ key_id, key_secret });
      const order = await razorpay.orders.create({
        amount: Math.round(amount),
        currency,
        receipt,
        notes,
      });

      return res.json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        // Key ID is public; Key Secret never leaves the server.
        key_id,
      });
    } catch (error) {
      console.error("create-order error:", error);
      const statusCode = Number(error && error.statusCode) || 500;
      const authFailed = statusCode === 401 || statusCode === 403;
      return res.status(authFailed ? 401 : 500).json({
        error:
          (error && error.error && error.error.description) ||
          error.message ||
          "Failed to create Razorpay order",
      });
    }
  });

  /**
   * STEP 3 — Verify checkout signature
   * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   */
  app.post("/api/verify-payment", (req, res) => {
    try {
      const body = req.body || {};
      const razorpay_order_id = body.razorpay_order_id;
      const razorpay_payment_id = body.razorpay_payment_id;
      const razorpay_signature = body.razorpay_signature;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          verified: false,
          error:
            "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature.",
        });
      }

      let key_secret;
      try {
        ({ key_secret } = getCredentials());
      } catch (credErr) {
        return res.status(500).json({
          verified: false,
          error: credErr.message,
        });
      }

      const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expected = crypto
        .createHmac("sha256", key_secret)
        .update(payload)
        .digest("hex");

      const expectedBuf = Buffer.from(expected, "utf8");
      const actualBuf = Buffer.from(String(razorpay_signature), "utf8");
      const match =
        expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);

      if (!match) {
        return res.status(400).json({
          verified: false,
          error: "Signature mismatch. Payment not marked as paid.",
        });
      }

      return res.json({
        verified: true,
        razorpay_order_id,
        razorpay_payment_id,
      });
    } catch (error) {
      console.error("verify-payment error:", error);
      return res.status(500).json({
        verified: false,
        error: error.message || "Verification failed",
      });
    }
  });

  // Helpful 404 for mistyped API paths
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

const app = createApp();

// Local Express server (development / direct Node host)
if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`Razorpay API listening on http://127.0.0.1:${port}`);
    console.log(`  POST /api/create-order`);
    console.log(`  POST /api/verify-payment`);
  });
}

// Firebase Cloud Function export (Hosting rewrite: /api/** → api)
const { onRequest } = require("firebase-functions/v2/https");
exports.api = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
  },
  app
);
