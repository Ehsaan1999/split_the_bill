import type { ParsedReceipt } from '../types/bill';
import { getApiKey } from './apiKeyStore';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const RECEIPT_JSON_SCHEMA = {
  name: 'receipt',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      merchant: { type: ['string', 'null'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
            unitPrice: { type: 'number' },
          },
          required: ['name', 'qty', 'unitPrice'],
          additionalProperties: false,
        },
      },
      subtotal: { type: ['number', 'null'] },
      discountPercent: { type: ['number', 'null'] },
      discountAmount: { type: ['number', 'null'] },
      taxPercent: { type: ['number', 'null'] },
      taxAmount: { type: ['number', 'null'] },
      total: { type: ['number', 'null'] },
    },
    required: [
      'merchant',
      'items',
      'subtotal',
      'discountPercent',
      'discountAmount',
      'taxPercent',
      'taxAmount',
      'total',
    ],
    additionalProperties: false,
  },
};

const PROMPT = [
  'You are reading a restaurant receipt photo. Extract every purchased line item with its name,',
  'quantity, and unitPrice (the pre-tax, pre-discount price of ONE unit). Also extract the subtotal,',
  'any whole-bill discount (as discountPercent like 0.1 for 10%, OR discountAmount as a flat amount —',
  'set only whichever the receipt actually states, leave the other null; both null if no discount),',
  'any tax (same percent-or-amount rule as discount; both null if no tax line appears), and the grand',
  "total. If a field isn't present on the receipt, use null. qty and prices are numbers, not strings.",
].join(' ');

export class CloudOcrError extends Error {}

export function buildOpenAiRequestBody(imageBase64: string, mimeType: string) {
  return {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: RECEIPT_JSON_SCHEMA },
  };
}

interface RawReceiptJson {
  merchant: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
  subtotal: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
  total: number | null;
}

export function mapOpenAiContentToParsedReceipt(content: string): ParsedReceipt {
  let parsedJson: RawReceiptJson;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new CloudOcrError('OpenAI response was not valid JSON.');
  }

  return {
    merchant: parsedJson.merchant ?? null,
    items: (parsedJson.items ?? []).map((item, index) => ({
      id: `cloud-${index + 1}`,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    subtotal: parsedJson.subtotal ?? null,
    discountPercent: parsedJson.discountPercent ?? null,
    discountAmount: parsedJson.discountAmount ?? null,
    taxPercent: parsedJson.taxPercent ?? null,
    taxAmount: parsedJson.taxAmount ?? null,
    total: parsedJson.total ?? null,
    source: 'cloud',
  };
}

export async function recognizeReceiptViaCloud(imageBase64: string, mimeType = 'image/jpeg'): Promise<ParsedReceipt> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) {
    throw new CloudOcrError('No OpenAI API key configured. Add one in Settings.');
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildOpenAiRequestBody(imageBase64, mimeType)),
    });
  } catch (err: any) {
    console.error('[cloudOcr:openai] network error', err);
    throw new CloudOcrError(`Couldn't reach OpenAI: ${err?.message ?? 'network error'}`);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[cloudOcr:openai] request failed', response.status, body);
    throw new CloudOcrError(`OpenAI request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new CloudOcrError('OpenAI response did not contain any content.');
  }

  return mapOpenAiContentToParsedReceipt(content);
}
