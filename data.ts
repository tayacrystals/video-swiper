/**
 * Local data layer: video metadata + media blobs in IndexedDB.
 * Seed: auto-fetches ./seed.zip on first run (empty DB).
 * Zip import/export uses the same layout as the repo (data.json + videos/*).
 */
import JSZip from "jszip";

export interface VideoMeta {
	id: string;
	src: string; // logical path in exports, e.g. "videos/<id>.mp4"
	poster: string | null;
	avatar: string | null; // logical path in exports, e.g. "avatars/<id>.jpg"
	author: string;
	name: string;
	caption: string;
	song: string;
	likes: number;
	comments: number;
	bookmarks: number;
	shares: number;
	views: number;
	duration: number;
	uploaded: string;
}

export interface Playable extends VideoMeta {
	srcURL: string;
	posterURL: string;
	avatarURL: string;
}

interface MediaRec {
	video: Blob;
	poster?: Blob;
	avatar?: Blob;
}

/* ---------- IndexedDB ---------- */
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
	if (!dbp) {
		dbp = new Promise((res, rej) => {
			const r = indexedDB.open("video-swiper", 1);
			r.onupgradeneeded = () => {
				r.result.createObjectStore("config");
				r.result.createObjectStore("media");
			};
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
	}
	return dbp;
}

function req<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return db().then(
		d =>
			new Promise<T>((res, rej) => {
				const q = fn(d.transaction(store, mode).objectStore(store));
				q.onsuccess = () => res(q.result);
				q.onerror = () => rej(q.error);
			})
	);
}

const getConfig = (): Promise<VideoMeta[]> =>
	req<VideoMeta[] | undefined>("config", "readonly", s => s.get("feed")).then(c => c ?? []);
const setConfig = (feed: VideoMeta[]) => req("config", "readwrite", s => s.put(feed, "feed"));
const getMedia = (id: string) => req<MediaRec | undefined>("media", "readonly", s => s.get(id));
const putMedia = (id: string, rec: MediaRec) => req("media", "readwrite", s => s.put(rec, id));
const delMedia = (id: string) => req("media", "readwrite", s => s.delete(id));
const getFlag = (k: string) => req("config", "readonly", s => s.get(k));
const setFlag = (k: string, v: unknown) => req("config", "readwrite", s => s.put(v, k));

/* ---------- Object URLs ---------- */
const urlCache = new Map<string, string>();

async function mediaURL(id: string, kind: "video" | "poster" | "avatar"): Promise<string> {
	const key = id + ":" + kind;
	const hit = urlCache.get(key);
	if (hit) return hit;
	const rec = await getMedia(id);
	const blob = kind === "video" ? rec?.video : kind === "poster" ? rec?.poster : rec?.avatar;
	if (!blob) return "";
	const url = URL.createObjectURL(blob);
	urlCache.set(key, url);
	return url;
}

function revokeAll() {
	for (const u of urlCache.values()) URL.revokeObjectURL(u);
	urlCache.clear();
}

/** Cached object URL for a stored blob (safe to call anytime). */
export function getMediaURL(id: string, kind: "video" | "poster" | "avatar"): Promise<string> {
	return mediaURL(id, kind);
}

/* ---------- Public API ---------- */
export async function getList(): Promise<VideoMeta[]> {
	let feed = await getConfig();
	if (feed.length === 0 && !(await getFlag("seeded"))) {
		await setFlag("seeded", true);
		try {
			const res = await fetch("seed.zip");
			if (res.ok) {
				await importZip(await res.blob(), true);
				feed = await getConfig();
			}
		} catch {
			/* no seed available */
		}
	}
	return feed;
}

/** Feed with playable object URLs; revokes URLs of the previous call. */
export async function getPlayable(): Promise<Playable[]> {
	revokeAll();
	const feed = await getList();
	return Promise.all(
		feed.map(async v => ({
			...v,
			srcURL: await mediaURL(v.id, "video"),
			posterURL: await mediaURL(v.id, "poster"),
			avatarURL: await mediaURL(v.id, "avatar"),
		}))
	);
}

export async function addVideo(
	videoFile: Blob,
	posterFile: Blob | null,
	avatarFile: Blob | null,
	meta: Omit<VideoMeta, "id" | "src" | "poster" | "avatar">
): Promise<string> {
	const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const ext = videoFile.type.includes("webm") ? "webm" : "mp4";
	const rec: MediaRec = { video: videoFile };
	if (posterFile) rec.poster = posterFile;
	if (avatarFile) rec.avatar = avatarFile;
	await putMedia(id, rec);
	const feed = await getConfig();
	feed.push({
		...meta,
		id,
		src: `videos/${id}.${ext}`,
		poster: posterFile ? `videos/${id}.jpg` : null,
		avatar: avatarFile ? `avatars/${id}.jpg` : null,
	});
	await setConfig(feed);
	return id;
}

export async function setAvatar(id: string, file: Blob): Promise<void> {
	const rec = (await getMedia(id)) ?? { video: new Blob() };
	rec.avatar = file;
	await putMedia(id, rec);
	const urlKey = id + ":avatar";
	const old = urlCache.get(urlKey);
	if (old) URL.revokeObjectURL(old);
	urlCache.delete(urlKey);
	const feed = await getConfig();
	const v = feed.find(x => x.id === id);
	if (v) {
		v.avatar = `avatars/${id}.jpg`;
		await setConfig(feed);
	}
}

export async function updateMeta(id: string, patch: Partial<VideoMeta>): Promise<void> {
	const feed = await getConfig();
	const i = feed.findIndex(v => v.id === id);
	const cur = feed[i];
	if (cur) {
		feed[i] = { ...cur, ...patch, id };
		await setConfig(feed);
	}
}

export async function deleteVideo(id: string): Promise<void> {
	await delMedia(id);
	revokeAll();
	await setConfig((await getConfig()).filter(v => v.id !== id));
}

export async function moveVideo(id: string, delta: -1 | 1): Promise<void> {
	const feed = await getConfig();
	const i = feed.findIndex(v => v.id === id);
	const j = i + delta;
	const a = feed[i];
	const b = feed[j];
	if (!a || !b) return;
	feed[i] = b;
	feed[j] = a;
	await setConfig(feed);
}

export async function clearAll(): Promise<void> {
	revokeAll();
	for (const v of await getConfig()) await delMedia(v.id);
	await setConfig([]);
}

/* ---------- Zip export / import ---------- */
export async function exportZip(): Promise<Blob> {
	const feed = await getConfig();
	const zip = new JSZip();
	zip.file("data.json", JSON.stringify(feed, null, 2));
	for (const v of feed) {
		const m = await getMedia(v.id);
		if (m?.video) zip.file(v.src, m.video, { compression: "STORE" });
		if (m?.poster && v.poster) zip.file(v.poster, m.poster, { compression: "STORE" });
		if (m?.avatar && v.avatar) zip.file(v.avatar, m.avatar, { compression: "STORE" });
	}
	return zip.generateAsync({ type: "blob" });
}

export async function importZip(blob: Blob, replace: boolean): Promise<number> {
	const zip = await JSZip.loadAsync(blob);
	const dataFile = zip.file("data.json");
	if (!dataFile) throw new Error("data.json not found in zip");
	const metas = JSON.parse(await dataFile.async("string")) as VideoMeta[];
	if (!Array.isArray(metas)) throw new Error("invalid data.json");

	let feed: VideoMeta[];
	if (replace) {
		for (const v of await getConfig()) await delMedia(v.id);
		feed = [];
	} else {
		feed = await getConfig();
	}

	let imported = 0;
	for (const m of metas) {
		if (!m || typeof m.id !== "string") continue;
		const vFile =
			zip.file(m.src) ??
			zip.file(`videos/${m.id}.mp4`) ??
			zip.file(`videos/${m.id}.webm`);
		if (!vFile) continue;
		const rawVid = await vFile.async("blob");
		const video = new Blob([await rawVid.arrayBuffer()], {
			type: m.src.endsWith(".webm") ? "video/webm" : "video/mp4",
		});
		let poster: Blob | undefined;
		const pFile = m.poster ? zip.file(m.poster) : null;
		if (pFile) {
			poster = new Blob([await (await pFile.async("blob")).arrayBuffer()], {
				type: "image/jpeg",
			});
		}
		let avatar: Blob | undefined;
		const aFile = m.avatar ? zip.file(m.avatar) : null;
		if (aFile) {
			avatar = new Blob([await (await aFile.async("blob")).arrayBuffer()], {
				type: "image/jpeg",
			});
		}
		const rec: MediaRec = { video };
		if (poster) rec.poster = poster;
		if (avatar) rec.avatar = avatar;
		await putMedia(m.id, rec);
		const entry: VideoMeta = {
			...m,
			poster: poster ? m.poster : null,
			avatar: avatar ? m.avatar : null,
		};
		const i = feed.findIndex(f => f.id === m.id);
		if (i >= 0) feed[i] = entry;
		else feed.push(entry);
		imported++;
	}
	await setConfig(feed);
	revokeAll();
	return imported;
}
