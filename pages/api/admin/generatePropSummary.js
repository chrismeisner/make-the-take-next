import { getEventById } from '../../../lib/airtableService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { eventId, context } = req.body;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId in request body' });
  }

  try {
    // Fetch event details
    const event = await getEventById(eventId);
    const away = Array.isArray(event.awayTeam) ? event.awayTeam[0] : event.awayTeam || '';
    const home = Array.isArray(event.homeTeam) ? event.homeTeam[0] : event.homeTeam || '';
    const eventDate = event.eventTime ? new Date(event.eventTime).toLocaleString() : '';
    const league = event.eventLeague || '';

    // Construct prompt
    const prompt = `Write a 30 words max summary previewing the upcoming game between ${away} and ${home} on ${eventDate} in the ${league}, use relevant narratives and stats. A good example is: "Matthews (5.67 ERA, 42 K) opposes Paddack (4.77 ERA, 88 K) as Tigers (66–48) aim to extend their four-game win streak over Twins (52–60)."`;
    console.log('[generatePropSummary] Generated prompt:', prompt);
    // Prepare user content with optional context
    let userContent = prompt;
    if (context) {
      console.log('[generatePropSummary] Additional context provided:', context);
      userContent = `${prompt}\n\nBelow is the most recent news for you to use:\n${context}`;
    }
    const messages = [
      { role: 'system', content: 'You are a sports expert who gives informative and accurate information about sporting events.' },
      { role: 'user', content: userContent },
    ];
    console.log('[generatePropSummary] Sending messages to OpenAI:', messages);

    // Call OpenAI API
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 100,
        temperature: 0.7,
      }),
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
