import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { paddleApiRequest, type PaddleListResponse } from '../Paddle/shared/transport';
import { PADDLE_EVENTS } from './events';
import { verifyPaddleSignature } from './signature';

type EventType = { name: string; description?: string; group?: string };

type NotificationSetting = {
	id: string;
	destination: string;
	active: boolean;
	traffic_source: string;
	subscribed_events: EventType[];
	endpoint_secret_key: string;
};

type WebhookStaticData = {
	notificationSettingId?: string;
	endpointSecretKey?: string;
};

const ALL_EVENTS = '*';

function isNotFound(error: unknown): boolean {
	const e = error as { httpCode?: string; statusCode?: number; response?: { status?: number } };
	return e.httpCode === '404' || e.statusCode === 404 || e.response?.status === 404;
}

async function getEventTypes(this: IHookFunctions): Promise<EventType[]> {
	const response = (await paddleApiRequest.call(
		this,
		'GET',
		'/event-types',
	)) as PaddleListResponse<EventType>;
	return response.data;
}

async function resolveEvents(this: IHookFunctions): Promise<string[]> {
	const events = this.getNodeParameter('events', []) as string[];
	if (!events.includes(ALL_EVENTS)) return [...events].sort();
	return (await getEventTypes.call(this)).map((event) => event.name).sort();
}

function trafficSource(this: IHookFunctions): string {
	const options = this.getNodeParameter('options', {}) as IDataObject;
	return options.includeSimulations ? 'all' : 'platform';
}

async function findSettingByDestination(
	this: IHookFunctions | IWebhookFunctions,
	destination: string,
): Promise<NotificationSetting | undefined> {
	const response = (await paddleApiRequest.call(this, 'GET', '/notification-settings', undefined, {
		per_page: 200,
	})) as PaddleListResponse<NotificationSetting>;
	return response.data.find((setting) => setting.destination === destination);
}

async function deleteSetting(this: IHookFunctions, id: string): Promise<void> {
	try {
		await paddleApiRequest.call(this, 'DELETE', `/notification-settings/${id}`);
	} catch (error) {
		if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
		this.logger.debug(`Paddle notification destination ${id} was already deleted`);
	}
}

export class PaddleTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Paddle Billing Trigger',
		name: 'paddleTrigger',
		// The icon has its own background, so one file works on light and dark themes.
		icon: { light: 'file:../../icons/paddle.svg', dark: 'file:../../icons/paddle.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{($parameter["events"] || []).join(", ")}}',
		description: 'React to Paddle Billing webhook events',
		defaults: {
			name: 'Paddle Billing Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'paddleBillingApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: [
					{
						name: '*',
						value: ALL_EVENTS,
						description: 'Any time any event is triggered, including event types added later',
					},
					...PADDLE_EVENTS,
				],
				required: true,
				default: [],
				description: 'The Paddle events to listen to',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Simulated Events',
						name: 'includeSimulations',
						type: 'boolean',
						default: false,
						description:
							"Whether to also receive events sent from Paddle's webhook simulator, useful for testing",
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;

				let setting: NotificationSetting | undefined;
				if (staticData.notificationSettingId) {
					try {
						const response = (await paddleApiRequest.call(
							this,
							'GET',
							`/notification-settings/${staticData.notificationSettingId}`,
						)) as { data: NotificationSetting };
						setting = response.data;
					} catch (error) {
						if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
						this.logger.debug('Stored Paddle notification destination no longer exists');
					}
				} else {
					setting = await findSettingByDestination.call(this, webhookUrl);
				}

				if (!setting) {
					delete staticData.notificationSettingId;
					delete staticData.endpointSecretKey;
					return false;
				}

				const wanted = await resolveEvents.call(this);
				const current = setting.subscribed_events.map((event) => event.name).sort();
				const upToDate =
					setting.active &&
					setting.destination === webhookUrl &&
					setting.traffic_source === trafficSource.call(this) &&
					wanted.join(',') === current.join(',');

				if (upToDate) {
					staticData.notificationSettingId = setting.id;
					staticData.endpointSecretKey = setting.endpoint_secret_key;
					return true;
				}

				// Settings changed since the destination was created: replace it.
				await deleteSetting.call(this, setting.id);
				delete staticData.notificationSettingId;
				delete staticData.endpointSecretKey;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				const events = await resolveEvents.call(this);

				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), "No events selected in 'Events'", {
						description:
							"Choose at least one event in 'Events', or choose '*' to receive every event.",
					});
				}

				const workflowName = this.getWorkflow().name;
				const response = (await paddleApiRequest.call(this, 'POST', '/notification-settings', {
					description: `n8n${workflowName ? `: ${workflowName}` : ''}`.slice(0, 500),
					destination: webhookUrl,
					type: 'url',
					api_version: 1,
					subscribed_events: events,
					traffic_source: trafficSource.call(this),
				})) as { data: NotificationSetting };

				staticData.notificationSettingId = response.data.id;
				staticData.endpointSecretKey = response.data.endpoint_secret_key;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				if (staticData.notificationSettingId) {
					await deleteSetting.call(this, staticData.notificationSettingId);
				}
				delete staticData.notificationSettingId;
				delete staticData.endpointSecretKey;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;

		let secret = staticData.endpointSecretKey;
		if (!secret) {
			// Static data can be missing (e.g. for test webhooks); look the secret up instead.
			const webhookUrl = this.getNodeWebhookUrl('default');
			const setting = webhookUrl
				? await findSettingByDestination.call(this, webhookUrl)
				: undefined;
			secret = setting?.endpoint_secret_key;
		}

		if (!req.rawBody) await req.readRawBody();
		const signature = this.getHeaderData()['paddle-signature'];

		if (
			!secret ||
			!verifyPaddleSignature(
				secret,
				Array.isArray(signature) ? signature[0] : signature,
				req.rawBody,
			)
		) {
			const res = this.getResponseObject();
			res.status(401).send('Invalid Paddle signature').end();
			return { noWebhookResponse: true };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(this.getBodyData())],
		};
	}
}
