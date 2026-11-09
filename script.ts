/* ---------- Icons (loaded from ./assets/icons) ---------- */
const ICON_NAMES = [
	"heart", "comment", "bookmark", "share", "plus", "home", "compass",
	"inbox", "person", "music", "play", "close", "search", "volOn", "volOff", "send", "plus-circle",
] as const;
type IconName = (typeof ICON_NAMES)[number];
const ICONS = {} as Record<IconName, string>;

async function loadIcons() {
	await Promise.all(
		ICON_NAMES.map(async n => {
			const res = await fetch(`assets/icons/${n}.svg`);
			ICONS[n] = await res.text();
		})
	);
}

/* ---------- Data (IndexedDB, seeded from ./seed.zip) ---------- */
import { getPlayable, type Playable } from "./data";
import { openAdmin } from "./admin";

let VIDEOS: Playable[] = [];
const goAdmin = () => openAdmin(() => { closeSheet(); refreshData(); });

const GRADS = [
	"linear-gradient(135deg,#fe2c55,#6a0dad)",
	"linear-gradient(135deg,#25f4ee,#0066ff)",
	"linear-gradient(135deg,#f8c445,#fe2c55)",
	"linear-gradient(135deg,#3aff7a,#25f4ee)",
	"linear-gradient(135deg,#ff7a59,#c837ab)",
	"linear-gradient(135deg,#7a5bff,#25f4ee)",
];

const COMMENT_NAMES = [
	"pixel.pete", "lofi.luna", "doomscroll.50", "certified.vibes",
	"the.real.slim", "spicy.take", "glitchy", "midnight.snack",
	"touch.grass", "auntie.approved",
];
const COMMENT_TEXTS = [
	"this is cinema 🎬",
	"ran back to watch a second time 😭",
	"how is this free content",
	"ok but why does this go so hard 🔥",
	"BRO 💀💀💀",
	"saving this for later fr",
	"the transition at the end?? insane",
	"my fyp knew exactly what i needed",
	"watched 47 times. no thoughts just vibes",
	"algorithm blessed us today 🙏",
	"i am sat 🪑",
	"this deserves 1M likes minimum",
];
const EMOJIS = ["🧑‍🎤", "🧋", "🐸", "🛸", "🍕", "🌙", "🦖", "🦄", "🤠", "👾"];

interface Comment {
	name: string;
	text: string;
	avatar: string;
	likes: number;
	time: string;
	liked: boolean;
}

function seeded(seed: number) {
	let s = seed;
	return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
function makeComments(seed: number): Comment[] {
	const r = seeded(seed * 7919 + 13);
	const n = 5 + Math.floor(r() * 5);
	const out: Comment[] = [];
	for (let i = 0; i < n; i++) {
		out.push({
			name: COMMENT_NAMES[Math.floor(r() * COMMENT_NAMES.length)] ?? "anon",
			text: COMMENT_TEXTS[Math.floor(r() * COMMENT_TEXTS.length)] ?? "nice",
			avatar: EMOJIS[Math.floor(r() * EMOJIS.length)] ?? "🙂",
			likes: Math.floor(r() * 900) + 2,
			time: `${1 + Math.floor(r() * 59)}m`,
			liked: false,
		});
	}
	return out;
}

const trim = (x: number) => {
	const s = x.toFixed(1);
	return s.endsWith(".0") ? s.slice(0, -2) : s;
};
const fmt = (n: number): string =>
	n >= 1e6 ? trim(n / 1e6) + "M" : n >= 1e3 ? trim(n / 1e3) + "K" : String(n);

/* ---------- State ---------- */
const feed = document.getElementById("feed") as HTMLElement;

const state = {
	liked: new Set<number>(),
	bookmarked: new Set<number>(),
	followed: new Set<number>(),
	muted: true,
	comments: [] as Comment[][],
};

function captionHTML(caption: string) {
	const esc = caption.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	return esc
		.split(" ")
		.map(w => (w.startsWith("#") ? `<span class="tag">${w}</span>` : w))
		.join(" ");
}

/* ---------- Render feed ---------- */
function render() {
	if (VIDEOS.length === 0) {
		feed.innerHTML = `
		<section class="slide empty">
			<div class="empty-box">
				<h2>No videos yet</h2>
				<p>Open the admin panel to upload your own videos<br>or import a zip.</p>
				<button class="empty-btn" id="emptyAdmin">Open admin</button>
			</div>
		</section>`;
		feed
			.querySelector("#emptyAdmin")!
			.addEventListener("click", () => goAdmin());
		return;
	}
	feed.innerHTML = VIDEOS.map((v, i) => {
		const grad = GRADS[i % GRADS.length];
		const letter = (v.author[1] ?? "?").toUpperCase();
		return `
	<section class="slide" data-i="${i}">
		<video src="${v.srcURL}" ${v.posterURL ? `poster="${v.posterURL}"` : ""} loop muted playsinline
			   preload="${i === 0 ? "auto" : "metadata"}"></video>
		<div class="grad-top"></div>
		<div class="grad-bottom"></div>
		<div class="progress"><div class="bar"></div></div>
		<div class="play-indicator">${ICONS.play}</div>

		<div class="info">
			<span class="author">${v.author}</span>
			<p class="caption">${captionHTML(v.caption)}</p>
			<div class="song">
				${ICONS.music}
				<div class="marquee">
					<div class="marquee-track">
						<span>${v.song}</span><span>${v.song}</span>
					</div>
				</div>
			</div>
		</div>

		<div class="rail">
			<div class="avatar-wrap">
				<div class="avatar" style="background:${grad}">${letter}</div>
				<div class="follow">${ICONS.plus}</div>
			</div>
			<button class="action like">${ICONS.heart}<span>${fmt(v.likes)}</span></button>
			<button class="action comments">${ICONS.comment}<span>${fmt(v.comments)}</span></button>
			<button class="action bookmark">${ICONS.bookmark}<span>${fmt(v.bookmarks)}</span></button>
			<button class="action share">${ICONS.share}<span>${fmt(v.shares)}</span></button>
			${v.posterURL ? `<div class="disc"><img src="${v.posterURL}" alt=""></div>` : ""}
		</div>
	</section>`;
	}).join("");
}

/* ---------- Bottom nav ---------- */
const NAV: [string, IconName | ""][] = [
	["Home", "home"],
	["Discover", "compass"],
	["", "plus-circle"],
	["Inbox", "inbox"],
	["Me", "person"],
];
function renderNav() {
	const nav = document.getElementById("bottomNav")!;
	nav.innerHTML = NAV.map(([label, icon], i) =>
		i === 2
			? `<button class="nav-item nav-add" aria-label="Create">${ICONS["plus-circle"]}</button>`
			: `<button class="nav-item ${i === 0 ? "active" : ""}">${ICONS[icon as IconName]}<span>${label}</span></button>`
	).join("");
}

/* ---------- Playback ---------- */
let current: HTMLElement | null = null;

function playSlide(slide: HTMLElement) {
	if (slide === current) return;
	current?.classList.remove("paused");
	current?.querySelector("video")?.pause();
	current = slide;
	const vid = slide.querySelector("video")!;
	vid.muted = state.muted;
	vid.play().catch(() => {
		vid.muted = true;
		vid.play().catch(() => {});
	});
	slide.classList.remove("paused");
}

const io = new IntersectionObserver(
	entries => {
		for (const e of entries) {
			if (e.isIntersecting && e.intersectionRatio > 0.6) {
				playSlide(e.target as HTMLElement);
			}
		}
	},
	{ root: feed, threshold: [0.6] }
);

/* ---------- Interactions ---------- */
function toggleLike(i: number, force = false) {
	const v = VIDEOS[i];
	const on = state.liked.has(i);
	if (force && on) return; // forced like (double-tap) never un-likes
	const slide = feed.children[i] as HTMLElement | undefined;
	if (!v || !slide) return;
	const btn = slide.querySelector(".action.like")!;
	if (on) {
		state.liked.delete(i);
		btn.classList.remove("on");
	} else {
		state.liked.add(i);
		btn.classList.add("on");
	}
	btn.querySelector("span")!.textContent = fmt(
		v.likes + (state.liked.has(i) ? 1 : 0)
	);
}

function burst(slide: HTMLElement, x: number, y: number) {
	const el = document.createElement("div");
	el.className = "burst";
	el.style.left = x - 48 + "px";
	el.style.top = y - 48 + "px";
	el.innerHTML = ICONS.heart;
	slide.appendChild(el);
	el.addEventListener("animationend", () => el.remove());
}

let scrollStep = 0;
window.addEventListener("resize", () => (scrollStep = 0));

function wireSlides() {
	io.disconnect();
	const slides = [...feed.querySelectorAll<HTMLElement>(".slide")];
	slides.forEach(io.observe.bind(io));

	slides.forEach((slide, i) => {
		const vid = slide.querySelector("video")!;

		vid.addEventListener("timeupdate", () => {
			const bar = slide.querySelector<HTMLElement>(".progress .bar");
			if (bar && vid.duration)
				bar.style.width = (vid.currentTime / vid.duration) * 100 + "%";
		});

		// single tap: play/pause; double tap: like + burst
		let lastTap = 0;
		slide.addEventListener("pointerup", e => {
			const t = e.target as Element;
			if (t.closest(".rail, .info, .sheet, .topbar, .bottomnav")) return;
			const now = Date.now();
			const rect = slide.getBoundingClientRect();
			if (now - lastTap < 300) {
				toggleLike(i, true);
				burst(slide, e.clientX - rect.left, e.clientY - rect.top);
				lastTap = 0;
			} else {
				lastTap = now;
				setTimeout(() => {
					if (lastTap === now) {
						if (vid.paused) {
							vid.play();
							slide.classList.remove("paused");
						} else {
							vid.pause();
							slide.classList.add("paused");
						}
					}
				}, 300);
			}
		});
		slide.addEventListener("contextmenu", e => e.preventDefault());

		slide.querySelector(".follow")!.addEventListener("click", () => {
			const f = slide.querySelector(".follow")!;
			state.followed.has(i) ? state.followed.delete(i) : state.followed.add(i);
			f.classList.toggle("following");
		});

		slide
			.querySelector(".action.like")!
			.addEventListener("click", () => toggleLike(i));

		slide.querySelector(".action.bookmark")!.addEventListener("click", () => {
			const btn = slide.querySelector(".action.bookmark")!;
			state.bookmarked.has(i)
				? state.bookmarked.delete(i)
				: state.bookmarked.add(i);
			btn.classList.toggle("on", state.bookmarked.has(i));
			btn.querySelector("span")!.textContent = fmt(
				(VIDEOS[i]?.bookmarks ?? 0) + (state.bookmarked.has(i) ? 1 : 0)
			);
		});

		slide.querySelector(".action.share")!.addEventListener("click", () => {
			const btn = slide.querySelector(".action.share")!;
			btn.querySelector("span")!.textContent = fmt((VIDEOS[i]?.shares ?? 0) + 1);
			btn.querySelector("svg")!.animate(
				[
					{ transform: "scale(1)" },
					{ transform: "scale(1.3)" },
					{ transform: "scale(1)" },
				],
				{ duration: 300 }
			);
		});

		slide
			.querySelector(".action.comments")!
			.addEventListener("click", () => openSheet(i));
	});

}

function wireGlobal() {
	document.addEventListener("keydown", e => {
		if (!scrollStep) {
			const s = feed.querySelector(".slide");
			scrollStep = s ? s.clientHeight : feed.clientHeight;
		}
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			feed.scrollBy({
				top: e.key === "ArrowDown" ? scrollStep : -scrollStep,
				behavior: "smooth",
			});
		}
	});
}

/* ---------- Comments sheet ---------- */
const sheet = document.getElementById("commentsSheet")!;
const backdrop = document.getElementById("sheetBackdrop")!;
const sheetList = document.getElementById("sheetList")!;
const sheetTitle = document.getElementById("sheetTitle")!;
const commentInput = document.getElementById("commentInput") as HTMLInputElement;
let sheetIndex = 0;

function commentHTML(c: Comment) {
	return `
	<div class="comment">
		<div class="c-avatar">${c.avatar}</div>
		<div class="c-body">
			<div class="c-name">${c.name}</div>
			<div class="c-text">${c.text}</div>
			<div class="c-meta"><span>${c.time}</span><span>Reply</span></div>
		</div>
		<div class="c-like ${c.liked ? "on" : ""}">${ICONS.heart}<span>${fmt(c.likes)}</span></div>
	</div>`;
}

function renderComments() {
	const list = state.comments[sheetIndex] ?? [];
	sheetTitle.textContent = `${fmt(VIDEOS[sheetIndex]?.comments ?? 0)} comments`;
	sheetList.innerHTML = list.length
		? list.map(commentHTML).join("")
		: `<p style="text-align:center;color:rgba(255,255,255,.4);padding:30px 0;font-size:13px">Be the first to comment</p>`;
	sheetList.querySelectorAll(".c-like").forEach((el, i) =>
		el.addEventListener("click", () => toggleCommentLike(i))
	);
}

function toggleCommentLike(i: number) {
	const c = state.comments[sheetIndex]?.[i];
	if (!c) return;
	c.liked = !c.liked;
	c.likes += c.liked ? 1 : -1;
	const el = sheetList.querySelectorAll(".c-like")[i];
	if (el) {
		el.classList.toggle("on", c.liked);
		el.querySelector("span")!.textContent = fmt(c.likes);
	}
}

function openSheet(i: number) {
	sheetIndex = i;
	renderComments();
	sheet.classList.add("open");
	backdrop.classList.add("open");
	sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() {
	sheet.classList.remove("open");
	backdrop.classList.remove("open");
	sheet.setAttribute("aria-hidden", "true");
}

document.getElementById("sheetClose")!.addEventListener("click", closeSheet);
backdrop.addEventListener("click", closeSheet);

function postComment() {
	const text = commentInput.value.trim();
	const list = state.comments[sheetIndex];
	if (!text || !list) return;
	list.unshift({
		name: "you",
		text: text.replace(/</g, "&lt;"),
		avatar: "😎",
		likes: 0,
		time: "now",
		liked: false,
	});
	commentInput.value = "";
	const meta = VIDEOS[sheetIndex];
	if (!meta) return;
	meta.comments++;
	renderComments();
	sheetList.scrollTo({ top: 0, behavior: "smooth" });
	const railCount = feed
		.querySelectorAll<HTMLElement>(".slide")
		[sheetIndex]?.querySelector(".action.comments span");
	if (railCount) railCount.textContent = fmt(meta.comments);
}

commentInput.addEventListener("keydown", e => {
	if (e.key === "Enter") postComment();
});

/* ---------- Top bar ---------- */
const muteBtn = document.getElementById("muteBtn")!;
function renderMute() {
	muteBtn.innerHTML = state.muted ? ICONS.volOff : ICONS.volOn;
}
muteBtn.addEventListener("click", () => {
	state.muted = !state.muted;
	const vid = current?.querySelector("video");
	if (vid) vid.muted = state.muted;
	renderMute();
});

document.querySelectorAll<HTMLElement>("#topTabs .tab").forEach(tab =>
	tab.addEventListener("click", () => {
		document
			.querySelectorAll("#topTabs .tab")
			.forEach(t => t.classList.toggle("active", t === tab));
	})
);

/* ---------- PWA: service worker ---------- */
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () =>
		navigator.serviceWorker.register("sw.js").catch(() => {})
	);
}

/* ---------- Boot ---------- */
async function refreshData() {
	VIDEOS = await getPlayable();
	state.comments = VIDEOS.map((_, i) => makeComments(i));
	state.liked.clear();
	state.bookmarked.clear();
	state.followed.clear();
	current = null;
	render();
	wireSlides();
}

async function boot() {
	await loadIcons();
	renderNav();
	document
		.querySelector("#bottomNav .nav-add")!
		.addEventListener("click", () => goAdmin());
	await refreshData();
	wireGlobal();

	document.getElementById("sendBtn")!.innerHTML = ICONS.send;
	document.getElementById("sendBtn")!.addEventListener("click", postComment);
	document.getElementById("sheetClose")!.innerHTML = ICONS.close;
	document.getElementById("searchBtn")!.innerHTML = ICONS.search;
	renderMute();
}
boot();
