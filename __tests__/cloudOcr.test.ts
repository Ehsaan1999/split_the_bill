import { buildOpenAiRequestBody, mapOpenAiContentToParsedReceipt, CloudOcrError } from '../src/lib/cloudOcr';

describe('buildOpenAiRequestBody', () => {
  it('embeds the base64 image as a data URI with the given mime type', () => {
    const body = buildOpenAiRequestBody('AAAA', 'image/png');
    const imageContent = body.messages[0].content.find((c: any) => c.type === 'image_url') as any;
    expect(imageContent.image_url.url).toBe('data:image/png;base64,AAAA');
  });

  it('requests a strict json_schema response format', () => {
    const body = buildOpenAiRequestBody('AAAA', 'image/jpeg');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
  });
});

describe('mapOpenAiContentToParsedReceipt', () => {
  it('maps a well-formed OpenAI JSON response into a ParsedReceipt', () => {
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

    const parsed = mapOpenAiContentToParsedReceipt(content);

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
    const parsed = mapOpenAiContentToParsedReceipt(content);
    expect(parsed.items).toEqual([]);
    expect(parsed.discountPercent).toBeNull();
    expect(parsed.taxAmount).toBeNull();
  });

  it('throws a CloudOcrError when the content is not valid JSON', () => {
    expect(() => mapOpenAiContentToParsedReceipt('not json')).toThrow(CloudOcrError);
  });
});
