#!/usr/bin/env node
import("../src/cli.mjs")
	.then((m) => m.main(process.argv.slice(2)))
	.catch((e) => {
		console.error(e?.stack || String(e));
		process.exit(1);
	});
