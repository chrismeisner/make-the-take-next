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

  // Correct the formula
  const filterByFormula = `{profileMobile} = "${phoneE164}"`;

  const found = await base("Profiles")
	.select({ filterByFormula, maxRecords: 1 })
	.all();

  if (found.length > 0) {
	const existing = found[0];
	console.log("[NextAuth] Profile found =>", existing);
	const hasProfileID = Boolean(existing.fields.profileID);
	return {
	  airtableId: existing.id, // Airtable Record ID
	  profileID: existing.fields.profileID, // e.g. "c_monster"
	  mobile: existing.fields.profileMobile,
	  isUsernameMissing: !hasProfileID
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
  const hasProfileID = Boolean(newRec.fields.profileID);
  return {
	airtableId: newRec.id,
	profileID: newRec.fields.profileID,
	mobile: newRec.fields.profileMobile,
	isUsernameMissing: !hasProfileID
  };
}

// Debounce logs:
let lastLoggedSession = {};

export const authOptions = {
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
			airtableId: profile.airtableId,
			isUsernameMissing: profile.isUsernameMissing
		  };
		} catch (err) {
		  console.error("[NextAuth] Profile error:", err);
		  throw new Error("Could not create/find profile");
		}
	  },
	}),
    // Add Super Admin credentials provider
    CredentialsProvider({
      id: "super-admin",
      name: "Super Admin",
      credentials: {
        secret: { label: "Secret", type: "text" },
      },
      async authorize(credentials) {
        if (credentials.secret === process.env.SUPERADMIN_SECRET) {
          const phone = "+10000000000";
          console.log("[NextAuth] SuperAdmin authorize => upserting Profiles record for", phone);

          // Upsert super-admin profile in Airtable
          const filter = `{profileMobile} = "${phone}"`;
          const found = await base("Profiles").select({ filterByFormula: filter, maxRecords: 1 }).all();
          let airtableId;
          if (found.length > 0) {
            airtableId = found[0].id;
            // Ensure profileID is 'superadmin'
            if (found[0].fields.profileID !== "superadmin") {
              await base("Profiles").update([{ id: airtableId, fields: { profileID: "superadmin" } }]);
            }
          } else {
            const created = await base("Profiles").create([
              { fields: { profileMobile: phone, profileID: "superadmin" } },
            ]);
            airtableId = created[0].id;
          }

          return {
            phone,
            profileID: "superadmin",
            airtableId,
          };
        }
        return null;
      },
    }),
  ],

  callbacks: {
	// 1) Embed phone/profileID into the JWT
	async jwt({ token, user }) {
	  if (user) {
		token.phone = user.phone;
		token.profileID = user.profileID;
		token.airtableId = user.airtableId;
		token.isUsernameMissing = user.isUsernameMissing;

		// Debounce logs
		const now = Date.now();
		const key = `${user.profileID}`;
		if (!lastLoggedSession[key] || now - lastLoggedSession[key] > 10000) {
		  console.log("[NextAuth][jwt callback] user =>", user);
		  lastLoggedSession[key] = now;
		}
	  }
	  return token;
	},

	// 2) Add them to session.user
	async session({ session, token }) {
	  if (token) {
		session.user = {
		  phone: token.phone,
		  profileID: token.profileID,
		  airtableId: token.airtableId,
		  isUsernameMissing: token.isUsernameMissing
		};
	  }

	  const now = Date.now();
	  const key = `${session.user.profileID}`;
	  if (!lastLoggedSession[key] || now - lastLoggedSession[key] > 10000) {
		console.log("[NextAuth][session callback] session =>", session);
		lastLoggedSession[key] = now;
	  }
	  return session;
	},

	// 3) Automatic redirect => /profile/<profileID> or choose username
	async redirect({ url, baseUrl, token }) {
	  if (token?.isUsernameMissing) {
		return `${baseUrl}/create-username`;
	  }

	  if (token?.profileID) {
		return `${baseUrl}/profile/${token.profileID}`;
	  }
	  return baseUrl;
	},
  },
  // Log authentication events
  events: {
    async signIn({ user, account, isNewUser }) {
      console.log(`[NextAuth] signIn: profileID=${user.profileID} via provider=${account.provider}`);
      if (account.provider === "super-admin") {
        console.log("[NextAuth] Super Admin login successful for profileID superadmin");
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
