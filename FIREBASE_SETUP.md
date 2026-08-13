# Firebase setup & Hosting deploy

This portal uses the **Firebase Web SDK v12 modular API** and is configured for **Firebase Hosting**.

## Project layout (Hosting-ready)

```
firebase.json              # Hosting + Firestore deploy config
.firebaserc                # Default project: hostel-wifi-160db
firestore.rules            # Security rules for users/{uid}
public/                    # ← Hosting public directory
  index.html
  assets/
  js/
    firebase.js            # ← Web app config lives here
    razorpay-config.js     # ← Razorpay Test Key ID (rzp_test_...)
    auth-service.js
    user-service.js
    portal-app.js
```

## 1. Firebase web config

Open **`public/js/firebase.js`** and confirm your web app keys are set
(Firebase Console → Project settings → Your apps → Web → Config).

## 2. Razorpay Test Key

Open **`public/js/razorpay-config.js`** and paste your Test Mode Key ID:

```js
export const RAZORPAY_KEY_ID = "rzp_test_xxxxxxxxxxxxxxxxxxxx";
```

Generate keys from Razorpay Dashboard → Account & Settings → API Keys → **Test Mode**.
Do **not** put the Key Secret in the browser.

## 3. Enable products in Firebase Console

1. **Authentication → Sign-in method → Email/Password → Enable**
2. **Firestore Database → Create database**
3. **Authentication → Settings → Authorized domains**  
   After first Hosting deploy, ensure these are listed:
   - `hostel-wifi-160db.web.app`
   - `hostel-wifi-160db.firebaseapp.com`
   - `localhost` (for local testing)

## 4. Local preview

```bash
# From repo root
python3 -m http.server 8080 --directory public
# open http://localhost:8080
```

Or with Firebase tools:

```bash
npm install -g firebase-tools
firebase login
firebase serve --only hosting
```

## 5. Deploy to Firebase Hosting

```bash
npm install -g firebase-tools   # once
firebase login                  # once
firebase use hostel-wifi-160db
firebase deploy
```

Useful variants:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only hosting,firestore:rules
```

After deploy, open:

- https://hostel-wifi-160db.web.app  
- https://hostel-wifi-160db.firebaseapp.com  

## What gets stored in Firestore

Collection: **`users`**, document ID = Firebase Auth `uid`

| Field | Meaning |
| --- | --- |
| `email`, `displayName` | Account profile |
| `selectedPlan` | Last plan the user clicked / chose |
| `activePlan` | Plan after successful Razorpay payment (creds, validity, `transactionId`) |
| `transactionStatus` | `none` → `selected` → `pending` → `active` / `failed` |
| `lastTransaction` | Amount, Razorpay payment id, paid/failed status |

## Pre-deploy checklist

- [ ] `public/js/firebase.js` has real `apiKey` / `projectId` / `appId`
- [ ] `public/js/razorpay-config.js` has a real `rzp_test_...` Key ID
- [ ] Email/Password auth is enabled
- [ ] Firestore database exists
- [ ] `firebase.json` → `"public": "public"` (already set)
- [ ] SPA rewrite → `**` → `/index.html` (already set)
- [ ] You are logged in: `firebase login`
- [ ] Correct project: `firebase use` shows `hostel-wifi-160db`
