# Firebase setup & Razorpay Standard Checkout

## Stack

- **Frontend:** static site in `public/` (Firebase Hosting)
- **Backend:** Node/Express in `functions/` (local server + Cloud Function `api`)
- **Auth / DB:** Firebase Auth + Firestore

## Layout

```
.env / .env.example
firebase.json              # Hosting + Functions + /api/** rewrite
.firebaserc                # hostel-wifi-160db
firestore.rules
functions/
  index.js                 # create-order + verify-payment
  package.json
  .env                     # copy from root .env before deploy (gitignored)
public/
  index.html
  js/
    firebase.js
    razorpay-config.js     # API helpers (no Key Secret)
    auth-service.js
    user-service.js
    portal-app.js
```

## 1. Firebase web config

Confirm `public/js/firebase.js` has your web app keys.

## 2. Razorpay credentials (server only)

```bash
cp .env.example .env
# set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
cp .env functions/.env
```

Never put `RAZORPAY_KEY_SECRET` in `public/` or commit `.env`.

## 3. Enable Firebase products

1. Authentication → Email/Password
2. Firestore Database
3. Authorized domains: Hosting URLs + `localhost`
4. **Blaze plan** (required to deploy Cloud Functions)

## 4. Local preview

```bash
# API
npm run api

# Portal
python3 -m http.server 8080 --directory public
# http://localhost:8080
```

Local frontend calls `http://127.0.0.1:3001/api/...` automatically.

## 5. Deploy

```bash
cd functions && npm install && cd ..
cp .env functions/.env
npx firebase use hostel-wifi-160db
npx firebase deploy --only hosting,functions,firestore:rules
```

Hosting rewrites `/api/**` → Cloud Function `api`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/create-order` | Create Razorpay order (`amount` ≥ 100 paise) |
| POST | `/api/verify-payment` | HMAC-SHA256 signature verify |
| GET | `/api/health` | Health check |

### create-order body

```json
{ "amount": 49900, "currency": "INR", "receipt": "rcpt_123" }
```

### verify-payment body

```json
{
  "razorpay_order_id": "order_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_signature": "..."
}
```

## Firestore (`users/{uid}`)

| Field | Meaning |
| --- | --- |
| `selectedPlan` | Last selected plan |
| `activePlan` | Activated after **verified** payment |
| `transactionStatus` | `none` → `selected` → `pending` → `active` / `failed` |
| `lastTransaction` | Amount, Razorpay ids, status |

## Pre-deploy checklist

- [ ] Root `.env` + `functions/.env` have Test Key ID + Secret
- [ ] `cd functions && npm install`
- [ ] Email/Password auth enabled
- [ ] Firestore exists
- [ ] Blaze plan enabled (for Functions)
- [ ] `firebase use` → `hostel-wifi-160db`
