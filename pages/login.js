// File: /pages/login.js
import { useState } from "react";
import { useRouter } from "next/router";
import InputMask from "react-input-mask";
import { signIn, getSession } from "next-auth/react";

export default function LoginPage({ superAdminSecret }) {
  const router = useRouter();
  const [step, setStep] = useState("phone"); // "phone" -> "code"
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleSendCode(e) {
	e.preventDefault();
	setError("");
    // Super-admin bypass: entering 0000000000
    const numericPhone = phone.replace(/\D/g, "");
    if (numericPhone === "0000000000") {
      console.log("[LoginPage] Super-admin login triggered");
      // Call super-admin credentials provider
      await signIn("super-admin", { secret: superAdminSecret });
      return;
    }
	try {
	  const resp = await fetch("/api/sendCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone }),
	  });
	  const data = await resp.json();
	  if (!resp.ok || data.error) {
		throw new Error(data.error || "Failed to send code");
	  }
	  setStep("code");
	} catch (err) {
	  console.error("🚫 [LoginPage] handleSendCode error:", err);
	  setError("Could not send code. Please try again.");
	}
  }

  async function handleVerifyCode(e) {
	e.preventDefault();
	setError("");

	if (!code) {
	  setError("Please enter your 6-digit code");
	  return;
	}

	// Call NextAuth signIn with redirect: false so we can handle the flow manually.
	const result = await signIn("credentials", {
	  phone,
	  code,
	  redirect: false,
	});

	if (!result.ok) {
	  setError(result.error || "Invalid code or verification failed.");
	  return;
	}

	// On success, fetch the updated session.
	const session = await getSession();
	// If the user still hasn't picked a username, send them to that page.
	if (session?.user?.isUsernameMissing) {
	  router.push("/create-username");
	  return;
	}
	const profileID = session?.user?.profileID;
	// Always redirect to the user's profile page.
	if (profileID) {
	  router.push(`/profile/${profileID}`);
	} else {
	  router.push("/");
	}
  }

  return (
	<div className="max-w-md mx-auto mt-10 p-4 border rounded shadow-sm">
	  <h1 className="text-2xl font-bold mb-4">Phone Login</h1>

	  {error && <p className="text-red-600 mb-2">{error}</p>}

	  {step === "phone" && (
		<form onSubmit={handleSendCode}>
		  <label className="block mb-2 font-semibold text-gray-700">
			Enter your phone:
		  </label>
		  <InputMask
			mask="(999) 999-9999"
			value={phone}
			onChange={(e) => setPhone(e.target.value)}
		  >
			{() => (
			  <input
				type="tel"
				name="phone"
				autoComplete="tel"
				className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
				placeholder="(555) 555-1234"
			  />
			)}
		  </InputMask>

		  <div className="mt-4">
			<button
			  type="submit"
			  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
			>
			  Send Code
			</button>
		  </div>
		</form>
	  )}

	  {step === "code" && (
		<form onSubmit={handleVerifyCode}>
		  <label className="block mb-2 font-semibold text-gray-700">
			Enter the 6-digit code:
		  </label>
		  <InputMask
			mask="999999"
			value={code}
			onChange={(e) => setCode(e.target.value)}
			maskChar=""
		  >
			{() => (
			  <input
				type="text"
				name="verificationCode"
				autoComplete="one-time-code"
				inputMode="numeric"
				maxLength={6}
				className="w-32 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
				placeholder="123456"
			  />
			)}
		  </InputMask>

		  <div className="mt-4">
			<button
			  type="submit"
			  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
			>
			  Verify &amp; Log In
			</button>
		  </div>
		</form>
	  )}
	</div>
  );
}

// Pass super-admin secret to the page
export async function getServerSideProps() {
  return {
    props: {
      superAdminSecret: process.env.SUPERADMIN_SECRET || null,
    },
  };
}
