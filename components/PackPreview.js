import Link from "next/link";
import StatusPill from "./StatusPill";
import useLeaderboard from "../hooks/useLeaderboard";

export default function PackPreview({ pack }) {
  // Determine a common pack identifier
  const packID = pack.airtableId || pack.id || pack.packID;

  // Number of props assumed to be provided by pack.propsCount
  const propsCount = pack.propsCount || 0;
  const takeCount = pack.takeCount || 0;
  // Fetch the pack-specific leaderboard for graded packs
  const { leaderboard, loading } = useLeaderboard({ packURL: pack.packURL });
  const winnerID = !loading && leaderboard.length > 0 ? leaderboard[0].profileID : null;

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
	  href={pack.hasSuperProp ? `/props/${pack.superProps[0]}` : `/packs/${pack.packURL}`}
	  className="w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black"
	>
	  <div
		className="aspect-square w-full relative bg-blue-600 bg-cover bg-center"
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
		<StatusPill status={pack.packStatus} eventTime={pack.eventTime} />
		<div className="mt-2 text-sm text-gray-600">
		  <p>Props: {propsCount}</p>
		  <p>Takes: {takeCount}</p>
          {pack.packStatus === "graded" && winnerID && (
            <p>Winner: @{winnerID}</p>
          )}
		</div>
	  </div>
	</Link>
  );
}
