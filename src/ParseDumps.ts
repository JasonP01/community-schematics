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
const skippedSchematicType: readonly SchematicType[] = [SchematicType.OfficialDiscordSchematic]

const processedDumps: Set<string> = new Set()
let downloadedSchematics = 0
let totalDownloadRequest = 0
let failedSchematicsDownload = 0
let succeededSchematicsDownload = 0

let totalTimeTakenDownloading = 0n
let totalTimeTakenSaving = 0n
let totalTimeTaken = 0n

const schematicsDownloadQueue: Queue<{ type: SchematicType; schematic: Schematic }> = new Queue()
const currentSchematicsDownload: Set<string> = new Set()

const nanoSecondsToMilliseconds = (nanoSeconds: bigint): bigint => nanoSeconds / 1000000n

const tryDownloadSchematic = async () => {
	if (schematicsDownloadQueue.isEmpty() && currentSchematicsDownload.size === 0) {
		totalTimeTaken = process.hrtime.bigint() - startTime

		console.log(`---------------------------------------`)
		console.log(`Processed dumps: ${Array.from(processedDumps).join(', ')}.`)
		console.log(`Processed dumps count: ${processedDumps.size}.`)
		console.log(`Downloaded schematics: ${downloadedSchematics}.`)
		console.log(`Failed schematics download: ${failedSchematicsDownload}.`)
		console.log(`Succeeded schematics download: ${succeededSchematicsDownload}.`)
		console.log(`Total download request: ${totalDownloadRequest}.`)

		console.log(`Time taken: ${nanoSecondsToMilliseconds(totalTimeTaken)}ms`)
		console.log(
			`Time taken to download: ${nanoSecondsToMilliseconds(totalTimeTakenDownloading)}ms`,
		)
		console.log(`Time taken to save: ${nanoSecondsToMilliseconds(totalTimeTakenSaving)}ms`)

		return
	}

	if (
		!schematicsDownloadQueue.isEmpty() &&
		currentSchematicsDownload.size < maxParallelDownload
	) {
		const { type, schematic } = schematicsDownloadQueue.dequeue()

		const fileName = `${schematic.id}-${schematic.fileName}`

		console.log(`Started downloading ${fileName}`)

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
			console.log(`Error occured while trying to download ${fileName}.`, error)
		}

		if (response === null) {
			failedSchematicsDownload += 1

			schematicsDownloadQueue.enqueue({ schematic, type })

			currentSchematicsDownload.delete(fileName)
		} else {
			if (response.status < 200 || response.status >= 300) {
				failedSchematicsDownload += 1

				if (response.status === 429) {
					console.log(`Rate limited occured while trying to download ${fileName}.`)

					// Wait for 10 secs if rate limited
					await new Promise<void>(resolve => setTimeout(() => resolve(), 10_000))
				} else {
					console.log(
						`Unknown http status code occured while trying to download ${fileName} with the status ${response.status}.`,
					)
				}

				schematicsDownloadQueue.enqueue({ schematic, type })

				currentSchematicsDownload.delete(fileName)
			} else {
				succeededSchematicsDownload += 1

				console.log(`Downloaded ${fileName}`)

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

	if (skippedSchematicType.includes(dump.schematicType)) continue

	const typeName = SchematicType[dump.schematicType]

	await fs.mkdir(path.join(schematicsDir, typeName), { recursive: true })

	for (const schematic of dump.schematics) {
		downloadedSchematics += 1

		queueSchematicDownload(dump.schematicType, schematic)
	}
}
