// File: lib/firebaseAdmin.js
import admin from "firebase-admin";

// Avoid re-initializing in dev
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

  admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	// Provide the bucket name after "gs://", e.g. "make-the-take-364cc.firebasestorage.app"
	storageBucket: "make-the-take-364cc.firebasestorage.app",
  });
}

export const firebaseAdmin = admin;
export const storageBucket = admin.storage().bucket();
