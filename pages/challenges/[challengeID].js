import React from 'react';
import Head from 'next/head';
import Airtable from 'airtable';

export async function getServerSideProps(context) {
  const { challengeID } = context.params;
  const proto = context.req.headers['x-forwarded-proto'] || 'http';
  const host = context.req.headers['x-forwarded-host'] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  // Initialize Airtable
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  // Fetch the challenge record by challengeID field or record ID
  const challengeRecs = await base('Challenges')
    .select({
      filterByFormula: `OR({challengeID}="${challengeID}", RECORD_ID()="${challengeID}")`,
      maxRecords: 1,
    })
    .firstPage();
  if (!challengeRecs.length) {
    return { notFound: true };
  }
  const challenge = challengeRecs[0];
  const fields = challenge.fields;

  // Determine packURL: either from field or by loading pack record
  let packURL = fields.packURL;
  if (!packURL && Array.isArray(fields.pack) && fields.pack.length) {
    const packRec = await base('Packs').find(fields.pack[0]);
    packURL = packRec.fields.packURL;
  }

  // Fetch pack details via existing API
  const packRes = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
  const packJson = await packRes.json();
  if (!packRes.ok || !packJson.success) {
    return { notFound: true };
  }
  const packData = packJson.pack;

  // Fetch both initiator and challenger takes by receiptID
  const initiatorReceiptId = fields.initiatorReceiptID;
  const challengerReceiptId = fields.challengerReceiptID;
  const [initRes, challRes] = await Promise.all([
    fetch(`${origin}/api/takes/${encodeURIComponent(initiatorReceiptId)}`),
    fetch(`${origin}/api/takes/${encodeURIComponent(challengerReceiptId)}`),
  ]);
  const initJson = await initRes.json();
  const challJson = await challRes.json();
  const initiatorTakes = initJson.success ? initJson.takes : [];
  const challengerTakes = challJson.success ? challJson.takes : [];

  // Use lookup fields for usernames
  const initiatorUsername = Array.isArray(fields.initiatorProfileID) ? fields.initiatorProfileID[0] : null;
  const challengerUsername = Array.isArray(fields.challengerProfileID) ? fields.challengerProfileID[0] : null;
  return {
    props: {
      challenge: { id: challenge.id, fields },
      packData,
      initiatorTakes,
      challengerTakes,
      initiatorUsername,
      challengerUsername,
    },
  };
}

export default function ChallengeDetailPage({ challenge, packData, initiatorTakes, challengerTakes, initiatorUsername, challengerUsername }) {
  const { fields } = challenge;
  return (
    <div className="p-6">
      {/* Display who’s who */}
      <p className="text-lg mb-2"><span className="font-medium">Initiator:</span> {initiatorUsername}</p>
      <p className="text-lg mb-4"><span className="font-medium">Challenger:</span> {challengerUsername}</p>
      <Head>
        <title>Challenge: {fields.challengeID || challenge.id}</title>
      </Head>
      <h1 className="text-3xl font-bold mb-2">{packData.packTitle}</h1>
      <p className="text-gray-600 mb-4">{packData.packSummary}</p>
      <h2 className="text-2xl font-semibold mb-4">
        Challenge ID: {fields.challengeID || challenge.id}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {packData.props.map((prop) => {
          const initTake = initiatorTakes.find(t => t.propID === prop.propID);
          const challTake = challengerTakes.find(t => t.propID === prop.propID);
          const initLabel = initTake
            ? (initTake.propSide === 'A' ? prop.sideALabel : prop.sideBLabel)
            : '—';
          const challLabel = challTake
            ? (challTake.propSide === 'A' ? prop.sideALabel : prop.sideBLabel)
            : '—';
          return (
            <div key={prop.propID} className="border rounded p-4">
              <h3 className="font-semibold mb-1">{prop.propShort || prop.propTitle || prop.propID}</h3>
              <p><span className="font-medium">{initiatorUsername}:</span> {initLabel}</p>
              <p><span className="font-medium">{challengerUsername}:</span> {challLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
} 