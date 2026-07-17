import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { ParsedReceipt } from '../types/bill';
import { isParseConfident, parseReceiptText } from './receiptParser';

export interface OnDeviceOcrResult {
  rawText: string;
  parsed: ParsedReceipt;
  confident: boolean;
}

export async function recognizeReceiptOnDevice(imageUri: string): Promise<OnDeviceOcrResult> {
  const result = await TextRecognition.recognize(imageUri);
  const parsed = parseReceiptText(result.text);
  return { rawText: result.text, parsed, confident: isParseConfident(parsed) };
}
