// File: /pages/api/auth/[...nextauth].js

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import twilio from "twilio";
import Airtable from "airtable";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

function generateRandomProfileID(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
	result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function ensureProfileRecord(phoneE164) {
  // Log the phone number to ensure it's in the correct format
  console.log("[NextAuth] ensureProfileRecord => phone:", phoneE164);

  // Correct the formula to ensure it works properly
  const filterByFormula = `{profileMobile} = "${phoneE164}"`;

  // Fetch profiles based on the corrected formula
  const found = await base("Profiles")
	.select({ filterByFormula, maxRecords: 1 })
	.all();

  if (found.length > 0) {
	const existing = found[0];
	console.log("[NextAuth] Profile found =>", existing);
	return {
	  airtableId: existing.id, // Airtable Record ID
	  profileID: existing.fields.profileID, // e.g. "c_monster"
	  mobile: existing.fields.profileMobile,
	};
  }

  // If no existing profile is found, create a new one
  const newProfileID = generateRandomProfileID(8);
  const created = await base("Profiles").create([
	{
	  fields: {
		profileMobile: phoneE164,
		profileID: newProfileID,
	  },
	},
  ]);

  const newRec = created[0];
  console.log("[NextAuth] Profile created =>", newRec);
  return {
	airtableId: newRec.id, // Airtable Record ID
	profileID: newRec.fields.profileID,
	mobile: newRec.fields.profileMobile,
  };
}

// To handle debounce and avoid repeated logs or actions:
let lastLoggedSession = {};

export default NextAuth({
  session: {
	strategy: "jwt",
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  debug: false, // Turn off unnecessary debug logging
  providers: [
	CredentialsProvider({
	  name: "Phone Login",
	  credentials: {
		phone: { label: "Phone", type: "text" },
		code: { label: "Verification Code", type: "text" },
	  },
	  async authorize(credentials) {
		const numeric = credentials.phone.replace(/\D/g, "");
		const e164Phone = `+1${numeric}`;
		console.log("[NextAuth] authorize => phone:", e164Phone, "code:", credentials.code);

		// Verify the code via Twilio
		try {
		  const check = await client.verify.v2
			.services(process.env.TWILIO_VERIFY_SERVICE_SID)
			.verificationChecks.create({
			  to: e164Phone,
			  code: credentials.code,
			});
		  console.log("[NextAuth] Twilio check =>", check.status);
		  if (check.status !== "approved") {
			throw new Error("Invalid code");
		  }
		} catch (err) {
		  console.error("[NextAuth] Twilio verification error =>", err);
		  throw new Error("Verification failed");
		}

		// Handle profile creation or retrieval from Airtable
		try {
		  const profile = await ensureProfileRecord(e164Phone);
		  console.log("[NextAuth] authorize => success, returning user:", e164Phone, profile.profileID);
		  return {
			phone: e164Phone,
			profileID: profile.profileID,
			airtableId: profile.airtableId, // Include Airtable Record ID in the returned user object
		  };
		} catch (err) {
		  console.error("[NextAuth] Profile error:", err);
		  throw new Error("Could not create/find profile");
		}
	  },
	}),
  ],
  callbacks: {
	async jwt({ token, user }) {
	  if (user) {
		token.phone = user.phone;
		token.profileID = user.profileID;
		token.airtableId = user.airtableId; // Include Airtable Record ID in the JWT token

		// Debounce to prevent logging too often
		const now = Date.now();
		const key = `${user.profileID}`;
		if (!lastLoggedSession[key] || now - lastLoggedSession[key] > 10000) { // 10-second debounce
		  console.log("[NextAuth][jwt callback] user =>", user);
		  lastLoggedSession[key] = now; // Update last logged time for the session
		}
	  }
	  return token;
	},
	async session({ session, token }) {
	  if (token) {
		session.user = {
		  phone: token.phone,
		  profileID: token.profileID,
		  airtableId: token.airtableId, // Include Airtable Record ID in the session user object
		};
	  }

	  // Log session info, but with debounce
	  const now = Date.now();
	  const key = `${session.user.profileID}`;
	  if (!lastLoggedSession[key] || now - lastLoggedSession[key] > 10000) { // 10-second debounce
		console.log("[NextAuth][session callback] session =>", session);
		lastLoggedSession[key] = now; // Update last logged time for the session
	  }

	  return session;
	},
  },
  secret: process.env.NEXTAUTH_SECRET,
});
