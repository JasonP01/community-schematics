import { SchematicType } from 'Dump'

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
