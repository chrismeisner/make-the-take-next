// File: /pages/packs/index.js

import PackExplorer from "../../components/PackExplorer";
import PageContainer from "../../components/PageContainer";

export default function PacksIndexPage({ packsData }) {
  return (
    <PageContainer>
      <h1 className="text-2xl font-bold mb-4">All Packs</h1>
      <PackExplorer packs={packsData} />
    </PageContainer>
  );
}

// getServerSideProps: fetch packs from the consolidated API endpoint
export async function getServerSideProps(context) {
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
	context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
	const res = await fetch(`${origin}/api/packs`);
	const data = await res.json();
	if (!res.ok || !data.success) {
	  throw new Error(data.error || "Failed to load packs");
	}
	return { props: { packsData: data.packs || [] } };
  } catch (error) {
	console.error("[PacksIndexPage] Error fetching packs:", error);
	return { props: { packsData: [] } };
  }
}
