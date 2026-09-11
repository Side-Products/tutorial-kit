import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A loopback-only fixture: no accounts, external assets, or persistent writes.
export async function startDemoServer(port = 4000) {
	const html = fs.readFileSync(new URL("./index.html", import.meta.url));
	const server = http.createServer((request, response) => {
		const pathname = new URL(request.url, "http://localhost").pathname;
		if (request.method !== "GET" || !["/", "/projects"].includes(pathname)) {
			response.writeHead(404).end("Not found");
			return;
		}
		response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
		response.end(html);
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", resolve);
	});
	return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const server = await startDemoServer();
	console.log(`Tutorials Kit demo: http://127.0.0.1:${server.address().port}`);
	for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
}
