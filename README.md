# Kaivalyadhama Hostel Wi‑Fi Portal

Static captive-portal demo with **Firebase Authentication** + **Cloud Firestore** (modular Web SDK).

## Quick start

1. Paste your Firebase web config into [`js/firebase.js`](js/firebase.js)  
   (see [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md) for the exact steps).
2. Enable **Email/Password** auth and create a **Firestore** database.
3. Serve the project over HTTP:

```bash
python3 -m http.server 8080
```

4. Open `http://localhost:8080`

## Features

- Login / signup (Firebase Auth)
- User profile document in `users/{uid}`
- Plan selection saved to the signed-in user’s Firestore document
- Account bar shows login state + active plan
- Existing pricing UI, ID upload, and demo payment flow
