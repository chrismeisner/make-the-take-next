// File: pages/packs/[packURL]/list.js

import React from "react";
import { useSession } from "next-auth/react";
import { getToken } from "next-auth/jwt";
import { PackContextProvider } from "../../../contexts/PackContext";
import PackListView from "../../../components/PackListView";

export async function getServerSideProps(context) {
  const { packURL } = context.params;
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host = context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
    const res = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { notFound: true };
    }
    const debugLogs = { packURL, origin };
    return {
      props: {
        packData: data.pack,
        leaderboard: data.leaderboard || [],
        debugLogs,
      },
    };
  } catch {
    return { notFound: true };
  }
}

export default function PackListPage({ packData, leaderboard, debugLogs }) {
  return (
    <PackContextProvider packData={packData}>
      <PackListView packData={packData} leaderboard={leaderboard} debugLogs={debugLogs} />
    </PackContextProvider>
  );
} 