// File: /components/LeaderboardTable.js

import Link from "next/link";
import { useSession } from "next-auth/react";

/**
 * Reusable scoreboard table.
 * Expects an array "leaderboard" with objects like:
 * {
 *   phone: string,
 *   count: number,   // # of takes
 *   points: number,
 *   profileID?: string,
 *   won?: number,
 *   lost?: number,
 *   ...
 * }
 */
export default function LeaderboardTable({ leaderboard, packSlugOrId }) {
  const { data: session } = useSession();
  const currentProfileID = session?.user?.profileID;
  const hasEntries = Array.isArray(leaderboard) && leaderboard.length > 0;

  return (
	<div className="overflow-x-auto w-full">
	  <table className="min-w-full border-collapse">
		<thead>
          <tr className="border-b">
			<th className="text-left py-2 px-3 w-10"></th>
			<th className="text-left py-2 px-3">Taker</th>
			<th className="text-left py-2 px-3">REC</th>
			<th className="text-left py-2 px-3">PER</th>
			<th className="text-left py-2 px-3">PTS</th>
            <th className="text-right py-2 px-3">Compare</th>
		  </tr>
		</thead>
		<tbody>
		  {!hasEntries ? (
			<tr>
			  <td colSpan={5} className="py-6 px-3 text-center text-gray-500">
				No participants yet. Be the first to make a take!
			  </td>
			</tr>
		  ) : (
            leaderboard.map((item, idx) => (
              <tr key={idx} className="border-b">
				<td className="py-2 px-3 w-10">{idx + 1}</td>
				<td className="py-2 px-3">
				  {item.profileID ? (
					<Link href={"/profile/" + item.profileID}>
					  <span className={"text-blue-600 underline " + (item.profileID === currentProfileID ? "font-bold" : "")}>
						{item.profileID}
					  </span>
					</Link>
				  ) : (
					'Unknown'
				  )}
				</td>
				<td className="py-2 px-3">{item.won || 0}-{item.lost || 0}-{item.pushed || 0}</td>
				<td className="py-2 px-3">
				  {(() => {
					const w = Number(item.won || 0);
					const l = Number(item.lost || 0);
					const d = w + l;
					const r = d > 0 ? w / d : 0;
					return r.toFixed(3).replace(/^0/, '');
				  })()}
				</td>
				<td className="py-2 px-3">{Math.round(item.points)}</td>
                <td className="py-2 px-3 text-right">
                  {(() => {
                    const other = item.profileID;
                    const can = other && currentProfileID && other !== currentProfileID;
                    const slug = packSlugOrId || item.packURL || item.packID || null;
                    if (!can || !slug) return null;
                    return (
                      <Link href={{ pathname: `/packs/[packURL]/h2h`, query: { u1: currentProfileID, u2: other, packURL: slug } }}>
                        <span className="text-blue-600 underline">Compare</span>
                      </Link>
                    );
                  })()}
                </td>
			  </tr>
			))
		  )}
		</tbody>
	  </table>
	</div>
  );
}
