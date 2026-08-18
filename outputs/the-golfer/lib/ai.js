import { createHash } from 'crypto';

export const AI_MODEL = 'gpt-5.6-terra';
export const PENDING_QUEUE_MAX = 25;
export const LAUNCH_AREA =
  'Golfolio North Texas launch area: west of Weatherford, east of Royse City, south of the Oklahoma border, and north of Midlothian, Texas, United States';

export function safetyIdentifier(userId) {
  return createHash('sha256').update(`golfolio-admin:${userId}`).digest('hex').slice(0, 32);
}

function outputText(response) {
  if (response.output_text) return response.output_text;
  return (response.output || []).flatMap((x) => x.content || []).map((x) => x.text || x.refusal || '').join('');
}

async function callOnce(body) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function runListingAi({ input, schemaName, schema, adminId }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
  const body = {
    model: AI_MODEL,
    store: false,
    reasoning: { effort: 'medium' },
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema
      }
    },
    tools: [{ type: 'web_search' }],
    safety_identifier: safetyIdentifier(adminId),
    input
  };

  let { response, data } = await callOnce(body);
  if (!response.ok && [429, 500, 502, 503].includes(response.status)) {
    ({ response, data } = await callOnce(body));
  }
  if (!response.ok) {
    throw new Error(data.error?.message || 'The AI listing request failed.');
  }
  const text = outputText(data).replace(/^```json\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The AI response was not valid JSON.');
  }
}
