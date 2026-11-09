import { serve } from "bun";
import index from "./index.html";

const MIME: Record<string, string> = {
	mp4: "video/mp4",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	json: "application/json",
	js: "text/javascript",
	webmanifest: "application/manifest+json",
	ico: "image/x-icon",
};

serve({
	routes: { "/": index },
	async fetch(req) {
		const path = decodeURIComponent(new URL(req.url).pathname);
		// basic path traversal guard
		if (path.includes("..")) return new Response("Bad request", { status: 400 });
		const file = Bun.file(path === "/" ? "index.html" : `.${path}`);
		if (await file.exists()) {
			const ext = path.split(".").pop() ?? "";
			return new Response(file, {
				headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
			});
		}
		return new Response("Not found", { status: 404 });
	},
	development: {
		hmr: true,
		console: true,
	},
});

console.log("→ http://localhost:3000");
