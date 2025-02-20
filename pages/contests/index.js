// File: /pages/contests/index.js

import Link from "next/link";

export default function ContestsIndexPage({ contests, error }) {
  if (error) {
	return (
	  <div style={{ padding: "1rem", color: "red" }}>
		Error: {error}
	  </div>
	);
  }

  if (!contests || contests.length === 0) {
	return (
	  <div style={{ padding: "1rem" }}>
		<h1>Contests</h1>
		<p>No contests found.</p>
	  </div>
	);
  }

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>Contests</h1>
	  <ul>
		{contests.map((contest) => (
		  <li key={contest.contestID} style={{ marginBottom: "0.5rem" }}>
			<Link href={`/contests/${contest.contestID}`}>
			  <span style={{ color: "blue", textDecoration: "underline", cursor: "pointer" }}>
				{contest.contestTitle} ({contest.contestID})
			  </span>
			</Link>
		  </li>
		))}
	  </ul>
	</div>
  );
}

/**
 * SSR to load all contests from /api/contests
 */
export async function getServerSideProps(context) {
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
	context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const fallbackOrigin = `${proto}://${host}`;
  const origin = process.env.SITE_URL || fallbackOrigin;

  try {
	const res = await fetch(`${origin}/api/contests`);
	const data = await res.json();
	if (!res.ok || !data.success) {
	  throw new Error(data.error || "Failed to load contests");
	}
	return {
	  props: {
		contests: data.contests,
	  },
	};
  } catch (err) {
	console.error("[ContestsIndexPage] Error =>", err);
	return {
	  props: {
		error: err.message || "Could not load contests",
	  },
	};
  }
}
