/**
 * Admin overlay: manage videos stored in IndexedDB.
 * Add (file + metadata + auto poster), edit, delete, reorder,
 * export/import zip.
 */
import * as data from "./data";

const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const num = (s: string) => {
	const n = parseInt(s.replace(/[^\d]/g, ""), 10);
	return Number.isFinite(n) ? n : 0;
};

/* Grab a JPEG poster from the first moments of a video file. */
async function capturePoster(file: Blob): Promise<{ blob: Blob | null; duration: number }> {
	const url = URL.createObjectURL(file);
	const v = document.createElement("video");
	try {
		v.muted = true;
		v.playsInline = true;
		v.src = url;
		await new Promise<void>((res, rej) => {
			v.onloadeddata = () => res();
			v.onerror = () => rej(new Error("unreadable video"));
		});
		const t = Math.min(0.5, (v.duration || 1) / 2 || 0.1);
		v.currentTime = t;
		await new Promise<void>(res => (v.onseeked = () => res()));
		const w = 240;
		const h = Math.round((w * (v.videoHeight || 16)) / (v.videoWidth || 9));
		const c = document.createElement("canvas");
		c.width = w;
		c.height = h;
		c.getContext("2d")!.drawImage(v, 0, 0, w, h);
		const blob = await new Promise<Blob | null>(res =>
			c.toBlob(b => res(b), "image/jpeg", 0.8)
		);
		return { blob, duration: Math.round(v.duration || 0) };
	} catch {
		return { blob: null, duration: 0 };
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function openAdmin(onChange: () => void) {
	// prevent multiple instances
	document.getElementById("admin")?.remove();

	const el = document.createElement("div");
	el.id = "admin";
	el.className = "admin";
	document.querySelector(".phone")!.appendChild(el);

	const close = () => {
		el.remove();
		onChange();
	};

	function download(blob: Blob, name: string) {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	}

	async function render() {
		const list = await data.getList();
		el.innerHTML = `
		<header class="admin-head">
			<button class="admin-back" aria-label="Close">‹</button>
			<h1>Manage videos</h1>
			<div class="admin-actions">
				<button class="admin-btn" data-act="import">Import</button>
				<button class="admin-btn" data-act="export">Export</button>
			</div>
		</header>
		<div class="admin-body">
			${list.length === 0 ? `<p class="admin-empty">No videos yet — add one below or import a zip.</p>` : ""}
			${list
				.map(
					(v, i) => `
			<div class="admin-row" data-id="${v.id}">
				<img class="admin-thumb" data-thumb="${v.id}" alt="">
				<div class="admin-info">
					<strong>${esc(v.author)}</strong>
					<span>${esc(v.caption) || "(no caption)"}</span>
					<small>♥ ${v.likes} · 💬 ${v.comments} · 🔖 ${v.bookmarks}</small>
				</div>
				<div class="admin-rowbtns">
					<button data-act="up" ${i === 0 ? "disabled" : ""} title="Move up">↑</button>
					<button data-act="down" ${i === list.length - 1 ? "disabled" : ""} title="Move down">↓</button>
					<button data-act="edit" title="Edit">✎</button>
					<button data-act="del" title="Delete">🗑</button>
				</div>
				<form class="admin-edit hidden" data-form="${v.id}">
					<label>Author <input name="author" value="${esc(v.author)}"></label>
					<label>Caption <input name="caption" value="${esc(v.caption)}"></label>
					<label>Song <input name="song" value="${esc(v.song)}"></label>
					<div class="admin-nums">
						<label>Likes <input name="likes" inputmode="numeric" value="${v.likes}"></label>
						<label>Comments <input name="comments" inputmode="numeric" value="${v.comments}"></label>
						<label>Bookmarks <input name="bookmarks" inputmode="numeric" value="${v.bookmarks}"></label>
						<label>Shares <input name="shares" inputmode="numeric" value="${v.shares}"></label>
					</div>
					<button type="submit" class="admin-btn primary">Save</button>
				</form>
			</div>`
				)
				.join("")}

			<form class="admin-add" id="adminAdd">
				<h2>Add video</h2>
				<div class="admin-file">
					<button type="button" class="admin-btn" id="pickVideo">Choose video…</button>
					<span id="pickName">no file selected</span>
					<input type="file" id="videoFile" accept="video/*" hidden>
				</div>
				<label>Author <input name="author" placeholder="@handle"></label>
				<label>Caption <input name="caption" placeholder="Caption #hashtags"></label>
				<label>Song <input name="song" placeholder="song · artist"></label>
				<div class="admin-nums">
					<label>Likes <input name="likes" inputmode="numeric" value="0"></label>
					<label>Comments <input name="comments" inputmode="numeric" value="0"></label>
					<label>Bookmarks <input name="bookmarks" inputmode="numeric" value="0"></label>
					<label>Shares <input name="shares" inputmode="numeric" value="0"></label>
				</div>
				<button type="submit" class="admin-btn primary" id="addBtn" disabled>Add video</button>
				<p class="admin-status" id="adminStatus"></p>
			</form>
		</div>
		<input type="file" id="zipFile" accept=".zip,application/zip" hidden>`;

		// poster thumbnails (cached object URLs, do not disturb feed URLs)
		for (const v of list) {
			const p = await data.getMediaURL(v.id, "poster");
			const img = el.querySelector<HTMLImageElement>(`[data-thumb="${v.id}"]`);
			if (img && p) img.src = p;
		}

		bind();
	}

	function bind() {
		el.querySelector(".admin-back")!.addEventListener("click", close);

		el.querySelector('[data-act="export"]')!.addEventListener("click", async () => {
			const blob = await data.exportZip();
			download(blob, "video-swiper-feed.zip");
		});

		const zipInput = el.querySelector<HTMLInputElement>("#zipFile")!;
		el.querySelector('[data-act="import"]')!.addEventListener("click", () => zipInput.click());
		zipInput.addEventListener("change", async () => {
			const f = zipInput.files?.[0];
			if (!f) return;
			const replace = confirm(
				"Replace all existing videos with the zip contents?\n\nOK = replace everything\nCancel = merge (keeps existing)"
			);
			try {
				const n = await data.importZip(f, replace);
				alert(`Imported ${n} video(s).`);
			} catch (e) {
				alert("Import failed: " + (e as Error).message);
			}
			render();
		});

		el.querySelectorAll<HTMLElement>(".admin-row").forEach(row => {
			const id = row.dataset.id!;
			row.querySelectorAll<HTMLButtonElement>(".admin-rowbtns button").forEach(btn => {
				btn.addEventListener("click", async () => {
					switch (btn.dataset.act) {
						case "up":
							await data.moveVideo(id, -1);
							break;
						case "down":
							await data.moveVideo(id, 1);
							break;
						case "del":
							if (confirm("Delete this video?")) await data.deleteVideo(id);
							break;
						case "edit":
							row.querySelector(".admin-edit")!.classList.toggle("hidden");
							return;
					}
					render();
				});
			});

			row.querySelector<HTMLFormElement>(`.admin-edit[data-form]`)!.addEventListener(
				"submit",
				async e => {
					e.preventDefault();
					const fd = new FormData(e.target as HTMLFormElement);
					await data.updateMeta(id, {
						author: String(fd.get("author") ?? ""),
						caption: String(fd.get("caption") ?? ""),
						song: String(fd.get("song") ?? ""),
						likes: num(String(fd.get("likes"))),
						comments: num(String(fd.get("comments"))),
						bookmarks: num(String(fd.get("bookmarks"))),
						shares: num(String(fd.get("shares"))),
					});
					render();
				}
			);
		});

		// add form
		const videoInput = el.querySelector<HTMLInputElement>("#videoFile")!;
		const pickName = el.querySelector("#pickName")!;
		const addBtn = el.querySelector<HTMLButtonElement>("#addBtn")!;
		const status = el.querySelector("#adminStatus")!;
		el.querySelector("#pickVideo")!.addEventListener("click", () => videoInput.click());
		videoInput.addEventListener("change", () => {
			const f = videoInput.files?.[0];
			pickName.textContent = f ? `${f.name} (${(f.size / 1e6).toFixed(1)} MB)` : "no file selected";
			addBtn.disabled = !f;
		});

		el.querySelector("#adminAdd")!.addEventListener("submit", async e => {
			e.preventDefault();
			const form = e.target as HTMLFormElement;
			const f = videoInput.files?.[0];
			if (!f) return;
			addBtn.disabled = true;
			status.textContent = "Processing…";
			const fd = new FormData(form);
			const author = String(fd.get("author") ?? "").trim();
			const { blob: poster, duration } = await capturePoster(f);
			await data.addVideo(f, poster, {
				author: author ? (author.startsWith("@") ? author : "@" + author) : "@unknown",
				name: author || "unknown",
				caption: String(fd.get("caption") ?? ""),
				song: String(fd.get("song") ?? "") || `original sound · ${author || "unknown"}`,
				likes: num(String(fd.get("likes"))),
				comments: num(String(fd.get("comments"))),
				bookmarks: num(String(fd.get("bookmarks"))),
				shares: num(String(fd.get("shares"))),
				views: 0,
				duration,
				uploaded: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
			});
			status.textContent = "";
			render();
		});
	}

	render();
}
