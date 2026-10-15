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

const CREDENTIAL_HINT =
	"Check the API key in the 'Paddle Billing API' credential, and that the credential's 'Environment' matches the environment the key was created in.";

const STATUS_MESSAGES: Record<number, { message: string; description: string }> = {
	401: {
		message: 'Paddle did not accept the API key',
		description: CREDENTIAL_HINT,
	},
	403: {
		message: "The API key doesn't have permission for this action",
		description:
			'In Paddle, go to Developer Tools > Authentication and give the key permission for this resource.',
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
			'Wait a moment and try again. To send fewer requests at once, process items in batches, for example with a Loop Over Items node and a Wait node.',
	},
};

const SERVER_MESSAGE = {
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
): NodeApiError {
	const paddle = ((body ?? {}) as PaddleErrorBody).error ?? {};
	const fieldErrors = (paddle.errors ?? []).filter((e) => e.field);
	const known = STATUS_MESSAGES[statusCode] ?? (statusCode >= 500 ? SERVER_MESSAGE : undefined);

	let message: string;
	const details: string[] = [];

	if (fieldErrors.length) {
		const labels = [...new Set(fieldErrors.map((e) => `'${fieldLabel(e.field as string)}'`))];
		message = `Paddle rejected the value of ${labels.join(', ')}`;
		details.push(...fieldErrors.map((e) => `'${fieldLabel(e.field as string)}': ${e.message}`));
	} else {
		message = known?.message ?? paddle.detail ?? `Paddle returned status ${statusCode}`;
		if (paddle.detail && paddle.detail !== message) details.push(paddle.detail);
	}

	if (known) details.push(known.description);
	if (paddle.documentation_url) details.push(`More information: ${paddle.documentation_url}`);
	const requestId = (body as PaddleErrorBody)?.meta?.request_id;
	if (requestId) details.push(`Paddle request ID: ${requestId}`);

	return new NodeApiError(node, (body ?? {}) as JsonObject, {
		message: itemIndex === undefined ? message : `${message} [item ${itemIndex}]`,
		description: details.join('\n'),
		httpCode: String(statusCode),
		itemIndex,
	});
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
	);
}
