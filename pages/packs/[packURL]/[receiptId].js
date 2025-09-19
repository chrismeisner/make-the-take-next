import React, { useState } from 'react';
import Link from 'next/link';
import { useModal } from '../../../contexts/ModalContext';
import { useSession } from 'next-auth/react';
import PageContainer from '../../../components/PageContainer';
import { query } from '../../../lib/db/postgres';

export async function getServerSideProps(context) {
  const { packURL, receiptId } = context.params;
  const proto = context.req.headers['x-forwarded-proto'] || 'http';
  const host = context.req.headers['x-forwarded-host'] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  // Fetch pack data via internal API
  const packRes = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
  const packJson = await packRes.json();
  if (!packRes.ok || !packJson.success) {
    return { notFound: true };
  }
  const packData = packJson.pack;

  // Fetch takes by receiptId (which is now a take ID in Postgres)
  // First, get the take to find the user and timestamp
  const { rows: takeRows } = await query(`
    SELECT t.id, t.prop_id_text, t.prop_side, t.created_at, t.take_mobile, pr.profile_id
    FROM takes t
    JOIN props p ON p.id = t.prop_id
    LEFT JOIN profiles pr ON pr.mobile_e164 = t.take_mobile
    WHERE t.id = $1 AND p.pack_id = (SELECT id FROM packs WHERE pack_url = $2 LIMIT 1)
    LIMIT 1
  `, [receiptId, packURL]);

  if (takeRows.length === 0) {
    return { notFound: true };
  }

  const mainTake = takeRows[0];
  const userMobile = mainTake.take_mobile;
  const takeTime = mainTake.created_at;

  // Get all takes for this user on this pack within a reasonable time window (e.g., 5 minutes)
  // This simulates the "receipt" concept by grouping takes created together
  const timeWindow = new Date(takeTime);
  timeWindow.setMinutes(timeWindow.getMinutes() - 5);
  
  const { rows: allTakesRows } = await query(`
    SELECT t.id, t.prop_id_text, t.prop_side, t.created_at, pr.profile_id
    FROM takes t
    JOIN props p ON p.id = t.prop_id
    LEFT JOIN profiles pr ON pr.mobile_e164 = t.take_mobile
    WHERE p.pack_id = (SELECT id FROM packs WHERE pack_url = $1 LIMIT 1)
      AND t.take_mobile = $2 
      AND t.take_status = 'latest'
      AND t.created_at >= $3
    ORDER BY t.created_at ASC
  `, [packURL, userMobile, timeWindow]);

  const takes = allTakesRows
    .map((row) => ({
      id: row.id,
      propID: row.prop_id_text,
      propSide: row.prop_side,
      takeTime: new Date(row.created_at).toISOString(),
      profileID: row.profile_id || null,
    }))
    .filter((take) => packData.props.some((p) => p.propID === take.propID))
    .sort((a, b) => new Date(a.takeTime) - new Date(b.takeTime));

  // Fetch profile info for this receipt (if available)
  let profileData = null;
  if (takes.length > 0 && takes[0].profileID) {
    const profileRes = await fetch(
      `${origin}/api/profile/${encodeURIComponent(takes[0].profileID)}`
    );
    const profileJson = await profileRes.json();
    if (profileRes.ok && profileJson.success) {
      profileData = profileJson.profile;
    }
  }

  return {
    props: {
      packData,
      takes,
      receiptId,
      origin,
      profileData,
    },
  };
}

export default function PackReceiptPage({ packData, takes, receiptId, origin, profileData }) {
  // build share URL and setup copy state/handlers
  const shareUrl = `${origin}/packs/${packData.packURL}?ref=${receiptId}`;
  const receiptPageUrl = `${origin}/packs/${packData.packURL}/${receiptId}`;
  
  // Prepare picks text for copying
  const picksText = takes.map((take) => {
    const prop = packData.props.find((p) => p.propID === take.propID);
    const label = prop?.propShort || prop?.propTitle || take.propID;
    const sideLabel = take.propSide === "A"
      ? (prop?.PropSideAShort || "A")
      : (prop?.PropSideBShort || "B");
    return `${label}: ${sideLabel}`;
  }).filter(Boolean).join(', ');
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const { openModal } = useModal();
  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); } catch (err) { console.error('Fallback: unable to copy', err); }
    document.body.removeChild(textArea);
  };
  const handleCopy = async () => {
    // Build final message: include picks if available
    const content = picksText
      ? `My picks: ${picksText}. ${shareUrl}`
      : shareUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { 
        await navigator.clipboard.writeText(content);
      } catch {
        fallbackCopyTextToClipboard(content);
      }
    } else {
      fallbackCopyTextToClipboard(content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleCopyReceipt = async () => {
    const content = receiptPageUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        fallbackCopyTextToClipboard(content);
      }
    } else {
      fallbackCopyTextToClipboard(content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // Challenge functionality has been removed
  return (
    <PageContainer>
      {/* Pack preview with link */}
      <Link
        href={`/packs/${packData.packURL}/cards`}
        className="mb-6 flex items-center p-4 border rounded hover:bg-gray-50"
      >
        {packData.packCover?.[0]?.url && (
          <img
            src={packData.packCover[0].url}
            alt={packData.packTitle}
            className="w-16 h-16 object-cover rounded mr-4"
          />
        )}
        <div>
          <p className="text-xl font-semibold text-blue-600">
            {packData.packTitle}
          </p>
          <p className="text-gray-600">{packData.packSummary}</p>
        </div>
      </Link>
      {profileData && (
        <div className="mb-4 p-4 border rounded bg-gray-50">
          {profileData.profileAvatar?.[0]?.url && (
            <img
              src={profileData.profileAvatar[0].url}
              alt="User Avatar"
              className="h-12 w-12 rounded-full mb-2"
            />
          )}
          <p><strong>User:</strong> {profileData.profileUsername || profileData.profileID}</p>
          <p><strong>Phone:</strong> {profileData.profileMobile}</p>
          {profileData.profileTeamData?.teamName && (
            <p><strong>Favorite Team:</strong> {profileData.profileTeamData.teamName}</p>
          )}
        </div>
      )}
      <h1 className="text-2xl font-bold mb-4">Receipt for {packData.packTitle}</h1>
      <div className="mb-2 break-all flex items-center flex-wrap gap-2">
        <span className="mr-2">Share URL:</span>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >{shareUrl}</a>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button
          type="button"
          onClick={() => openModal('qrCode', { url: shareUrl })}
          className="ml-2 px-3 py-1 bg-gray-700 text-white text-sm rounded"
        >
          Generate QR
        </button>
      </div>
      <div className="mb-4 break-all flex items-center flex-wrap gap-2">
        <span className="mr-2">Receipt URL:</span>
        <a
          href={receiptPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >{receiptPageUrl}</a>
        <button
          type="button"
          onClick={handleCopyReceipt}
          className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button
          type="button"
          onClick={() => openModal('qrCode', { url: receiptPageUrl })}
          className="ml-2 px-3 py-1 bg-gray-700 text-white text-sm rounded"
        >
          Generate QR
        </button>
      </div>
      {takes.length === 0 ? (
        <div className="border rounded p-4 bg-yellow-50 text-yellow-900">No takes found for this receipt.</div>
      ) : (
        <ul className="space-y-4">
          {takes.map((take) => {
            const prop = packData.props.find((p) => p.propID === take.propID);
            const sideLabel = take.propSide === 'A'
              ? (prop?.PropSideAShort || 'A')
              : (prop?.PropSideBShort || 'B');
            const status = prop?.propStatus || '';
            const result = prop?.propResult || '';
            return (
              <li key={take.id} className="border p-2 rounded">
                <div className="font-semibold">
                  {prop?.propShort || prop?.propTitle || take.propID}
                </div>
                <div>
                  Your answer: <strong>{sideLabel}</strong>
                  {take.propSide && sideLabel && sideLabel !== take.propSide ? (
                    <span className="ml-1 text-xs text-gray-500">({take.propSide})</span>
                  ) : null}
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(take.takeTime).toLocaleString()}
                </div>
                {(status || result) && (
                  <div className="text-sm text-gray-700 mt-1">
                    Status: <span className="font-medium">{status || '—'}</span>
                    {result ? <span className="ml-2 text-gray-600">• {result}</span> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
} 