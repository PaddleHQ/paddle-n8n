import { createHmac, timingSafeEqual } from 'crypto';

// Reject signatures older than this, to limit replay of captured requests.
export const MAX_SIGNATURE_AGE_SECONDS = 300;

/**
 * Verifies a `Paddle-Signature` header (`ts=<unix>;h1=<hex>[;h1=<hex>]`) against the raw
 * request body. The signed payload is `<ts>:<raw body>`, HMAC-SHA256 with the
 * notification destination's secret key. Several `h1` values can be present while a
 * secret is being rotated.
 */
export function verifyPaddleSignature(
	secret: string,
	header: string | undefined,
	rawBody: Buffer | string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
	if (!secret || !header) return false;

	let timestamp: string | undefined;
	const signatures: string[] = [];
	for (const part of header.split(';')) {
		const [key, value] = part.split('=', 2).map((s) => s.trim());
		if (key === 'ts') timestamp = value;
		if (key === 'h1' && value) signatures.push(value);
	}

	if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
	if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SIGNATURE_AGE_SECONDS) return false;

	const expected = createHmac('sha256', secret).update(`${timestamp}:`).update(rawBody).digest();

	return signatures.some((signature) => {
		const received = Buffer.from(signature, 'hex');
		return received.length === expected.length && timingSafeEqual(received, expected);
	});
}
