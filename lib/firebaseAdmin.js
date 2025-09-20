// File: lib/firebaseAdmin.js
import admin from "firebase-admin";

// Avoid re-initializing in dev
if (!admin.apps.length) {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
      // eslint-disable-next-line no-console
      console.error("[firebaseAdmin] Missing FIREBASE_SERVICE_ACCOUNT_KEY env var");
      throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");
    }

    const serviceAccount = JSON.parse(raw);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Provide the bucket name after "gs://", e.g. "make-the-take-364cc.firebasestorage.app"
      storageBucket: "make-the-take-364cc.firebasestorage.app",
    });

    // eslint-disable-next-line no-console
    console.log("[firebaseAdmin] Initialized Firebase Admin with bucket:", admin.storage().bucket().name);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[firebaseAdmin] Initialization failed:", err);
    throw err;
  }
}

export const firebaseAdmin = admin;
export const storageBucket = admin.storage().bucket();
