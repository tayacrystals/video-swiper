/**
 * Builds seed.zip directly from import.txt + seed/meta/*.info.json + seed/videos/.
 * Run: bun run seed
 */
import JSZip from "jszip";

const lines = (await Bun.file("seed/source.txt").text())
	.split("\n")
	.map(l => l.trim())
	.filter(Boolean);

const data = [];
for (const line of lines) {
	const id = line.match(/\/video\/(\d+)/)?.[1];
	const handle = line.match(/@([^/?]+)/)?.[1];
	if (!id || !handle) continue;
	const info = await Bun.file(`seed/meta/${id}.info.json`).json();
	const artist =
		info.artist ?? (Array.isArray(info.artists) ? info.artists[0] : null);
	data.push({
		id,
		src: `videos/${id}.mp4`,
		poster: `videos/${id}.jpg`,
		author: "@" + handle,
		name: info.channel ?? handle,
		caption: info.description ?? "",
		song: info.track
			? `${info.track} · ${artist ?? handle}`
			: `original sound · ${handle}`,
		likes: info.like_count ?? 0,
		comments: info.comment_count ?? 0,
		bookmarks: info.save_count ?? 0,
		shares: info.repost_count ?? 0,
		views: info.view_count ?? 0,
		duration: info.duration ?? 0,
		uploaded: info.upload_date ?? "",
	});
}

const zip = new JSZip();
zip.file("data.json", JSON.stringify(data, null, 2));

for (const v of data) {
	try {
		zip.file(v.src, await Bun.file(`seed/${v.src}`).arrayBuffer(), {
			compression: "STORE",
		});
	} catch {
		console.warn("missing video:", v.src);
	}
	if (v.poster) {
		try {
			zip.file(v.poster, await Bun.file(`seed/${v.poster}`).arrayBuffer(), {
				compression: "STORE",
			});
		} catch {
			console.warn("missing poster:", v.poster);
		}
	}
}

const out = await zip.generateAsync({ type: "uint8array" });
await Bun.write("seed.zip", out);
console.log(`seed.zip written (${(out.length / 1e6).toFixed(2)} MB, ${data.length} videos)`);
