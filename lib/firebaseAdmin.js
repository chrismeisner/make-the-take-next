// File: lib/firebaseAdmin.js
import admin from "firebase-admin";

// Avoid re-initializing in dev
if (!admin.apps.length) {
	let serviceAccount;
	try {
		serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[firebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY');
		serviceAccount = {};
	}

	const projectId = serviceAccount?.project_id || process.env.FIREBASE_PROJECT_ID;
	const envBucket = process.env.FIREBASE_STORAGE_BUCKET;
	const storageBucketName = envBucket || (projectId ? `${projectId}.appspot.com` : undefined);

	admin.initializeApp({
		credential: admin.credential.cert(serviceAccount),
		storageBucket: storageBucketName,
	});
	try {
		// eslint-disable-next-line no-console
		console.log('[firebaseAdmin] Initialized', { bucket: storageBucketName || '(none)' });
	} catch {}
}

export const firebaseAdmin = admin;
export const storageBucket = admin.storage().bucket();
