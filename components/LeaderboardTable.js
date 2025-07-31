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
export default function LeaderboardTable({ leaderboard }) {
  const { data: session } = useSession();
  const currentProfileID = session?.user?.profileID;
  if (!leaderboard || leaderboard.length === 0) {
	return <p>No participants yet.</p>;
  }

  // Helper to obscure phone
  function obscurePhone(e164Phone) {
	if (!e164Phone || e164Phone === "Unknown") return "Unknown";
	const stripped = e164Phone.replace(/\D/g, "");
	if (stripped.length !== 10 && stripped.length !== 11) return e164Phone;
	const last4 = stripped.slice(-4);
	return `xxxx-${last4}`;
  }

  return (
	<table className="w-full border-collapse">
	  <thead>
		<tr className="border-b">
		  <th className="text-left py-2 px-3">Phone</th>
		  <th className="text-left py-2 px-3">Username</th>
		  <th className="text-left py-2 px-3">Takes</th>
		  <th className="text-left py-2 px-3">Record (W-L-T)</th>
		  <th className="text-left py-2 px-3">Points</th>
		</tr>
	  </thead>
	  <tbody>
		{leaderboard.map((item, idx) => (
		  <tr key={idx} className="border-b">
			<td className="py-2 px-3">
			  {item.profileID ? (
				<Link href={"/profile/" + item.profileID}>
				  <span className="text-blue-600 underline">
					{obscurePhone(item.phone)}
				  </span>
				</Link>
			  ) : (
				obscurePhone(item.phone)
			  )}
			</td>
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
			<td className="py-2 px-3">{item.takes}</td>
			<td className="py-2 px-3">{item.won || 0}-{item.lost || 0}-{item.pushed || 0}</td>
			<td className="py-2 px-3">{Math.round(item.points)}</td>
		  </tr>
		))}
	  </tbody>
	</table>
  );
}
