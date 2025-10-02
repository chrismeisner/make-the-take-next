// File: /components/modals/FeaturedPackModal.js
import React, { useEffect, useState } from "react";
import GlobalModal from "./GlobalModal";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function FeaturedPackModal({ isOpen, onClose }) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [featuredPack, setFeaturedPack] = useState(null);
  const [error, setError] = useState("");

  // 1) Fetch the featured pack data
  useEffect(() => {
	if (!isOpen) return;
	async function fetchFeaturedPack() {
	  try {
		const res = await fetch("/api/featuredPack");
		const data = await res.json();
		if (data.success && data.featuredPack) {
		  setFeaturedPack(data.featuredPack);
		} else {
		  setError("No active featured pack found");
		}
	  } catch (err) {
		console.error("Error fetching featured pack:", err);
		setError("Error fetching featured pack");
	  } finally {
		setLoading(false);
	  }
	}
	fetchFeaturedPack();
  }, [isOpen]);

  // Cover image, if any
  const coverImageUrl =
	featuredPack?.packCover?.length > 0 ? featuredPack.packCover[0].url : null;

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <div className="p-6 flex flex-col items-center">
		{loading ? (
		  <div>Loading featured pack...</div>
		) : error ? (
		  <div className="text-red-600">{error}</div>
		) : featuredPack ? (
		  <>
			<h2 className="text-2xl font-bold mb-4 text-center">Featured Pack</h2>

			<Link href={`/packs/${featuredPack.packURL}`} onClick={onClose} className="block text-center">
				{coverImageUrl && (
				  <div className="mb-4 w-48 h-48 mx-auto overflow-visible rounded-lg shadow-md">
					<img
					  src={coverImageUrl}
					  alt={featuredPack.packTitle}
					  className="w-full h-full object-cover"
					/>
				  </div>
				)}
				<h3 className="text-xl font-semibold mb-2 text-center">
				  {featuredPack.packTitle}
				</h3>
			</Link>

			{/* Removed Progress Bar Section */}

			{featuredPack.packPrizeImage?.length > 0 && (
			  <img
				src={featuredPack.packPrizeImage[0].url}
				alt={featuredPack.packTitle}
				className="w-full h-48 object-cover rounded mb-4"
			  />
			)}

			<p className="text-sm text-gray-700 text-center">
			  {featuredPack.prizeSummary}
			</p>

			<div className="mt-6 flex gap-4 justify-center">
			  <Link href={`/packs/${featuredPack.packURL}`}>
				<button
				  onClick={onClose}
				  className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
				  Make my takes
				</button>
			  </Link>
			  <button
				onClick={onClose}
				className="px-6 py-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
			  >
				Close
			  </button>
			</div>
		  </>
		) : null}
	  </div>
	</GlobalModal>
  );
}