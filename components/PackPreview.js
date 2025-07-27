import Link from "next/link";

export default function PackPreview({ pack, userTakes }) {
  // Determine a common pack identifier
  const packID = pack.airtableId || pack.id || pack.packID;

  // New method to count verified takes:
  // A take is considered verified if the take is linked to this pack (using packID)
  // and its takeResult is either "Won" or "Lost".
  const verifiedTakesCount = userTakes
	? userTakes.reduce((count, take) => {
		if (take.packs && take.packs.includes(packID)) {
		  if (take.takeResult === "Won" || take.takeResult === "Lost") {
			return count + 1;
		  }
		}
		return count;
	  }, 0)
	: 0;

  // Number of props assumed to be provided by pack.propsCount
  const propsCount = pack.propsCount || 0;

  // Determine the cover URL.
  // If pack.packCover is an array, use the first attachment's URL.
  // Otherwise, if it's a string, use that value.
  let coverUrl;
  if (Array.isArray(pack.packCover) && pack.packCover.length > 0) {
	coverUrl = pack.packCover[0].url;
  } else if (typeof pack.packCover === "string") {
	coverUrl = pack.packCover;
  } else {
	coverUrl = null;
  }

  return (
	<Link
	  href={`/packs/${pack.packURL}`}
	  className="border rounded shadow-md bg-white overflow-visible p-2 block text-black"
	>
	  <div
		className="aspect-square relative bg-blue-600 bg-cover bg-center"
		style={{
		  backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
		}}
	  >
		{!coverUrl && (
		  <div className="flex items-center justify-center h-full">
			<span>No Cover</span>
		  </div>
		)}
	  </div>
	  <div className="p-4">
		<h2 className="text-lg font-semibold">
		  {pack.packTitle || "Untitled Pack"}
		</h2>
		{pack.eventTime && (
		  <p className="text-xs text-gray-500">
			Event: {new Date(pack.eventTime).toLocaleString()}
		  </p>
		)}
		{pack.packStatus && (
		  <p className="text-xs text-gray-500">Status: {pack.packStatus}</p>
		)}
		<div className="mt-2 text-sm text-gray-600">
		  <p>Props: {propsCount}</p>
		  <p>Verified Takes: {verifiedTakesCount}</p>
		</div>
	  </div>
	</Link>
  );
}
