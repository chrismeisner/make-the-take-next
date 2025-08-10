import { useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useModal } from "../../../contexts/ModalContext";

export default function NewContestPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const { openModal } = useModal();

  const [form, setForm] = useState({
    contestTitle: "",
    contestSummary: "",
    contestPrize: "",
    contestStatus: "draft",
    contestStartTime: "",
    contestEndTime: "",
    packURLs: [], // array of pack URLs selected via modal
    contestCoverUrl: "",
  });
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        contestTitle: form.contestTitle.trim(),
        contestSummary: form.contestSummary.trim(),
        contestPrize: form.contestPrize.trim(),
        contestStatus: form.contestStatus,
        contestStartTime: form.contestStartTime || null,
        contestEndTime: form.contestEndTime || null,
        packURLs: form.packURLs,
        contestCoverUrl: form.contestCoverUrl || undefined,
      };

      const resp = await fetch("/api/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "Failed to create contest");
      }

      // Redirect to contests index or the new contest view
      router.push("/contests");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openAddPacksModal = () => {
    openModal("addPacksToContest", {
      initialSelected: form.packURLs,
      onConfirm: (urls) => setForm((prev) => ({ ...prev, packURLs: urls })),
    });
  };

  const handleCoverChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverPreviewUrl(URL.createObjectURL(file));
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        const res = await fetch('/api/admin/uploadContestCover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, fileData: base64data }),
        });
        const data = await res.json();
        if (data.success) {
          setForm((prev) => ({ ...prev, contestCoverUrl: data.url }));
        } else {
          setError(data.error || 'Failed to upload cover.');
        }
        setCoverUploading(false);
      };
    } catch (err) {
      setError(err.message || 'Failed to upload cover.');
      setCoverUploading(false);
    }
  };

  if (!session?.user) {
    return <div className="p-4 text-gray-600">You must be logged in to create a contest.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Create New Contest</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            name="contestTitle"
            value={form.contestTitle}
            onChange={handleChange}
            required
            placeholder="Contest title"
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Summary</label>
          <textarea
            name="contestSummary"
            value={form.contestSummary}
            onChange={handleChange}
            placeholder="Short description (optional)"
            className="w-full px-3 py-2 border rounded h-24"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Prize</label>
          <input
            type="text"
            name="contestPrize"
            value={form.contestPrize}
            onChange={handleChange}
            placeholder="e.g. 1000 diamonds"
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Time</label>
            <input
              type="datetime-local"
              name="contestStartTime"
              value={form.contestStartTime}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Time</label>
            <input
              type="datetime-local"
              name="contestEndTime"
              value={form.contestEndTime}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contest Cover</label>
          <input type="file" accept="image/*" onChange={handleCoverChange} className="mt-1" />
          {coverUploading && <p className="text-gray-600 mt-2">Uploading cover...</p>}
          {(coverPreviewUrl || form.contestCoverUrl) && (
            <img
              src={coverPreviewUrl || form.contestCoverUrl}
              alt="Contest cover preview"
              className="mt-2 h-32 object-contain"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            name="contestStatus"
            value={form.contestStatus}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="draft">Draft</option>
            <option value="coming up">Coming Up</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="graded">Graded</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Packs</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAddPacksModal}
              className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Add Packs
            </button>
            {form.packURLs.length > 0 && (
              <span className="text-sm text-gray-600">{form.packURLs.length} selected</span>
            )}
          </div>
          {form.packURLs.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside space-y-1">
              {form.packURLs.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Contest"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}


