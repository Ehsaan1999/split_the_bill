import type { ParsedReceipt } from '../types/bill';
import { getApiKey } from './apiKeyStore';
import { CloudOcrError } from './cloudOcr';

// Versioned deliberately (not a "-latest" alias) — Google has deprecated aliases before,
// turning them into 404s with no warning. If this model is retired, check
// https://ai.google.dev/gemini-api/docs/models for the current flash model id.
const MODEL = 'gemini-3.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          qty: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
        },
        required: ['name', 'qty', 'unitPrice'],
      },
    },
    subtotal: { type: 'NUMBER', nullable: true },
    discountPercent: { type: 'NUMBER', nullable: true },
    discountAmount: { type: 'NUMBER', nullable: true },
    taxPercent: { type: 'NUMBER', nullable: true },
    taxAmount: { type: 'NUMBER', nullable: true },
    total: { type: 'NUMBER', nullable: true },
  },
  required: ['merchant', 'items', 'subtotal', 'discountPercent', 'discountAmount', 'taxPercent', 'taxAmount', 'total'],
};

const PROMPT = [
  'You are reading a restaurant receipt photo. Extract every purchased line item with its name,',
  'quantity, and unitPrice (the pre-tax, pre-discount price of ONE unit). Also extract the subtotal,',
  'any whole-bill discount (as discountPercent like 0.1 for 10%, OR discountAmount as a flat amount —',
  'set only whichever the receipt actually states, leave the other null; both null if no discount),',
  'any tax (same percent-or-amount rule as discount; both null if no tax line appears), and the grand',
  "total. If a field isn't present on the receipt, use null. qty and prices are numbers, not strings.",
].join(' ');

export function buildGeminiRequestBody(imageBase64: string, mimeType: string) {
  return {
    contents: [
      {
        parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECEIPT_SCHEMA,
    },
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

export function mapGeminiContentToParsedReceipt(content: string): ParsedReceipt {
  let parsedJson: RawReceiptJson;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new CloudOcrError('Gemini response was not valid JSON.');
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

export async function recognizeReceiptViaGemini(imageBase64: string, mimeType = 'image/jpeg'): Promise<ParsedReceipt> {
  const apiKey = await getApiKey('gemini');
  if (!apiKey) {
    throw new CloudOcrError('No Gemini API key configured. Add one in Settings.');
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiRequestBody(imageBase64, mimeType)),
    });
  } catch (err: any) {
    console.error('[cloudOcr:gemini] network error', err);
    throw new CloudOcrError(`Couldn't reach Gemini: ${err?.message ?? 'network error'}`);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[cloudOcr:gemini] request failed', response.status, body);
    throw new CloudOcrError(`Gemini request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new CloudOcrError('Gemini response did not contain any content.');
  }

  return mapGeminiContentToParsedReceipt(content);
}
