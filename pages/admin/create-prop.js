import React, { useState } from "react";
import { useRouter } from "next/router";

export default function CreatePropPage() {
  const router = useRouter();
  const { packId } = router.query;
  const [propShort, setPropShort] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!packId) {
      setError("Missing packId in query");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propShort, packId }),
      });
      const data = await res.json();
      if (data.success) {
        // Return to Create Pack page
        router.push(`/admin/create-pack?packId=${packId}`);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create a Prop</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="propShort" className="block text-sm font-medium text-gray-700">Short Label</label>
          <input
            id="propShort"
            type="text"
            value={propShort}
            onChange={(e) => setPropShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Prop"}
        </button>
      </form>
    </div>
  );
} 