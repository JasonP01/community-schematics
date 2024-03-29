import fs from 'fs/promises'

import { fileURLToPath } from 'url'
import path from 'path'
import { Dump, Schematic, SchematicType } from 'Types'
import { Queue } from '@datastructures-js/queue'

const startTime = process.hrtime.bigint()

const dirname = path.dirname(fileURLToPath(import.meta.url))

const schematicsDir = path.join(dirname, '../schematics/')
const dumpsDir = path.join(dirname, '../dumps/')

// Ensure directories exist
await fs.mkdir(schematicsDir, { recursive: true })
await fs.mkdir(dumpsDir, { recursive: true })

const dumpFiles = await fs.readdir(dumpsDir)

const maxParallelDownload = 10
const skippedSchematicTypes: readonly SchematicType[] = [
	SchematicType.OfficialDiscordCuratedSchematic,
]

const processedDumps: Set<string> = new Set()
const skippedDumps: Set<string> = new Set()
let downloadedSchematics = 0
let totalDownloadRequest = 0
let failedSchematicsDownload = 0
let rateLimitedSchematicsDownload = 0
let succeededSchematicsDownload = 0

let totalTimeTakenDownloading = 0n
let totalTimeTakenSaving = 0n
let totalTimeTaken = 0n

const schematicsDownloadQueue: Queue<{ type: SchematicType; schematic: Schematic }> = new Queue()
const currentSchematicsDownload: Set<string> = new Set()

const nanoSecondsToMilliseconds = (nanoSeconds: bigint): bigint => nanoSeconds / 1000000n

const logger = new Logger(false)

const tryDownloadSchematic = async () => {
	if (schematicsDownloadQueue.isEmpty() && currentSchematicsDownload.size === 0) {
		totalTimeTaken = process.hrtime.bigint() - startTime

		logger.info(`---------------------------------------`)
		logger.info(`Processed dumps: ${Array.from(processedDumps).join(', ')}.`)
		logger.info(`Processed dumps count: ${processedDumps.size}.`)
		logger.info(`Skipped dumps: ${Array.from(skippedDumps).join(', ')}.`)
		logger.info(`Skipped dumps count: ${skippedDumps.size}.`)
		logger.info(
			`Skipped schematic types: ${skippedSchematicTypes.map(it => SchematicType[it]).join(', ')}.`,
		)
		logger.info(`Downloaded schematics: ${downloadedSchematics}.`)
		logger.info(`Failed schematics download: ${failedSchematicsDownload}.`)
		logger.info(`Rate limited schematics download: ${rateLimitedSchematicsDownload}.`)
		logger.info(`Succeeded schematics download: ${succeededSchematicsDownload}.`)
		logger.info(`Total download request: ${totalDownloadRequest}.`)

		logger.info(`Time taken: ${nanoSecondsToMilliseconds(totalTimeTaken)}ms`)
		logger.info(
			`Time taken to download: ${nanoSecondsToMilliseconds(totalTimeTakenDownloading)}ms`,
		)
		logger.info(`Time taken to save: ${nanoSecondsToMilliseconds(totalTimeTakenSaving)}ms`)

		return
	}

	if (
		!schematicsDownloadQueue.isEmpty() &&
		currentSchematicsDownload.size < maxParallelDownload
	) {
		const { type, schematic } = schematicsDownloadQueue.dequeue()

		const fileName = `${schematic.id}-${schematic.fileName}`

		logger.debug(`Started downloading ${fileName}`)

		currentSchematicsDownload.add(fileName)

		const filePath = path.join(schematicsDir, type, fileName)

		let response: Response | null = null

		try {
			totalDownloadRequest += 1

			const startDownloadTime = process.hrtime.bigint()

			response = await fetch(schematic.url)

			totalTimeTakenDownloading += process.hrtime.bigint() - startDownloadTime

			const startSavingTime = process.hrtime.bigint()

			const arrayBuffer = await response.arrayBuffer()

			await fs.writeFile(filePath, Buffer.from(arrayBuffer))

			totalTimeTakenSaving += process.hrtime.bigint() - startSavingTime
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Error occured while trying to download ${fileName}.`, error)
			} else {
				logger.error(`Error occured while trying to download ${fileName}. ${error}.`)
			}
		}

		if (response === null) {
			failedSchematicsDownload += 1

			schematicsDownloadQueue.enqueue({ schematic, type })

			currentSchematicsDownload.delete(fileName)
		} else {
			if (response.status < 200 || response.status >= 300) {
				failedSchematicsDownload += 1

				if (response.status === 429) {
					rateLimitedSchematicsDownload += 1

					logger.error(`Rate limited occured while trying to download ${fileName}.`)

					// Wait for 10 secs if rate limited
					await new Promise<void>(resolve => setTimeout(() => resolve(), 10_000))
				} else {
					logger.error(
						`Unknown http status code occured while trying to download ${fileName} with the status ${response.status}.`,
					)
				}

				schematicsDownloadQueue.enqueue({ schematic, type })

				currentSchematicsDownload.delete(fileName)
			} else {
				succeededSchematicsDownload += 1

				logger.debug(`Downloaded ${fileName}`)

				currentSchematicsDownload.delete(fileName)
			}
		}

		tryDownloadSchematic()
	}
}

const queueSchematicDownload = (type: SchematicType, schematic: Schematic) => {
	schematicsDownloadQueue.enqueue({ type, schematic })

	tryDownloadSchematic()
}

for (const dumpFile of dumpFiles) {
	processedDumps.add(dumpFile)

	const dumpEncoded = await fs.readFile(path.join(dumpsDir, dumpFile), 'utf-8')

	const dump = JSON.parse(dumpEncoded) as Dump

	if (skippedSchematicTypes.includes(dump.schematicType)) {
		skippedDumps.add(dumpFile)

		continue
	}

	const typeName = SchematicType[dump.schematicType]

	await fs.mkdir(path.join(schematicsDir, typeName), { recursive: true })

	for (const schematic of dump.schematics) {
		downloadedSchematics += 1

		queueSchematicDownload(dump.schematicType, schematic)
	}
}
