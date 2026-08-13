# Kaivalyadhama Hostel Wi‑Fi Portal

Static captive-portal demo with **Firebase Authentication**, **Cloud Firestore**, **Firebase Hosting**, and **Razorpay Test Mode** checkout.

## Layout

```
public/           # Deployed by Firebase Hosting
  index.html
  js/
    razorpay-config.js   # Paste rzp_test_... Key ID here
  assets/
firebase.json     # Hosting public dir + SPA rewrites
.firebaserc       # Project: hostel-wifi-160db
firestore.rules
```

## Razorpay Test Mode

1. Open [Razorpay Dashboard → API Keys](https://dashboard.razorpay.com/app/keys) (Test Mode).
2. Copy the **Key ID** (`rzp_test_...`) into `public/js/razorpay-config.js`.
3. Never put the Key Secret in frontend code.
4. On **Confirm & Pay**, the official Razorpay checkout modal opens with the plan amount in INR (paise).
5. After a successful test payment, Firestore `users/{uid}.activePlan` is updated and the Active Dashboard opens immediately.

## Quick start (local)

```bash
python3 -m http.server 8080 --directory public
```

Open `http://localhost:8080`

## Deploy

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,firestore:rules
```

Live URLs (after deploy):

- https://hostel-wifi-160db.web.app
- https://hostel-wifi-160db.firebaseapp.com

Full checklist: [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md)
