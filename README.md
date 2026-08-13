# Kaivalyadhama Hostel Wi‑Fi Portal

Static captive-portal demo with **Firebase Authentication**, **Cloud Firestore**, and **Firebase Hosting**.

## Layout

```
public/           # Deployed by Firebase Hosting
  index.html
  js/
  assets/
firebase.json     # Hosting public dir + SPA rewrites
.firebaserc       # Project: hostel-wifi-160db
firestore.rules
```

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
