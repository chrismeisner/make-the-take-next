import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { getSession } from "next-auth/react";

export default function CreateUsernamePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const session = await getSession();
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      if (!session.user.isUsernameMissing) {
        router.replace(`/profile/${session.user.profileID}`);
        return;
      }
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.match(/^[a-zA-Z0-9_]{3,20}$/)) {
      setError("Username must be 3–20 characters: letters, numbers, or underscores.");
      return;
    }
    try {
      const res = await fetch("/api/profile/updateUsername", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to set username");
      }
      router.push(`/profile/${username}`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong");
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="max-w-md mx-auto mt-10 p-4 border rounded shadow-sm">
      <h1 className="text-2xl font-bold mb-4">Choose Your Username</h1>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label className="block mb-2 font-semibold text-gray-700">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="your_handle"
        />
        <div className="mt-4">
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Save Username
          </button>
        </div>
      </form>
    </div>
  );
} 