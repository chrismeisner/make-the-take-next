// File: /pages/api/auth/[...nextauth].js

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import twilio from "twilio";
import Airtable from "airtable";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { createRepositories } from "../../../lib/dal/factory";

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

  const backend = getDataBackend();
  if (backend === "postgres") {
    const { profiles } = createRepositories();
    const row = await profiles.ensureByPhone(phoneE164);
    // In PG, we treat profile_id as the handle; missing if null/empty or default auto value pattern
    const handle = (row.profile_id || "").trim();
    const isGeneratedDefault = /^taker\d{6}$/.test(handle);
    const isUsernameMissing = !handle || isGeneratedDefault;
    return {
      userId: row.id,
      profileID: row.profile_id,
      mobile: row.mobile_e164,
      superAdmin: Boolean(row.super_admin),
      isUsernameMissing,
    };
  }

  // Airtable path
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
      superAdmin: Boolean(existing.fields.superAdmin),
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
        superAdmin: false,
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
    superAdmin: Boolean(newRec.fields.superAdmin),
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

		// Create or retrieve profile via selected backend
		try {
		  const profile = await ensureProfileRecord(e164Phone);
		  console.log("[NextAuth] authorize => success, returning user:", e164Phone, profile.profileID);
		  const backend = getDataBackend();
		  if (backend === "postgres") {
			return {
			  phone: e164Phone,
			  profileID: profile.profileID,
			  userId: profile.userId,
			  superAdmin: Boolean(profile.superAdmin),
			  isUsernameMissing: profile.isUsernameMissing,
			};
		  }
		  return {
			phone: e164Phone,
			profileID: profile.profileID,
			airtableId: profile.airtableId,
			superAdmin: Boolean(profile.superAdmin),
			isUsernameMissing: profile.isUsernameMissing,
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

          // Upsert super-admin profile in Airtable without forcing profileID to a fixed value
          const filter = `{profileMobile} = "${phone}"`;
          const found = await base("Profiles").select({ filterByFormula: filter, maxRecords: 1 }).all();
          let airtableId;
          let profileID;

          if (found.length > 0) {
            const rec = found[0];
            airtableId = rec.id;
            profileID = rec.fields.profileID;
            const updates = {};

            if (!profileID) {
              profileID = generateRandomProfileID(8);
              updates.profileID = profileID;
            }

            if (!rec.fields.superAdmin) {
              updates.superAdmin = true;
            }

            if (Object.keys(updates).length > 0) {
              await base("Profiles").update([{ id: airtableId, fields: updates }]);
            }
          } else {
            profileID = generateRandomProfileID(8);
            const created = await base("Profiles").create([
              { fields: { profileMobile: phone, profileID, superAdmin: true } },
            ]);
            airtableId = created[0].id;
          }

          return { phone, profileID, airtableId, superAdmin: true };
        }
        return null;
      },
    }),
  ],

  callbacks: {
    // 1) Embed phone/profileID into the JWT
    async jwt({ token, user, trigger, session }) {
      // When the client calls session.update({ profileID: 'new' }), persist into JWT
      if (trigger === 'update' && session?.profileID) {
        token.profileID = session.profileID;
        // If we also carry a username field in token, keep them in sync
        token.username = session.profileID;
      }
	  if (user) {
		token.phone = user.phone;
		token.profileID = user.profileID;
		const backend = getDataBackend();
		if (backend === "postgres") {
		  token.userId = user.userId;
		  delete token.airtableId;
		} else {
		  token.airtableId = user.airtableId;
		  delete token.userId;
		}
		token.isUsernameMissing = user.isUsernameMissing;
		token.superAdmin = Boolean(user.superAdmin);

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
		const backend = getDataBackend();
		const baseUser = {
		  phone: token.phone,
		  profileID: token.profileID,
		  isUsernameMissing: token.isUsernameMissing,
		  superAdmin: Boolean(token.superAdmin),
		};
		session.user = backend === "postgres"
		  ? { ...baseUser, userId: token.userId }
		  : { ...baseUser, airtableId: token.airtableId };
	  }

	  const now = Date.now();
	  const key = `${session.user.profileID}`;
	  if (!lastLoggedSession[key] || now - lastLoggedSession[key] > 10000) {
		console.log("[NextAuth][session callback] session =>", session);
		lastLoggedSession[key] = now;
	  }
	  return session;
	},

	// 3) Automatic redirect => dashboard (disable create-username flow)
	async redirect({ url, baseUrl, token }) {
	  return baseUrl;
	},
  },
  // Log authentication events
  events: {
    async signIn({ user, account, isNewUser }) {
      console.log(`[NextAuth] signIn: profileID=${user.profileID} via provider=${account.provider}`);
      if (account.provider === "super-admin") {
        console.log(`[NextAuth] Super Admin login successful for profileID=${user.profileID}`);
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
