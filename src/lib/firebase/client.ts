import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

// Web config is shipped to the browser. Restrict the key's APIs/referrers in Google Cloud.
// Inject the key at build time instead of storing its value in Git.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "tsugidoko-prod-hajime-f.firebaseapp.com",
  projectId: "tsugidoko-prod-hajime-f",
  appId: "1:934036645111:web:0c1d6a1db8fc7864ec5ff2",
};

let auth: Auth | undefined;
let db: Firestore | undefined;

export function getClientAuth() {
  if (typeof window === "undefined") throw new Error("Authentication requires a browser.");
  if (!auth) {
    const emulator = process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL;
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const useEmulator = process.env.NODE_ENV === "development" && local && Boolean(emulator);
    if (!useEmulator && !config.apiKey) throw new Error("Firebase Web API key is not configured.");
    const name = useEmulator ? "tsugidoko-emulator" : "tsugidoko";
    const app = getApps().some(app => app.name === name) ? getApp(name) : initializeApp(useEmulator ? {
      apiKey: "demo-key", projectId: "demo-tsugidoko", authDomain: "demo-tsugidoko.firebaseapp.com",
    } : config, name);
    auth = getAuth(app);
    auth.languageCode = "ja";
    if (useEmulator) connectAuthEmulator(auth, emulator!, { disableWarnings: true });
  }
  return auth;
}

export function getClientDatabase() {
  if (!db) {
    const auth = getClientAuth();
    db = getFirestore(auth.app);
    if (auth.app.name === "tsugidoko-emulator") {
      connectFirestoreEmulator(db, "127.0.0.1", 8180);
    }
  }
  return db;
}
