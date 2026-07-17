import { buildGeminiRequestBody, mapGeminiContentToParsedReceipt } from '../src/lib/cloudOcrGemini';
import { CloudOcrError } from '../src/lib/cloudOcr';

describe('buildGeminiRequestBody', () => {
  it('embeds the base64 image as inline_data with the given mime type', () => {
    const body = buildGeminiRequestBody('AAAA', 'image/png');
    const imagePart = body.contents[0].parts.find((p: any) => 'inline_data' in p) as any;
    expect(imagePart.inline_data).toEqual({ mime_type: 'image/png', data: 'AAAA' });
  });

  it('requests a JSON response with a schema', () => {
    const body = buildGeminiRequestBody('AAAA', 'image/jpeg');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
  });
});

describe('mapGeminiContentToParsedReceipt', () => {
  it('maps a well-formed Gemini JSON response into a ParsedReceipt', () => {
    const content = JSON.stringify({
      merchant: 'Spice Garden',
      items: [
        { name: 'Bottle of Water', qty: 1, unitPrice: 100 },
        { name: 'Chicken Karahi', qty: 2, unitPrice: 400 },
      ],
      subtotal: 900,
      discountPercent: 0.1,
      discountAmount: null,
      taxPercent: 0.08,
      taxAmount: null,
      total: 882,
    });

    const parsed = mapGeminiContentToParsedReceipt(content);

    expect(parsed.source).toBe('cloud');
    expect(parsed.merchant).toBe('Spice Garden');
    expect(parsed.items).toEqual([
      { id: 'cloud-1', name: 'Bottle of Water', qty: 1, unitPrice: 100 },
      { id: 'cloud-2', name: 'Chicken Karahi', qty: 2, unitPrice: 400 },
    ]);
    expect(parsed.discountPercent).toBe(0.1);
    expect(parsed.taxPercent).toBe(0.08);
    expect(parsed.total).toBe(882);
  });

  it('defaults missing optional fields to null', () => {
    const content = JSON.stringify({ merchant: null, items: [], subtotal: null, discountPercent: null, discountAmount: null, taxPercent: null, taxAmount: null, total: null });
    const parsed = mapGeminiContentToParsedReceipt(content);
    expect(parsed.items).toEqual([]);
    expect(parsed.discountPercent).toBeNull();
    expect(parsed.taxAmount).toBeNull();
  });

  it('throws a CloudOcrError when the content is not valid JSON', () => {
    expect(() => mapGeminiContentToParsedReceipt('not json')).toThrow(CloudOcrError);
  });
});
