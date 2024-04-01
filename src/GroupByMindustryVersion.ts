import fs from 'fs/promises'

import { fileURLToPath } from 'url'
import path from 'path'
import CustomBuffer from 'CustomBuffer'
import { Inflate } from 'Utils/Compression'
import { MindustryVersion, SchematicType } from 'Types'
import { NanoSecondsToMilliseconds } from 'Utils/Time'
import Logger from 'Logger'

const startTime = process.hrtime.bigint()

const dirname = path.dirname(fileURLToPath(import.meta.url))

const schematicsDir = path.join(dirname, '../schematics/')

const logger = new Logger(false)

const headerBytes = Buffer.from('msch', 'utf-8')

// Ensure directories exist
await fs.mkdir(schematicsDir, { recursive: true })

const processedSchematicType: Set<SchematicType> = new Set()
let movedSchematics = 0

let totalTimeTakenMovingFile = 0n
let totalTimeTakenDeterminingMindustryVersion = 0n
let totalTimeTakenReadingSchematicFile = 0n
let totalTimeTaken = 0n

const schematicTypesDir = await fs.readdir(schematicsDir, { withFileTypes: true })

/**
 * This reset the buffer offset after checking, so the buffer can be reused
 */
const determineSchematicMindustryVersion = async (
	deflatedBuffer: CustomBuffer,
): Promise<MindustryVersion> => {
	const startOffset = deflatedBuffer.offset

	const schematicVersion = deflatedBuffer.read()

	if (schematicVersion.value === 0) return MindustryVersion.V5

	const buffer = await Inflate(deflatedBuffer)

	// Skip width and height
	buffer.skipShort(2)

	const tagsCount = buffer.readUByte().value

	for (let i = 0; i < tagsCount; i++) {
		const key = buffer.readUTF()

		buffer.skipUTF()

		if (key === 'labels') return MindustryVersion.V7
	}

	deflatedBuffer.offset = startOffset

	return MindustryVersion.V6
}

for (const schematicType of schematicTypesDir) {
	if (!schematicType.isDirectory()) continue

	logger.debug(`Starting for schematic type: ${schematicType.name}`)

	if (!Object.keys(SchematicType).includes(schematicType.name)) {
		logger.info(`${schematicType.name} is not a valid schematic type. Skipping...`)

		continue
	}

	processedSchematicType.add(SchematicType[schematicType.name as SchematicType])

	const schematicTypeDirPath = path.join(schematicsDir, schematicType.name)

	const schematicTypeDir = await fs.readdir(schematicTypeDirPath, {
		withFileTypes: true,
	})

	for (const schematicFile of schematicTypeDir) {
		logger.debug(`Starting schematic: ${path.join(schematicTypeDirPath, schematicFile.name)}`)

		if (!schematicFile.isFile()) continue

		const startReadSchematicFileTime = process.hrtime.bigint()

		const schematicRawBuffer = await fs.readFile(
			path.join(schematicTypeDirPath, schematicFile.name),
		)

		totalTimeTakenReadingSchematicFile += process.hrtime.bigint() - startReadSchematicFileTime

		const startDeterminingMindustryVersionTime = process.hrtime.bigint()

		const schematicDeflatedBuffer = CustomBuffer.fromBuffer(schematicRawBuffer)

		for (const headerByte of headerBytes) {
			if (schematicDeflatedBuffer.read().value != headerByte) continue
		}

		const mindustryVersion = await determineSchematicMindustryVersion(schematicDeflatedBuffer)

		totalTimeTakenDeterminingMindustryVersion +=
			process.hrtime.bigint() - startDeterminingMindustryVersionTime

		const mindustryVersionName = MindustryVersion[mindustryVersion]

		const startMovingFileTime = process.hrtime.bigint()

		// Ensure directories exist
		await fs.mkdir(path.join(schematicTypeDirPath, mindustryVersionName), { recursive: true })

		await fs.rename(
			path.join(schematicTypeDirPath, schematicFile.name),
			path.join(schematicTypeDirPath, mindustryVersionName, schematicFile.name),
		)

		totalTimeTakenMovingFile += process.hrtime.bigint() - startMovingFileTime

		movedSchematics += 1

		logger.debug(`Done schematic: ${path.join(schematicTypeDirPath, schematicFile.name)}`)
	}

	logger.debug(`Done for schematic type: ${schematicType.name}`)
}

totalTimeTaken = process.hrtime.bigint() - startTime

logger.info(`---------------------------------------`)
logger.info(
	`Processed schematic types: ${Array.from(processedSchematicType)
		.map(it => SchematicType[it])
		.join(', ')}.`,
)
logger.info(`Moved schematics: ${movedSchematics}.`)

logger.info(`Time taken: ${NanoSecondsToMilliseconds(totalTimeTaken)}ms`)
logger.info(
	`Time taken to read schematics file: ${NanoSecondsToMilliseconds(totalTimeTakenReadingSchematicFile)}ms`,
)
logger.info(
	`Time taken to determine schematic's mindustry version: ${NanoSecondsToMilliseconds(totalTimeTakenDeterminingMindustryVersion)}ms`,
)
logger.info(
	`Time taken to move schematic's file: ${NanoSecondsToMilliseconds(totalTimeTakenMovingFile)}ms`,
)
