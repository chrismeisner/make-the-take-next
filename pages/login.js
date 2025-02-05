// pages/login.js
import { useState } from "react";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleSendCode(e) {
	e.preventDefault();
	setError("");

	try {
	  const res = await fetch("/api/sendCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone }),
	  });
	  const data = await res.json();

	  if (!res.ok || !data.success) {
		throw new Error(data.error || "Failed to send code");
	  }

	  // If successful, switch steps
	  setStep("code");
	} catch (err) {
	  console.error("[LoginPage] handleSendCode error:", err);
	  setError("Could not send code. Please try again.");
	}
  }

  async function handleVerifyCode(e) {
	e.preventDefault();
	setError("");

	const result = await signIn("credentials", {
	  redirect: false,
	  phone,
	  code,
	});

	if (result.ok) {
	  // If signIn succeeded, redirect or do something
	  // e.g. router.push("/");
	  router.replace("/");
	} else {
	  setError("Invalid code or verification failed.");
	}
  }

  return (
	<div style={{ maxWidth: "400px", margin: "0 auto" }}>
	  <h1>Phone Login</h1>
	  {error && <p style={{ color: "red" }}>{error}</p>}

	  {step === "phone" ? (
		<form onSubmit={handleSendCode}>
		  <label>
			Phone:
			<input
			  type="tel"
			  value={phone}
			  onChange={(e) => setPhone(e.target.value)}
			  placeholder="(555) 555-1234"
			/>
		  </label>
		  <button type="submit">Send Code</button>
		</form>
	  ) : (
		<form onSubmit={handleVerifyCode}>
		  <label>
			Verification Code:
			<input
			  type="text"
			  value={code}
			  onChange={(e) => setCode(e.target.value)}
			  placeholder="123456"
			/>
		  </label>
		  <button type="submit">Verify &amp; Login</button>
		</form>
	  )}
	</div>
  );
}
