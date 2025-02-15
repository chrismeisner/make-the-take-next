// File: /pages/prizes/index.js
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Airtable from "airtable";

// OPTIONAL: if you need node-canvas or firebase, add them, but probably not for prizes
// import { createCanvas, loadImage } from "canvas";
// import { storageBucket } from "../../lib/firebaseAdmin";

// Initialize Airtable base
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default function PrizesPage({ prizes }) {
  const [sortedPrizes, setSortedPrizes] = useState(prizes);
  const [sortOrder, setSortOrder] = useState("asc"); // Default sort order: ascending (Lowest to Highest)

  useEffect(() => {
	const sorted = [...prizes].sort((a, b) => {
	  return sortOrder === "desc" 
		? b.prizePTS - a.prizePTS 
		: a.prizePTS - b.prizePTS;
	});
	setSortedPrizes(sorted);
  }, [prizes, sortOrder]);

  const handleSortChange = (event) => {
	setSortOrder(event.target.value);
  };

  return (
	<div className="p-4 max-w-4xl mx-auto">
	  <h1 className="text-2xl font-bold mb-4">Available Prizes</h1>

	  <div className="mb-4">
		<label htmlFor="sortPrizes" className="mr-2">Sort by Points:</label>
		<select 
		  id="sortPrizes" 
		  value={sortOrder} 
		  onChange={handleSortChange}
		  className="px-4 py-2 border rounded"
		>
		  <option value="asc">Lowest to Highest</option>
		  <option value="desc">Highest to Lowest</option>
		</select>
	  </div>

	  {sortedPrizes.length === 0 ? (
		<p className="text-gray-600">No available prizes at this time.</p>
	  ) : (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		  {sortedPrizes.map((prize) => (
			<PrizeCard key={prize.prizeID} prize={prize} />
		  ))}
		</div>
	  )}

	  <p className="mt-4">
		<Link href="/" className="text-blue-600 underline">
		  Back to Home
		</Link>
	  </p>
	</div>
  );
}

/**
 * Basic card subcomponent for each prize
 */
function PrizeCard({ prize }) {
  const { prizeTitle, prizeIMGs, prizePTS, prizeID } = prize;

  return (
	<div className="border rounded shadow-sm bg-white p-4">
	  {/* If there's an image, show it */}
	  {prizeIMGs && prizeIMGs.length > 0 && (
		<img
		  src={prizeIMGs[0].url}
		  alt={`Prize ${prizeTitle}`}
		  className="w-full h-32 object-cover rounded mb-2"
		/>
	  )}

	  <h2 className="text-lg font-semibold">{prizeTitle}</h2>
	  <p className="text-sm text-gray-600">
		Points Required: <strong>{prizePTS}</strong>
	  </p>

	  {/* Possibly link to a detail page if you want /prizes/[prizeID] */}
	  <p className="mt-2">
		<Link
		  href={`/prizes/${encodeURIComponent(prizeID)}`}
		  className="inline-block text-blue-600 underline text-sm"
		>
		  View Details
		</Link>
	  </p>
	</div>
  );
}

/**
 * getServerSideProps fetches prizes from Airtable, only "available" ones
 */
export async function getServerSideProps() {
  try {
	// 1) Query "Prizes" table for all records with prizeStatus = "available"
	const records = await base("Prizes")
	  .select({
		maxRecords: 100,
		filterByFormula: `{prizeStatus} = "available"`,
	  })
	  .all();

	// 2) Map each record to a simpler object
	const prizes = records.map((rec) => {
	  const f = rec.fields;

	  let prizeIMGs = [];
	  if (Array.isArray(f.prizeIMG) && f.prizeIMG.length > 0) {
		// Each object => { url, filename, ... }
		prizeIMGs = f.prizeIMG.map((att) => ({
		  url: att.url,
		  filename: att.filename,
		}));
	  }

	  return {
		prizeID: f.prizeID || rec.id,
		prizeTitle: f.prizeTitle || "Untitled Prize",
		prizePTS: f.prizePTS || 0,
		prizeIMGs,
		// We skip prizeStatus because we already know it's "available"
	  };
	});

	// 3) Return as props
	return {
	  props: {
		prizes,
	  },
	};
  } catch (err) {
	console.error("[PrizesPage] Error fetching prizes =>", err);
	return {
	  props: {
		prizes: [],
	  },
	};
  }
}