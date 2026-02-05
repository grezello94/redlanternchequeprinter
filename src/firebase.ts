import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, clearIndexedDbPersistence } from "firebase/firestore";

// Firebase config is loaded from Vite env variables.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable Offline Mode
enableIndexedDbPersistence(db).catch((err) => {
  console.error("Persistence failed", err.code);
});

// Attempt to repair IndexedDB persistence when it becomes corrupted.
// Returns true if cleared successfully.
const repairIndexedDbPersistence = async () => {
  try {
    await clearIndexedDbPersistence(db);
    return true;
  } catch (err) {
    console.warn("IndexedDB persistence repair failed", err);
    return false;
  }
};

export { db, repairIndexedDbPersistence };
