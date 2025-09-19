// File: pages/packs/[packURL].js

import React, { useEffect, useState } from 'react';
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
import PageContainer from '../../components/PageContainer';
import Link from 'next/link';
import { query } from '../../lib/db/postgres';

export async function getServerSideProps(context) {
  const { packURL } = context.params;
  // Force http for internal SSR fetch to avoid TLS handshake issues
  const proto = 'http';
  const host = context.req.headers['x-forwarded-host'] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
    const res = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { notFound: true };
    }
    const debugLogs = { packURL, origin };
    // Note: Challenge functionality has been removed
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
      
      // Get pack ID for the query
      const { rows: packRows } = await query('SELECT id FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
      const packId = packRows?.[0]?.id;
      
      if (packId) {
        // Get all takes for this user on this pack
        const { rows: takeRows } = await query(`
          SELECT t.id, t.created_at
          FROM takes t
          JOIN props p ON p.id = t.prop_id
          WHERE p.pack_id = $1 
            AND t.take_mobile = $2 
            AND t.take_status = 'latest'
          ORDER BY t.created_at DESC
        `, [packId, phone]);
        
        console.log('[getServerSideProps] fetched takeRecords count:', takeRows.length);
        
        // Since Postgres doesn't have receiptID, we'll use take IDs as "receipt IDs"
        // Group takes by timestamp windows (takes within 5 minutes are considered same receipt)
        const receiptMap = new Map();
        takeRows.forEach((row) => {
          const takeTime = new Date(row.created_at);
          const takeId = row.id;
          
          // Find existing receipt within 5 minutes, or create new one
          let foundReceipt = null;
          for (const [receiptId, receiptTime] of receiptMap.entries()) {
            if (Math.abs(takeTime - new Date(receiptTime)) <= 5 * 60 * 1000) {
              foundReceipt = receiptId;
              break;
            }
          }
          
          if (foundReceipt) {
            // Use the earliest time for this receipt group
            if (takeTime < new Date(receiptMap.get(foundReceipt))) {
              receiptMap.set(foundReceipt, takeTime.toISOString());
            }
          } else {
            // Create new receipt using this take's ID
            receiptMap.set(takeId, takeTime.toISOString());
          }
        });
        
        userReceipts = Array.from(receiptMap.entries()).map(([receiptID, createdTime]) => ({
          receiptID,
          createdTime,
        }));
        console.log('[getServerSideProps] final userReceipts:', userReceipts);
      }
    }
    // Note: Challenge functionality has been removed
    // Removed recent activity fetch since Takes tab was removed

    return {
      props: {
        session,
        packData: data.pack,
        leaderboard: data.leaderboard || [],
        debugLogs,
        userReceipts,
      },
    };
  } catch {
    return { notFound: true };
  }
}

// Challenge functionality has been removed

export default function PackDetailPage({ packData, leaderboard, debugLogs, userReceipts }) {
  const { openModal } = useModal();
  const router = useRouter();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Show Pack Graded modal on load if the pack is graded and not a referral view
  useEffect(() => {
    const status = String(packData?.packStatus || '').toLowerCase();
    if (status === 'graded' && !router.query.ref) {
      openModal('packGraded', { packTitle: packData.packTitle, packProps: packData.props, packURL: packData.packURL });
    }
  }, [packData?.packStatus, packData?.packTitle, packData?.props, openModal, router.query.ref]);
  // If this is a superprop pack, render the prop detail view instead of carousel
  if (packData.packType === 'superprop') {
    const superProp = Array.isArray(packData.props) && packData.props[0];
    const coverUrl = Array.isArray(packData.packCover) && packData.packCover[0]?.url;
    const pageUrl = `${debugLogs.origin}/packs/${packData.packURL}`;
    return (
      <>
        <Head>
          <title>{packData.packTitle} | Make The Take</title>
          <meta property="og:type" content="website" />
          <meta property="og:title" content={packData.packTitle} />
          <meta property="og:description" content={packData.packSummary} />
          {coverUrl && (
            <meta property="og:image" content={coverUrl} />
          )}
          <meta property="og:url" content={pageUrl} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={packData.packTitle} />
          <meta name="twitter:description" content={packData.packSummary} />
          {coverUrl && (
            <meta name="twitter:image" content={coverUrl} />
          )}
        </Head>
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
          {Array.isArray(packData.linkedTeams) && packData.linkedTeams.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700">Links to teams</div>
              <ul className="mt-2 flex flex-wrap gap-3">
                {packData.linkedTeams.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/teams/${encodeURIComponent(t.slug)}`} className="inline-flex items-center gap-2 text-blue-600 underline">
                      {t.logoUrl && (
                        <img src={t.logoUrl} alt={t.name} className="w-5 h-5 rounded-sm" />
                      )}
                      <span>{t.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PackContextProvider packData={packData}>
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
          {(Array.isArray(packData.packCover) ? packData.packCover[0]?.url : (typeof packData.packCover === 'string' ? packData.packCover : null)) && (
            <meta property="og:image" content={Array.isArray(packData.packCover) ? packData.packCover[0].url : packData.packCover} />
          )}
          <meta property="og:url" content={`${debugLogs.origin}/packs/${packData.packURL}`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={packData.packTitle} />
          <meta name="twitter:description" content={packData.packSummary} />
          {(Array.isArray(packData.packCover) ? packData.packCover[0]?.url : (typeof packData.packCover === 'string' ? packData.packCover : null)) && (
            <meta name="twitter:image" content={Array.isArray(packData.packCover) ? packData.packCover[0].url : packData.packCover} />
          )}
        </Head>
        <PageContainer>
          {mounted && (
            <PackContextProvider packData={packData}>
              <PackCarouselView
                packData={packData}
                leaderboard={leaderboard}
                debugLogs={debugLogs}
                userReceipts={userReceipts}
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
        {(Array.isArray(packData.packCover) ? packData.packCover[0]?.url : (typeof packData.packCover === 'string' ? packData.packCover : null)) && (
          <meta property="og:image" content={Array.isArray(packData.packCover) ? packData.packCover[0].url : packData.packCover} />
        )}
        <meta property="og:url" content={`${debugLogs.origin}/packs/${packData.packURL}`} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={packData.packTitle} />
        <meta name="twitter:description" content={packData.packSummary} />
        {(Array.isArray(packData.packCover) ? packData.packCover[0]?.url : (typeof packData.packCover === 'string' ? packData.packCover : null)) && (
          <meta name="twitter:image" content={Array.isArray(packData.packCover) ? packData.packCover[0].url : packData.packCover} />
        )}
      </Head>
        <PageContainer>
          {mounted && (
            <PackContextProvider packData={packData}>
              <PackCarouselView
                packData={packData}
                leaderboard={leaderboard}
                debugLogs={debugLogs}
                userReceipts={userReceipts}
              />
            </PackContextProvider>
          )}
        </PageContainer>
    </>
  );
}
