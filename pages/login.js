import { useState } from "react";
import { useRouter } from "next/router";
import InputMask from "react-input-mask";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState("phone"); // "phone" -> "code"
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleSendCode(e) {
	e.preventDefault();
	setError("");
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
	  console.error("[LoginPage] handleSendCode error:", err);
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
	// Call NextAuth signIn with credentials
	const result = await signIn("credentials", {
	  redirect: false,
	  phone,
	  code,
	});
	if (!result.ok) {
	  setError(result.error || "Invalid code or verification failed.");
	  return;
	}
	// On success, redirect to the home or desired page
	router.push("/");
  }

  return (
	<div style={{ maxWidth: 400, margin: "2rem auto" }}>
	  <h1>Phone Login</h1>
	  {error && <p style={{ color: "red" }}>{error}</p>}
	  {step === "phone" && (
		<form onSubmit={handleSendCode}>
		  <label>
			Enter your phone:
			<InputMask
			  mask="(999) 999-9999"
			  value={phone}
			  onChange={(e) => setPhone(e.target.value)}
			>
			  {() => <input type="tel" placeholder="(555) 555-1234" />}
			</InputMask>
		  </label>
		  <div style={{ marginTop: "1rem" }}>
			<button type="submit">Send Code</button>
		  </div>
		</form>
	  )}
	  {step === "code" && (
		<form onSubmit={handleVerifyCode}>
		  <label>
			Enter the 6-digit code:
			<InputMask
			  mask="999999"
			  value={code}
			  onChange={(e) => setCode(e.target.value)}
			>
			  {() => <input type="tel" placeholder="123456" />}
			</InputMask>
		  </label>
		  <div style={{ marginTop: "1rem" }}>
			<button type="submit">Verify &amp; Log In</button>
		  </div>
		</form>
	  )}
	</div>
  );
}
