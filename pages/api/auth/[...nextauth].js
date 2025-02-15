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
  const filterByFormula = `{profileMobile} = "${phoneE164}"`;
  const found = await base("Profiles")
	.select({ filterByFormula, maxRecords: 1 })
	.all();

  if (found.length > 0) {
	const existing = found[0];
	return {
	  airtableId: existing.id,
	  profileID: existing.fields.profileID, // e.g. "c_monster"
	  mobile: existing.fields.profileMobile,
	};
  }

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
  return {
	airtableId: newRec.id,
	profileID: newRec.fields.profileID,
	mobile: newRec.fields.profileMobile,
  };
}

export default NextAuth({
  session: {
	strategy: "jwt",
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  debug: true,
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
		console.log(
		  "[NextAuth] authorize => phone:",
		  e164Phone,
		  "code:",
		  credentials.code
		);

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

		try {
		  const profile = await ensureProfileRecord(e164Phone);
		  console.log(
			"[NextAuth] authorize => success, returning user:",
			e164Phone,
			profile.profileID
		  );
		  return {
			phone: e164Phone,
			profileID: profile.profileID,
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
		console.log("[NextAuth][jwt callback] user =>", user);
	  }
	  return token;
	},
	async session({ session, token }) {
	  if (token) {
		session.user = {
		  phone: token.phone,
		  profileID: token.profileID,
		};
	  }
	  console.log("[NextAuth][session callback] session =>", session);
	  return session;
	},
  },
  secret: process.env.NEXTAUTH_SECRET,
});
