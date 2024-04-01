export interface Schematic {
	/**
	 * Discord message id for the schematic
	 */
	id: string

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

export interface Dump {
	schematics: Schematic[]
	lastProcessedMessageID: string
	schematicType: SchematicType
}

export enum SchematicType {
	OfficialDiscordSchematic = 'OfficialDiscordSchematic',
	OfficialDiscordCuratedSchematic = 'OfficialDiscordCuratedSchematic',
}

export enum MindustryVersion {
	V5 = 'V5',
	V6 = 'V6',
	V7 = 'V7',
}
