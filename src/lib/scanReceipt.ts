import { recognizeReceiptViaCloud } from './cloudOcr';
import { recognizeReceiptViaGemini } from './cloudOcrGemini';
import { recognizeReceiptOnDevice } from './ocrOnDevice';
import type { ParsedReceipt } from '../types/bill';

export interface ScanReceiptResult {
  parsed: ParsedReceipt;
  /** Messages from any cloud fallback attempts that failed (empty if none were needed, or one succeeded). */
  cloudErrors: string[];
  /**
   * Whether `parsed` ended up coming from the on-device confidence fallback (true) rather than a
   * successful cloud call. When true and cloudErrors is non-empty, every cloud attempt failed —
   * that's the case worth surfacing to the user; a Gemini failure followed by an OpenAI success
   * is not.
   */
  usedOnDeviceFallback: boolean;
}

interface ScanAsset {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
}

/**
 * Runs the full on-device -> Gemini -> OpenAI fallback cascade for one receipt photo.
 * Shared by the first scan (PickReceiptScreen) and "scan another receipt" (ReviewItemsScreen)
 * so the two flows can never silently drift apart.
 */
export async function scanReceiptImage(
  asset: ScanAsset,
  onStatus: (text: string) => void
): Promise<ScanReceiptResult> {
  onStatus('Scanning receipt on-device…');
  const onDevice = await recognizeReceiptOnDevice(asset.uri);
  let parsed = onDevice.parsed;
  let usedOnDeviceFallback = false;
  const cloudErrors: string[] = [];

  if (!onDevice.confident) {
    usedOnDeviceFallback = true;
    if (!asset.base64) {
      cloudErrors.push('Image data unavailable for cloud scan.');
    } else {
      onStatus('On-device scan was unsure — asking Gemini for a second look…');
      try {
        parsed = await recognizeReceiptViaGemini(asset.base64, asset.mimeType ?? 'image/jpeg');
        usedOnDeviceFallback = false;
      } catch (geminiError: any) {
        console.error('[scanReceipt] Gemini scan failed', geminiError);
        cloudErrors.push(`Gemini: ${geminiError.message ?? 'unknown error'}`);

        onStatus('Gemini scan unavailable — trying OpenAI…');
        try {
          parsed = await recognizeReceiptViaCloud(asset.base64, asset.mimeType ?? 'image/jpeg');
          usedOnDeviceFallback = false;
        } catch (openAiError: any) {
          console.error('[scanReceipt] OpenAI scan failed', openAiError);
          cloudErrors.push(`OpenAI: ${openAiError.message ?? 'unknown error'}`);
        }
      }
    }
  }

  return { parsed, cloudErrors, usedOnDeviceFallback };
}
