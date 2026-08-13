# Kaivalyadhama Hostel Wi‑Fi Portal

Captive-portal demo with **Firebase Auth / Firestore / Hosting** and **Razorpay Standard Web Checkout** (server-side orders + signature verification).

## Layout

```
.env                 # RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET (gitignored)
.env.example
functions/           # Express API → Firebase Cloud Function `api`
  index.js           # POST /api/create-order, POST /api/verify-payment
  package.json
public/              # Firebase Hosting site
  index.html
  js/
  assets/
firebase.json        # Hosting rewrite: /api/** → function api
firestore.rules
```

## Razorpay Standard Checkout flow

1. User clicks **Pay** on the plans screen.
2. Frontend `POST /api/create-order` with amount in **paise**.
3. Backend creates a Razorpay order (Key Secret stays on server).
4. Frontend opens Checkout: `new Razorpay({ order_id, key, ... }); rzp.open()`.
5. On success, frontend `POST /api/verify-payment` with `payment_id`, `order_id`, `signature`.
6. Backend verifies `HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)`.
7. Only if verified → Firestore `activePlan` + Active Dashboard.

## Environment

```bash
cp .env.example .env
# edit .env — never commit it
cp .env functions/.env   # required for Cloud Functions deploy
```

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
PORT=3001
```

`.env` is in `.gitignore`. **Key Secret never goes in frontend code.**

## Local test

```bash
# Terminal 1 — Razorpay API
npm run api

# Terminal 2 — static portal
python3 -m http.server 8080 --directory public
```

Open `http://localhost:8080` → log in → choose plan → **Pay**.

Quick API smoke test:

```bash
curl -s -X POST http://127.0.0.1:3001/api/create-order \
  -H 'Content-Type: application/json' \
  -d '{"amount":49900,"currency":"INR","receipt":"test_rcpt"}'
```

## Deploy (Hosting + Functions)

Requires Firebase **Blaze** plan for Cloud Functions.

```bash
cd functions && npm install && cd ..
cp .env functions/.env
npx firebase deploy --only hosting,functions
```

Live: https://hostel-wifi-160db.web.app

Full checklist: [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md)
