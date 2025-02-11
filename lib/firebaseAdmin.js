import admin from "firebase-admin";

// Avoid re-initializing in dev
if (!admin.apps.length) {
  admin.initializeApp({
	credential: admin.credential.cert({
	  project_id: process.env.FIREBASE_PROJECT_ID,
	  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
	  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Fix Heroku key formatting
	  client_email: process.env.FIREBASE_CLIENT_EMAIL,
	  client_id: process.env.FIREBASE_CLIENT_ID,
	  auth_uri: process.env.FIREBASE_AUTH_URI,
	  token_uri: process.env.FIREBASE_TOKEN_URI,
	  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
	  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
	}),
	storageBucket: "make-the-take-364cc.appspot.com", // Your Firebase Storage bucket
  });
}

export const firebaseAdmin = admin;
export const storageBucket = admin.storage().bucket();
