import { airtableBase } from '../../airtableBase';
import { escapeFormulaValue } from '../airtableUtils';
import { ContestsRepository } from '../contracts';

function mapContest(rec) {
  const f = rec.fields || {};
  const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
  let contestCover = [];
  if (Array.isArray(f.contestCover)) {
    contestCover = f.contestCover
      .map((entry) => {
        if (typeof entry === 'string') {
          return isHttpUrl(entry) ? { url: entry, filename: 'contest-cover' } : null;
        }
        const url = entry?.url || entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
        if (!isHttpUrl(url)) return null;
        return { url, filename: entry?.filename || 'contest-cover' };
      })
      .filter(Boolean);
  } else if (typeof f.contestCover === 'string' && isHttpUrl(f.contestCover)) {
    contestCover = [{ url: f.contestCover, filename: 'contest-cover' }];
  }
  if ((!contestCover || contestCover.length === 0) && isHttpUrl(f.contestCoverUrl)) {
    contestCover = [{ url: f.contestCoverUrl, filename: 'contest-cover' }];
  }
  return {
    airtableId: rec.id,
    contestID: f.contestID || '',
    contestTitle: f.contestTitle || 'Untitled Contest',
    contestSummary: f.contestSummary || '',
    contestPrize: f.contestPrize || '',
    contestDetails: f.contestDetails || '',
    contestStartTime: f.contestStartTime || null,
    contestEndTime: f.contestEndTime || null,
    contestStatus: f.contestStatus || '',
    contestCover,
    packCount: Array.isArray(f.Packs) ? f.Packs.length : 0,
    Packs: Array.isArray(f.Packs) ? f.Packs : [],
  };
}

export class AirtableContestsRepository extends ContestsRepository {
  async listAll() {
    const records = await airtableBase('Contests').select({ maxRecords: 100 }).all();
    return records.map(mapContest);
  }

  async getByContestID(contestID) {
    const safe = escapeFormulaValue(contestID);
    const recs = await airtableBase('Contests')
      .select({ filterByFormula: `{contestID} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (!recs?.length) return null;
    return mapContest(recs[0]);
  }

  async createOne(data) {
    const { contestTitle, contestSummary, contestPrize, contestStatus, contestStartTime, contestEndTime, packURLs = [], contestCoverUrl } = data || {};
    let packRecordIds = [];
    if (Array.isArray(packURLs) && packURLs.length > 0) {
      const formula = `OR(${packURLs.map((u) => `{packURL} = "${u}"`).join(',')})`;
      const packRecs = await airtableBase('Packs').select({ filterByFormula: formula, maxRecords: 100 }).all();
      packRecordIds = packRecs.map((r) => r.id);
    }
    const [created] = await airtableBase('Contests').create([
      {
        fields: {
          contestTitle,
          contestSummary,
          contestPrize,
          contestStatus,
          contestStartTime,
          contestEndTime,
          Packs: packRecordIds,
          ...(contestCoverUrl ? { contestCover: [{ url: contestCoverUrl }] } : {}),
        },
      },
    ]);
    return { airtableId: created.id };
  }

  async linkPacks(contestID, packURLsOrIds) {
    const recs = await airtableBase('Contests')
      .select({ filterByFormula: `{contestID} = "${contestID}"`, maxRecords: 1 })
      .firstPage();
    if (!recs?.length) return null;
    const contestRec = recs[0];
    let finalPackRecordIds = [];
    const packURLs = (packURLsOrIds || []).filter((v) => typeof v === 'string');
    if (packURLs.length) {
      const formula = `OR(${packURLs.map((u) => `{packURL} = "${u}"`).join(',')})`;
      const packRecs = await airtableBase('Packs').select({ filterByFormula: formula, maxRecords: 100 }).all();
      finalPackRecordIds = packRecs.map((r) => r.id);
    }
    const [updated] = await airtableBase('Contests').update([
      { id: contestRec.id, fields: { Packs: finalPackRecordIds } },
    ]);
    return { airtableId: updated.id };
  }
}


