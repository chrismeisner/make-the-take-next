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

  // For progress
  const [totalCount, setTotalCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

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

  // 2) Fetch the user’s pack progress if user is logged in
  useEffect(() => {
	if (session?.user && featuredPack?.packID) {
	  async function loadProgress() {
		try {
		  const res = await fetch(`/api/userPackProgress?packID=${featuredPack.packID}`);
		  const data = await res.json();
		  if (data.success) {
			setTotalCount(data.totalCount);
			setCompletedCount(data.completedCount);
		  }
		} catch (err) {
		  console.error("Error fetching user pack progress:", err);
		}
	  }
	  loadProgress();
	}
  }, [session, featuredPack]);

  // 3) Compute percentage
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Cover image, if any
  const coverImageUrl =
	featuredPack?.packCover?.length > 0
	  ? featuredPack.packCover[0].url
	  : null;

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <div className="p-4">
		{loading ? (
		  <div>Loading featured pack...</div>
		) : error ? (
		  <div className="text-red-600">{error}</div>
		) : featuredPack ? (
		  <>
			<h2 className="text-2xl font-bold mb-2">Featured Pack</h2>

			<Link href={`/packs/${featuredPack.packURL}`}>
			  <div
				className="cursor-pointer"
				onClick={onClose}
			  >
				{coverImageUrl && (
				  <div className="mb-4 w-48 h-48 mx-auto overflow-hidden rounded-lg shadow-md">
					<img
					  src={coverImageUrl}
					  alt={featuredPack.packTitle}
					  className="w-full h-full object-cover"
					/>
				  </div>
				)}
				<h3 className="text-xl font-semibold mb-2">
				  {featuredPack.packTitle}
				</h3>
			  </div>
			</Link>

			{/* If user is logged in, show the progress bar */}
			{session?.user && (
			  <div className="mb-4">
				<div className="w-full bg-gray-300 rounded-full h-4">
				  <div
					className="bg-blue-600 h-4 rounded-full"
					style={{ width: `${percentage}%` }}
				  ></div>
				</div>
				<p className="text-sm text-gray-600 mt-1">
				  {completedCount} of {totalCount} props completed ({percentage}%)
				</p>
			  </div>
			)}

			{featuredPack.packPrizeImage?.length > 0 && (
			  <img
				src={featuredPack.packPrizeImage[0].url}
				alt={featuredPack.packTitle}
				className="w-full h-48 object-cover rounded mb-4"
			  />
			)}

			<p className="text-sm text-gray-700">
			  {featuredPack.prizeSummary}
			</p>

			<div className="mt-4 flex gap-2">
			  <Link href={`/packs/${featuredPack.packURL}`}>
				<button
				  onClick={onClose}
				  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
				  View Pack Details
				</button>
			  </Link>
			  <button
				onClick={onClose}
				className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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
