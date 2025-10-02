import React, { useState } from "react";
import InputMask from "react-input-mask";
import { signIn, getSession } from "next-auth/react";
import GlobalModal from "./GlobalModal";
import { useModal } from "../../contexts/ModalContext";

// A reusable login modal for simple phone -> code auth.
// Props:
// - isOpen: boolean
// - onClose: () => void
// - title?: string
// - ctaLabel?: string
// - onSuccess?: (session) => void
export default function LoginModal({ isOpen, onClose, title = "Log In", ctaLabel = "Verify & Continue", onSuccess, reason, subscribeCategory, subscribeLeague, subscribeTeams, subscribeSeries, subscribeSeriesList }) {
  const { openModal } = useModal();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sanitizeUSPhoneInput = (value) => {
    const numeric = String(value || "").replace(/\D/g, "");
    if (numeric.length >= 11 && numeric.startsWith("1")) {
      return numeric.slice(-10);
    }
    return numeric.slice(0, 10);
  };

  const handleSendCode = async (e) => {
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
      setError("Could not send code. Please try again.");
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!code) {
      setError("Please enter your 6-digit code");
      return;
    }
    setIsLoading(true);
    const result = await signIn("credentials", { phone, code, redirect: false });
    if (!result.ok) {
      setIsLoading(false);
      setError(result.error || "Invalid code or verification failed.");
      return;
    }
    const session = await getSession();
    if (!session?.user) {
      setIsLoading(false);
      setError("Session not found after login");
      return;
    }
    try {
      onSuccess?.(session);
      if (reason === 'notify') {
        openModal('subscribe', {
          category: subscribeCategory || 'pack_open',
          league: subscribeLeague || '',
          teams: Array.isArray(subscribeTeams) ? subscribeTeams : [],
          series: subscribeSeries || null,
          seriesList: Array.isArray(subscribeSeriesList) ? subscribeSeriesList : [],
        });
      } else {
        // Default: show success confirmation modal
        openModal("loginSuccess", {
          title: "Success",
          message: "You are now signed in.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      {step === "phone" && (
        <form onSubmit={handleSendCode}>
          <label className="block mb-2 font-semibold text-gray-700">Enter your phone:</label>
          <InputMask
            mask="(999) 999-9999"
            value={phone}
            onChange={(e) => setPhone(sanitizeUSPhoneInput(e.target.value))}
            onBlur={(e) => setPhone(sanitizeUSPhoneInput(e.target.value))}
            type="text"
            inputMode="numeric"
            name="user_phone"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="(555) 555-1234"
          />
          <div className="mt-4">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Next</button>
          </div>
        </form>
      )}
      {step === "code" && (
        <form onSubmit={handleVerifyCode}>
          <label className="block mb-2 font-semibold text-gray-700">Enter the 6-digit code:</label>
          <InputMask
            mask="999999"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maskChar=""
            type="text"
            name="verificationCode"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            className="w-32 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="123456"
          />
          <div className="mt-4">
            <button type="submit" disabled={isLoading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              {isLoading ? "Verifying..." : ctaLabel}
            </button>
          </div>
        </form>
      )}
    </GlobalModal>
  );
}


