// File: pages/packs/[packURL].js

import React, { useEffect, useState } from 'react';
import Airtable from 'airtable';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import { PackContextProvider } from '../../contexts/PackContext';
import { useModal } from '../../contexts/ModalContext';
import { useSession } from 'next-auth/react';
import { usePackContext } from '../../contexts/PackContext';
import { useRouter } from 'next/router';
import PackCarouselView from '../../components/PackCarouselView';
import Head from 'next/head';
import PropDetailPage from '../props/[propID]';
import InlineCardProgressFooter from '../../components/InlineCardProgressFooter';
import PageHeader from '../../components/PageHeader';
import PageContainer from '../../components/PageContainer';
import Link from 'next/link';

export async function getServerSideProps(context) {
  const { packURL } = context.params;
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  const { ref } = context.query;
  const isRef = Boolean(ref);
  const proto = context.req.headers['x-forwarded-proto'] || 'http';
  const host = context.req.headers['x-forwarded-host'] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
    const res = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { notFound: true };
    }
    const debugLogs = { packURL, origin };
    // Fetch friend's takes if ref query is present
    let friendTakesByProp = {};
    let friendProfile = null;
    if (ref) {
      const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
      const takeRecords = await base('Takes').select({
        filterByFormula: `{receiptID} = "${ref}"`,
        maxRecords: 1000,
      }).all();
      friendTakesByProp = takeRecords.reduce((acc, rec) => {
        const { propID, propSide } = rec.fields;
        if (propID) acc[propID] = { side: propSide };
        return acc;
      }, {});
      // Derive friend’s profileID from the first take and fetch profile data
      if (takeRecords.length > 0 && takeRecords[0].fields.profileID) {
        try {
          const profileRes = await fetch(
            `${origin}/api/profile/${encodeURIComponent(takeRecords[0].fields.profileID)}`
          );
          const profileJson = await profileRes.json();
          if (profileRes.ok && profileJson.success) {
            friendProfile = profileJson.profile;
          }
        } catch (err) {
          console.error('Error fetching friend profile:', err);
        }
      }
    }
    // Collect all distinct receipts (groups of takes) for this user on this pack
    // Get and sanitize session for serialization
    const rawSession = await getServerSession(context.req, context.res, authOptions);
    // Replace undefined user fields with null
    const session = rawSession
      ? {
          ...rawSession,
          user: {
            phone: rawSession.user?.phone ?? null,
            profileID: rawSession.user?.profileID ?? null,
            airtableId: rawSession.user?.airtableId ?? null,
            isUsernameMissing: rawSession.user?.isUsernameMissing ?? null,
          },
        }
      : null;
    console.log('[getServerSideProps] session:', session);
    let userReceipts = [];
    if (session?.user?.phone) {
      console.log('[getServerSideProps] looking up receipts for phone:', session.user.phone);
      const phone = session.user.phone;
      const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
      // Use external propID values to match Takes.propID field
      const propIDs = data.pack.props.map((p) => p.propID).filter(Boolean);
      console.log('[getServerSideProps] propIDs (external) for receipt lookup:', propIDs);
      if (propIDs.length > 0) {
        const filters = propIDs.map((id) => `{propID}="${id}"`).join(",");
        console.log('[getServerSideProps] using filter formula (by propID):', `AND({takeMobile}="${phone}", OR(${filters}))`);
        const takeRecords = await base("Takes")
          .select({ filterByFormula: `AND({takeMobile}="${phone}", OR(${filters}))`, maxRecords: 1000 })
          .all();
        console.log('[getServerSideProps] fetched takeRecords count:', takeRecords.length);
        // Group takes by receiptID and capture earliest createdTime
        const receiptMap = {};
        takeRecords.forEach((rec) => {
          const rid = rec.fields.receiptID;
          if (!rid) return;
          const created = rec._rawJson.createdTime;
          if (!receiptMap[rid] || new Date(created) < new Date(receiptMap[rid])) {
            receiptMap[rid] = created;
          }
        });
        userReceipts = Object.entries(receiptMap).map(([receiptID, createdTime]) => ({
          receiptID,
          createdTime: new Date(createdTime).toISOString(),
        }));
        console.log('[getServerSideProps] final userReceipts:', userReceipts);
      }
    }
    // Determine latest receipt ID for challenge acceptance check
    let latestReceiptId = null;
    if (userReceipts.length > 0) {
      latestReceiptId = userReceipts.reduce((prev, curr) =>
        new Date(curr.createdTime) > new Date(prev.createdTime) ? curr : prev,
        userReceipts[0]
      ).receiptID;
    }

    // Fetch the logged-in user's takes for their latest receipt
    let challengerTakesByProp = {};
    if (ref && latestReceiptId) {
      const challengerTakeRecords = await base('Takes').select({
        filterByFormula: `{receiptID} = "${latestReceiptId}"`,
        maxRecords: 1000,
      }).all();
      challengerTakesByProp = challengerTakeRecords.reduce((acc, rec) => {
        const { propID, propSide } = rec.fields;
        if (propID) acc[propID] = { side: propSide };
        return acc;
      }, {});
    }
    // Check if a challenge record already exists for this pack/ref and user
    let hasAcceptedChallenge = false;
    if (ref && latestReceiptId) {
      try {
        const chRes = await fetch(
          `${origin}/api/challenges?packURL=${encodeURIComponent(packURL)}`
        );
        const chData = await chRes.json();
        if (chRes.ok && chData.success) {
          hasAcceptedChallenge = chData.challenges.some(c =>
            c.fields.initiatorReceiptID === ref && c.fields.challengerReceiptID === latestReceiptId
          );
        }
      } catch (err) {
        console.error('[getServerSideProps] Error checking challenge acceptance:', err);
      }
    }
    // Fetch recent activity for this pack (errors here should not break the page)
    let activity = [];
    try {
      const propIDs = data.pack.props.map((p) => p.propID).filter(Boolean);
      if (propIDs.length > 0) {
        // Fetch activity without sorting (metadata createdTime isn't a field)
        const activityRecords = await base('Takes').select({
          filterByFormula: `OR(${propIDs.map((id) => `{propID}="${id}"`).join(',')})`,
          maxRecords: 50,
        }).all();
        // Sort by record metadata createdTime descending and take top 20
        activityRecords.sort((a, b) => new Date(b._rawJson.createdTime) - new Date(a._rawJson.createdTime));
        const topRecords = activityRecords.slice(0, 20);
        activity = topRecords.map((rec) => ({
          id: rec.id,
          propID: rec.fields.propID || '',
          propTitle: rec.fields.propTitle || '',
          profileID: rec.fields.profileID || '',
          createdTime: rec._rawJson.createdTime,
        }));
      }
    } catch (err) {
      console.error('[getServerSideProps] Error fetching activity =>', err);
    }
    console.log('[getServerSideProps] activity:', activity);

    return {
      props: {
        session,
        packData: data.pack,
        leaderboard: data.leaderboard || [],
        debugLogs,
        friendTakesByProp,
        friendProfile,
        userReceipts,
        latestReceiptId,
        challengerTakesByProp,
        activity,
        isRef,
        hasAcceptedChallenge,
      },
    };
  } catch {
    return { notFound: true };
  }
}

// Challenge button for sharing picks via new ChallengeShareModal
function ChallengeButton({ receiptId }) {
  const { openModal } = useModal();
  const { selectedChoices, packData } = usePackContext();
  const router = useRouter();
  // Build challenge URL
  const challengeUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/packs/${router.query.packURL}?ref=${receiptId}`
    : '';
  // Build picks text from selectedChoices
  const picksText = Object.entries(selectedChoices)
    .map(([propID, side]) => {
      const prop = packData.props.find(p => p.propID === propID);
      if (!prop) return null;
      const sideLabel = side === 'A'
        ? (prop.PropSideAShort || 'A')
        : (prop.PropSideBShort || 'B');
      const label = prop.propShort || prop.propTitle || prop.propID;
      return `${label}: ${sideLabel}`;
    })
    .filter(Boolean)
    .join(', ');
  const handleClick = () => {
    openModal('challengeShare', { packTitle: packData.packTitle, picksText, challengeUrl });
  };
  return (
    <button
      onClick={handleClick}
      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      Challenge
    </button>
  );
}

export default function PackDetailPage({ packData, leaderboard, debugLogs, friendTakesByProp, challengerTakesByProp, friendProfile, userReceipts, activity, isRef, latestReceiptId, hasAcceptedChallenge }) {
  const { openModal } = useModal();
  const router = useRouter();
  const { data: session } = useSession();
  // Determine the latest receipt ID for this user
  const latestReceiptObj = userReceipts.length
    ? userReceipts.reduce((prev, curr) =>
        new Date(curr.createdTime) > new Date(prev.createdTime) ? curr : prev,
        userReceipts[0]
      )
    : null;
  const latestReceiptIdForChallenge = latestReceiptObj?.receiptID;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Show challenge modal on page load when ref= present
  useEffect(() => {
    if (friendProfile && !hasAcceptedChallenge) {
      // Determine which prop index (first for superprop)
      const propIndex = 0;
      openModal('challenge', {
        friendName: friendProfile.profileUsername || friendProfile.profileID,
        friendTakesByProp,
        challengerTakesByProp,
        packProps: packData.props,
        packURL: packData.packURL,
        initiatorReceiptId: router.query.ref,
        challengerReceiptId: latestReceiptIdForChallenge,
        propIndex,
      });
    }
  }, [friendProfile, hasAcceptedChallenge, openModal, friendTakesByProp, challengerTakesByProp, packData.props, packData.packURL, router.query.ref, latestReceiptIdForChallenge]);
  // If this is a superprop pack, render the prop detail view instead of carousel
  if (packData.packType === 'superprop') {
    const superProp = Array.isArray(packData.props) && packData.props[0];
    const coverUrl = Array.isArray(packData.packCover) && packData.packCover[0]?.url;
    const pageUrl = `${debugLogs.origin}/packs/${packData.packURL}`;
    return (
      <>
        <PageHeader
          title={packData.packTitle || packData.packURL}
          breadcrumbs={[
            { name: 'Home', href: '/' },
            { name: 'Packs', href: '/packs' },
            { name: packData.packTitle || packData.packURL },
          ]}
        />
        <PageContainer>
          {packData.packCreatorID && (
            <p className="text-sm text-gray-600 mb-2">
              Creator: {" "}
              <Link
                href={`/profile/${encodeURIComponent(packData.packCreatorID)}`}
                className="text-blue-600 underline"
              >
                {packData.packCreatorUsername || packData.packCreatorID}
              </Link>
            </p>
          )}
          <PackContextProvider packData={packData} friendTakesByProp={friendTakesByProp}>
            <PropDetailPage
              propData={superProp}
              coverImageUrl={coverUrl}
              pageUrl={pageUrl}
              associatedPacks={[]}
            />
            <InlineCardProgressFooter />
          </PackContextProvider>
        </PageContainer>
      </>
    );
  }
  // Scaffold: If this is a Vegas pack, render the carousel view (placeholder for Vegas mode)
  if (packData.packType === 'vegas') {
    return (
      <>
        <Head>
          <title>{packData.packTitle} | Make The Take</title>
          <meta property="og:type" content="website" />
          <meta property="og:title" content={packData.packTitle} />
          <meta property="og:description" content={packData.packSummary} />
          {packData.packCover?.[0]?.url && (
            <meta property="og:image" content={packData.packCover[0].url} />
          )}
          <meta property="og:url" content={`${debugLogs.origin}/packs/${packData.packURL}`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={packData.packTitle} />
          <meta name="twitter:description" content={packData.packSummary} />
          {packData.packCover?.[0]?.url && (
            <meta name="twitter:image" content={packData.packCover[0].url} />
          )}
        </Head>
        <PageHeader
          title={packData.packTitle || packData.packURL}
          breadcrumbs={[
            { name: 'Home', href: '/' },
            { name: 'Packs', href: '/packs' },
            { name: packData.packTitle || packData.packURL },
          ]}
        />
        <PageContainer>
          {(!isRef || mounted) && (
            <PackContextProvider packData={packData} friendTakesByProp={friendTakesByProp}>
              <PackCarouselView
                packData={packData}
                leaderboard={leaderboard}
                debugLogs={debugLogs}
                userReceipts={userReceipts}
                activity={activity}
              />
            </PackContextProvider>
          )}
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{packData.packTitle} | Make The Take</title>
        <meta property="og:type" content="website" />
        <meta property="og:title" content={packData.packTitle} />
        <meta property="og:description" content={packData.packSummary} />
        {packData.packCover?.[0]?.url && (
          <meta property="og:image" content={packData.packCover[0].url} />
        )}
        <meta property="og:url" content={`${debugLogs.origin}/packs/${packData.packURL}`} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={packData.packTitle} />
        <meta name="twitter:description" content={packData.packSummary} />
        {packData.packCover?.[0]?.url && (
          <meta name="twitter:image" content={packData.packCover[0].url} />
        )}
      </Head>
      <PageHeader
        title={packData.packTitle || packData.packURL}
        breadcrumbs={[
          { name: 'Home', href: '/' },
          { name: 'Packs', href: '/packs' },
          { name: packData.packTitle || packData.packURL },
        ]}
      />
      <PageContainer>
        {(!isRef || mounted) && (
          <PackContextProvider packData={packData} friendTakesByProp={friendTakesByProp}>
            <PackCarouselView
              packData={packData}
              leaderboard={leaderboard}
              debugLogs={debugLogs}
              userReceipts={userReceipts}
              activity={activity}
            />
          </PackContextProvider>
        )}
      </PageContainer>
    </>
  );
}
