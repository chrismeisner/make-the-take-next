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
  providers: [
	CredentialsProvider({
	  name: "Phone Login",
	  credentials: {
		phone: { label: "Phone", type: "text" },
		code: { label: "Verification Code", type: "text" },
	  },
	  async authorize(credentials) {
		// 1. Format phone
		const numeric = credentials.phone.replace(/\D/g, "");
		const e164Phone = `+1${numeric}`;

		console.log("[NextAuth] Verifying code from user =>", {
		  phone: e164Phone,
		  code: credentials.code,
		});

		// 2. Call Twilio Verify to check the code
		try {
		  const check = await client.verify.v2
			.services(process.env.TWILIO_VERIFY_SERVICE_SID)
			.verificationChecks.create({
			  to: e164Phone,
			  code: credentials.code,
			});

		  console.log("[NextAuth] Twilio verifyChecks response =>", check);

		  // 3. If valid, return a user object for NextAuth
		  if (check.status === "approved") {
			// In a real app, you'd look up or create a user record in your DB
			// Return that user object:
			return {
			  id: e164Phone,      // required field for NextAuth
			  phone: e164Phone,   // store the phone
			  profileID: "someDbIDOrUUID", // fetch from DB
			};
		  } else {
			console.log("[NextAuth] Verification code is invalid.");
			// If code is not approved, return null => login fails
			return null;
		  }
		} catch (error) {
		  console.error("[NextAuth] Error calling Twilio verify:", error);
		  return null;
		}
	  },
	}),
  ],
  callbacks: {
	async jwt({ token, user }) {
	  if (user) {
		// Save user data into the token
		token.phone = user.phone;
		token.profileID = user.profileID;
	  }
	  return token;
	},
	async session({ session, token }) {
	  // Expose user info to client
	  if (token) {
		session.user = { phone: token.phone, profileID: token.profileID };
	  }
	  return session;
	},
  },
  secret: process.env.NEXTAUTH_SECRET,
});
