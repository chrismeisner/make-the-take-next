// lib/airtableBase.js
// Single Airtable base instance for server-side usage

import Airtable from 'airtable';
import { requireEnv } from './runtimeConfig';

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

if (!apiKey || !baseId) {
  // Log a soft warning to help local dev; hard failures will occur on actual use
  // via requireEnv in modules that depend on a working base.
  console.warn('[airtableBase] AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not set.');
}

export const airtableBase = new Airtable({ apiKey: apiKey || requireEnv('AIRTABLE_API_KEY') })
  .base(baseId || requireEnv('AIRTABLE_BASE_ID'));

export default airtableBase;


