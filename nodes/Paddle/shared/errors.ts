import {
	NodeApiError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IN8nHttpFullResponse,
	type INode,
	type INodeExecutionData,
	type JsonObject,
} from 'n8n-workflow';

type PaddleErrorBody = {
	error?: {
		code?: string;
		detail?: string;
		documentation_url?: string;
		errors?: Array<{ field?: string; message?: string }>;
	};
	meta?: { request_id?: string };
};

type StatusMessage = {
	message: string;
	description: string;
};

const ENVIRONMENT_HINT =
	"check that the credential's 'Environment' matches the environment the key was created in";

const KEY_REJECTED: StatusMessage = {
	message: 'Paddle did not accept the API key',
	description: `Check the API key in the 'Paddle Billing API' credential, and ${ENVIRONMENT_HINT}.`,
};

// Paddle reports every authentication failure as a 403; only the code tells a bad key
// apart from a key that lacks a permission.
const CODE_MESSAGES: Record<string, StatusMessage> = {
	authentication_malformed: KEY_REJECTED,
	authentication_missing: KEY_REJECTED,
	invalid_token: KEY_REJECTED,
};

const STATUS_MESSAGES: Record<number, StatusMessage> = {
	401: KEY_REJECTED,
	403: {
		message: "The API key doesn't have permission for this action",
		description: `In Paddle, go to Developer Tools > Authentication and give the key permission for this resource. If it already has it, ${ENVIRONMENT_HINT}.`,
	},
	404: {
		message: "Paddle couldn't find the requested record",
		description:
			"Check the ID is correct and belongs to the environment selected in the 'Paddle Billing API' credential.",
	},
	409: {
		message: "The record's current state doesn't allow this change",
		description: 'Check the record in Paddle, then try again.',
	},
	429: {
		message: 'Paddle is limiting how many requests this workflow sends',
		description:
			"Paddle allows 240 requests per minute from each IP address, and blocks it for 60 seconds when that's exceeded. Turn on 'Retry On Fail' in the node's Settings with 'Wait Between Tries' set to 60000 ms, or send fewer requests at once, for example with a Loop Over Items node and a Wait node.",
	},
};

const SERVER_MESSAGE: StatusMessage = {
	message: 'Paddle is temporarily unavailable',
	description: 'Try again in a few minutes.',
};

// "unit_price.amount" -> "Unit Price Amount", matching the node's parameter labels.
function fieldLabel(field: string): string {
	return field
		.split(/[._]/)
		.filter((part) => part && !/^\d+$/.test(part))
		.map((part) => (part === 'id' ? 'ID' : part.charAt(0).toUpperCase() + part.slice(1)))
		.join(' ');
}

// Builds a NodeApiError from a Paddle error response, using Paddle's explanation and
// adding a next step for the user.
export function paddleApiError(
	node: INode,
	statusCode: number,
	body: unknown,
	itemIndex?: number,
	headers?: IDataObject,
): NodeApiError {
	const paddle = ((body ?? {}) as PaddleErrorBody).error ?? {};
	const fieldErrors = (paddle.errors ?? []).filter((e) => e.field);
	const known =
		(paddle.code ? CODE_MESSAGES[paddle.code] : undefined) ??
		STATUS_MESSAGES[statusCode] ??
		(statusCode >= 500 ? SERVER_MESSAGE : undefined);

	let message: string;
	const details: string[] = [];

	if (fieldErrors.length) {
		const labels = [...new Set(fieldErrors.map((e) => `'${fieldLabel(e.field as string)}'`))];
		message = `Paddle rejected the value of ${labels.join(', ')}`;
		details.push(...fieldErrors.map((e) => `'${fieldLabel(e.field as string)}': ${e.message}`));
	} else {
		// A conflict's cause is only in Paddle's detail, e.g. which customer has the email.
		message =
			(statusCode === 409 && paddle.detail) ||
			known?.message ||
			paddle.detail ||
			`Paddle returned status ${statusCode}`;
		if (paddle.detail && paddle.detail !== message) details.push(paddle.detail);
	}

	const retryAfterSeconds = Number(headers?.['retry-after']) || undefined;
	if (retryAfterSeconds)
		details.push(`Paddle asks to wait ${retryAfterSeconds} seconds before trying again.`);
	if (known) details.push(known.description);
	if (paddle.documentation_url) details.push(`More information: ${paddle.documentation_url}`);
	const requestId = (body as PaddleErrorBody)?.meta?.request_id;
	if (requestId) details.push(`Paddle request ID: ${requestId}`);

	const error = new NodeApiError(node, (body ?? {}) as JsonObject, {
		message: itemIndex === undefined ? message : `${message} [item ${itemIndex}]`,
		description: details.join('\n'),
		httpCode: String(statusCode),
		itemIndex,
	});
	// Lets callers that can wait, such as pagination, retry after a rate limit.
	if (retryAfterSeconds) error.context.retryAfterSeconds = retryAfterSeconds;
	return error;
}

// postReceive step for the declarative node. Requests are sent with
// `ignoreHttpStatusErrors`, so failed responses arrive here and are turned into errors
// that explain what Paddle said and how to fix it.
export async function throwOnPaddleError(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode < 400) return items;
	throw paddleApiError(
		this.getNode(),
		response.statusCode,
		response.body as IDataObject,
		this.getItemIndex(),
		response.headers,
	);
}
