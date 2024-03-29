// This use self bot to dump all schematics from discord
// Self bot implementation: https://github.com/rigwild/discord-self-bot-console

interface Schematic {
	fileName: string

	/**
	 * Download url
	 */
	url: string

	/**
	 * File size in bytes
	 */
	size: number

	/**
	 * Epoch in milliseconds on when the schematic was posted
	 */
	date: number
}

interface Data {
	schematics: Schematic[]
}

interface SaveDataOptions {
	tryLocalStorage?: boolean
	file?: boolean
}

enum SchematicChannel {
	Schematic,
	CuratedSchematic,
}

const schematicChannelToDiscordChannelIDLookup = {
	[SchematicChannel.Schematic]: '640604827344306207',
	[SchematicChannel.CuratedSchematic]: '878022862915653723',
} as const

const localStoragePrefix = 'Kennarddh'

const getLocalStorageKey = (name: string) => `${localStoragePrefix}-${name}`

const saveData = (name: string, data: Data, options: SaveDataOptions) => {
	const encodedData = JSON.stringify(data)

	const storeName = getLocalStorageKey(name)

	if (options.tryLocalStorage) {
		try {
			localStorage.setItem(storeName, encodedData)

			console.log(`Saved as "${storeName}" in localStorage`)
		} catch (error) {
			console.log('Not enough space in local storage.')
		}
	}

	if (options.file) {
		downloadStringAsFile(`${storeName}.json`, encodedData, 'application/json')

		console.log(`Downloaded as "${storeName}.json".`)
	}
}

const getLocalStoragePropertyDescriptor = () => {
	const iframe = document.createElement('iframe')

	document.head.append(iframe)

	const localStoragePropertyDescriptor = Object.getOwnPropertyDescriptor(
		iframe.contentWindow,
		'localStorage',
	)

	iframe.remove()

	return localStoragePropertyDescriptor as PropertyDescriptor
}

const bringBackLocalStorage = () => {
	Object.defineProperty(window, 'localStorage', getLocalStoragePropertyDescriptor())
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * The value is no lower than min (or the next integer greater than min
 * if min isn't an integer) and no greater than max (or the next integer
 * lower than max if max isn't an integer).
 * Using Math.round() will give you a non-uniform distribution!
 */
const getRandomInRange = (min: number, max: number): number => {
	const newMin = Math.ceil(min)
	const newMax = Math.floor(max)

	return Math.floor(Math.random() * (newMax - newMin + 1)) + newMin
}

const downloadStringAsFile = (fileName: string, text: string, mime: string = 'text/plain') => {
	var element = document.createElement('a')
	element.setAttribute('href', `data:${mime};charset=utf-8,${encodeURIComponent(text)}`)
	element.setAttribute('download', fileName)

	element.style.display = 'none'
	document.body.appendChild(element)

	element.click()

	document.body.removeChild(element)
}

const data: Data = { schematics: [] }

const processMessages = (messages: Message[], validateSchemEligibility: boolean) => {
	for (const message of messages) {
		const date = new Date(message.timestamp).getTime()

		if (validateSchemEligibility) {
			const litterReaction = message.reactions?.find(it => it.emoji.name === '🚮')

			const reactionCount = litterReaction?.count ?? 0

			if (reactionCount >= 5) continue
			if (date < 1000 * 60 * 60 * 24 * 3) continue // Ignore new schematic that has just been posted in 3 days
		}

		const mschAttachment = message.attachments[0]

		if (!mschAttachment) continue
		if (!mschAttachment.filename.endsWith('.msch')) continue

		data.schematics.push({
			fileName: mschAttachment.filename,
			size: mschAttachment.size,
			url: mschAttachment.url,
			date,
		})
	}
}

bringBackLocalStorage()

const schematicChannel = SchematicChannel.Schematic
const channelID = schematicChannelToDiscordChannelIDLookup[schematicChannel]

let beforeID: string | null = null

let i = 1

while (true) {
	console.log(`Scrapping ${i}`)

	const params: GetMessagesParams = {}

	if (beforeID !== null) {
		params.before = beforeID
	}

	const messages = await api.getMessages(channelID, 100, params)

	const hasEnded = messages.length === 0

	if (hasEnded) break

	// Don't check CuratedSchematic eligibility
	processMessages(messages, schematicChannel != SchematicChannel.CuratedSchematic)

	// There must be last message because hasEnded is false
	const oldestID = messages.at(-1)!.id

	beforeID = oldestID

	const delayMS = getRandomInRange(3500, 5000)

	console.log(`Scrapping ${i} done. Delaying for ${delayMS}ms...`)

	i += 1

	await api.delay(delayMS)
}

console.log(`Done with ${data.schematics.length} schematics. Saving...`)

saveData(SchematicChannel[schematicChannel], data, {
	tryLocalStorage: true,
	file: true,
})

// To mark this file as module and allow top level await
export {}