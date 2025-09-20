import { query } from '../../../lib/db/postgres';
import { buildGameSummaryPrompt, DEFAULT_EXAMPLE } from '../../../lib/prompts/summary';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { eventId, context, model: requestModel } = req.body;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId in request body' });
  }

  try {
    // Fetch event details (Postgres)
    const { rows } = await query(
      `SELECT title AS "eventTitle", event_time AS "eventTime", league AS "eventLeague",
              home_team AS "homeTeam", away_team AS "awayTeam"
         FROM events
        WHERE id::text = $1 OR event_id = $1 OR espn_game_id = $1
        LIMIT 1`,
      [String(eventId)]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    const event = rows[0];
    const away = Array.isArray(event.awayTeam) ? event.awayTeam[0] : event.awayTeam || '';
    const home = Array.isArray(event.homeTeam) ? event.homeTeam[0] : event.homeTeam || '';
    const eventDate = event.eventTime ? new Date(event.eventTime).toLocaleString() : '';
    const league = event.eventLeague || '';

    // Construct prompt
    const prompt = buildGameSummaryPrompt({ away, home, eventDateTime: eventDate, league, wordsMax: 40, includeExample: true, example: DEFAULT_EXAMPLE });
    console.log('[generatePropSummary] Generated prompt:', prompt);
    // Prepare user content with explicit appended context text
    const userContent = `${prompt} Below is additional news and context to be used to inform the preview ${context || ''}`;
    const messages = [
      { role: 'system', content: 'You are a sports expert who gives informative and accurate information about sporting events.' },
      { role: 'user', content: userContent },
    ];
    console.log('[generatePropSummary] Sending messages to OpenAI:', messages);

    // Call OpenAI API
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'Server misconfiguration: OPENAI_API_KEY is missing' });
    }

    const model = (typeof requestModel === 'string' && requestModel.trim().length > 0)
      ? requestModel.trim()
      : (process.env.OPENAI_DEFAULT_MODEL || 'gpt-5-mini');
    const payload = {
      model,
      messages,
      n: 1,
    };
    if (model.startsWith('gpt-5')) {
      payload.max_completion_tokens = 120;
    } else {
      payload.max_tokens = 120;
      payload.temperature = 0.4;
    }
    try {
      console.log('[generatePropSummary] OpenAI payload', {
        model: payload.model,
        has_temperature: Object.prototype.hasOwnProperty.call(payload, 'temperature'),
        token_param: model.startsWith('gpt-5') ? 'max_completion_tokens' : 'max_tokens',
        token_value: model.startsWith('gpt-5') ? payload.max_completion_tokens : payload.max_tokens,
      });
    } catch {}

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ success: false, error: `OpenAI API error: ${err}` });
    }

    const data = await response.json();
    console.log('[generatePropSummary] OpenAI raw response:', data);
    const summary = data.choices?.[0]?.message?.content?.trim();
    console.log('[generatePropSummary] Extracted summary:', summary);
    if (!summary) throw new Error('No summary returned');

    return res.status(200).json({ success: true, summary });
  } catch (err) {
    console.error('Error generating summary:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
