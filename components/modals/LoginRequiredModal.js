import React, { useState } from "react";
import InputMask from "react-input-mask";
import { signIn, getSession } from "next-auth/react";
// Removed usePackContext; packing in submitAllTakes and packTitle via props
import { useModal } from "../../contexts/ModalContext";
import GlobalModal from "./GlobalModal";

export default function LoginRequiredModal({ isOpen, onClose, receiptId, packTitle, submitAllTakes }) {
  const { openModal, closeModal } = useModal();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      console.error("[LoginRequiredModal] sendCode error:", err);
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
    // Fetch updated session
    const session = await getSession();
    if (!session?.user) {
      setIsLoading(false);
      setError("Session not found after login");
      return;
    }
    // If the user still hasn't set their username, prompt for it
    if (session.user.isUsernameMissing) {
      openModal("usernameRequired", { receiptId, packTitle, submitAllTakes, profileID: session.user.profileID });
      setIsLoading(false);
      return;
    }
    // Submit takes now that we're authenticated
    const newTakeIDs = await submitAllTakes(receiptId);
    // Fire-and-forget SMS notification to the user
    try {
      fetch("/api/notifyPackSubmitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packURL: window?.location?.pathname.split("/")[2], packTitle, receiptId }),
      });
    } catch {}
    openModal("packCompleted", { packTitle, receiptId, newTakeIDs });
    setIsLoading(false);
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">Log In to Submit</h2>
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
              Next
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
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              {isLoading ? 'Verifying...' : 'Verify & Submit'}
            </button>
          </div>
        </form>
      )}
    </GlobalModal>
  );
} 