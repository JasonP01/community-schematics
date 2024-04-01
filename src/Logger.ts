class Logger {
	private debugEnabled: boolean

	constructor(debug: boolean) {
		this.debugEnabled = debug
	}

	debug(message: string): void {
		if (!this.debugEnabled) return

		console.log(`[D]: ${message}`)
	}

	info(message: string): void {
		console.log(`[I]: ${message}`)
	}

	error(message: string): void
	error(message: string, error: Error): void
	error(message: string, error?: Error): void {
		console.error(`[E]: ${message}`)

		if (error) console.error(error)
	}
}

export default Logger
