# Firebase setup (Kaivalyadhama Hostel Wi‑Fi Portal)

This portal uses the **Firebase Web SDK v12 modular API** (CDN imports, no bundler required).

## File structure

```
index.html                 # UI (auth + plans + payment)
js/
  firebase.js              # ← PASTE YOUR CONFIG KEYS HERE
  auth-service.js          # login / signup / logout
  user-service.js          # Firestore users/{uid} helpers
  portal-app.js            # UI wiring + plan save / activate
firestore.rules            # starter security rules
```

## 1. Paste your Firebase config keys

Open **`js/firebase.js`** and replace the placeholders:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

Get these values from:

**Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration → Config**

## 2. Enable Firebase products

In the Firebase Console for your project:

1. **Authentication → Sign-in method → Email/Password → Enable**
2. **Firestore Database → Create database** (start in test mode for local demo, then deploy rules)
3. Deploy or paste the rules from `firestore.rules`

## 3. Run the portal over HTTP

ES modules cannot load reliably from `file://`. Serve the folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## What gets stored in Firestore

Collection: **`users`**, document ID = Firebase Auth `uid`

| Field | Meaning |
| --- | --- |
| `email`, `displayName` | Account profile |
| `selectedPlan` | Last plan the user clicked / chose |
| `activePlan` | Plan after successful payment |
| `transactionStatus` | `none` → `selected` → `pending` → `active` |
| `lastTransaction` | Amount, method, paid status |

Selecting a plan (e.g. 50 Mbps) writes `selectedPlan` + `transactionStatus: "selected"`.  
Successful checkout sets `activePlan` and `transactionStatus: "active"`.

## UI behavior

- Logged out → login / signup screen
- Logged in → account bar shows email + active/selected plan + Log out
- Proceed to Pay requires login + ID document upload
