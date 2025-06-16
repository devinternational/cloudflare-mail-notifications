/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { LetterparserNode, parse as parseRawEmail } from 'letterparser'
import { nanoid } from 'nanoid'

interface ENV {
	SLACK_CHANNEL: string
	SLACK_BOT_TOKEN: SecretsStoreSecret
	MAIL_NOTIFICATIONS: KVNamespace
}

export default {
	async email(message: ForwardableEmailMessage, env: ENV): Promise<void> {
		const uid = nanoid()
		const { raw } = message
		const rawEmail = (await (new Response(raw)).text()).replace(/utf-8/gi, 'utf-8')
		const email = parseRawEmail(rawEmail)

		await env.MAIL_NOTIFICATIONS.put(uid, JSON.stringify(email))

		const { headers, body: emailBody } = email
		const from = headers['From']
		const to = headers['To']
		const subject = headers['Subject']
		const date = headers['Date']
		const body = emailBody as LetterparserNode[]
		const htmlBody = body.find((node) => node.contentType.type === 'text/plain')

		const response = await fetch('https://slack.com/api/chat.postMessage', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${await env.SLACK_BOT_TOKEN.get()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				channel: env.SLACK_CHANNEL,
				blocks: [
					{
						type: "header",
						text: {
							type: "plain_text",
							text: `✉️ ${subject}`,
							emoji: true,
						},
					},
					{
						type: "divider",
					},
					{
						type: "section",
						fields: [
							{
								type: "mrkdwn",
								text: "*from*",
							},
							{
								type: "mrkdwn",
								text: "*to*",
							},
							{
								type: "plain_text",
								text: from || 'unknown',
							},
							{
								type: "plain_text",
								text: to || 'unknown',
							},
						],
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: (htmlBody?.body as string)?.slice(0, 2999) || '(empty)',
						},
					},
					{
						"type": "section",
						"text": {
							"type": "mrkdwn",
							"text": `_At: ${date}_\n_uid: ${uid}_`,
						},
					},
				],
			}),
		})

		if (!response.ok) {
			throw new Error(`Failed to send message to Slack`)
		}
	},
} satisfies ExportedHandler<ENV>
