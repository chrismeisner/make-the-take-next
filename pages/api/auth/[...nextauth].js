// File: pages/api/auth/[...nextauth].js

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default NextAuth({
  session: {
	strategy: "jwt",
  },
  // In development, cookies should not be marked as secure.
  useSecureCookies: process.env.NODE_ENV === "production",
  debug: true, // optional for logging

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

		// 1) Verify code via Twilio
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

		// 2) Return a user object
		const mockProfileID = "profile_" + numeric;
		console.log("[NextAuth] authorize => success, returning user:", e164Phone, mockProfileID);

		return {
		  phone: e164Phone,
		  profileID: mockProfileID,
		};
	  },
	}),
  ],

  callbacks: {
	async jwt({ token, user }) {
	  // If user just signed in, store phone & profileID in token
	  if (user) {
		token.phone = user.phone;
		token.profileID = user.profileID;
		console.log("[NextAuth][jwt callback] user =>", user);
	  }
	  return token;
	},
	async session({ session, token }) {
	  // Expose phone & profileID in session.user
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
