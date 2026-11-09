# video-swiper

A TikTok-style vertical video feed PWA. Vanilla TS + CSS, built with Bun.
Users manage their own feed locally: videos and metadata live in the browser
(IndexedDB) and can be exported/imported as a single `.zip`.

## Features

- Vertical snap feed, autoplay on scroll, tap to pause, double-tap to like
- Like / comment / bookmark / share rail, comments sheet
- **Admin panel** (tap the `+` in the bottom nav): add videos with metadata,
  auto-generated poster frames, edit / delete / reorder
- **Export / import** the whole feed as `data.json + videos/*.mp4` zip
- **First run auto-seeds** from the bundled `seed.zip`
- PWA: installable, offline-capable, no server required — `dist/` is a static site

## Commands

- `bun run dev` — dev server with HMR (http://localhost:3000)
- `bun run start` — prod-shaped local server
- `bun run build` — static site into `dist/` (deploy the folder anywhere)
- `bun run seed` — rebuild `seed.zip` from `seed/`

## Repo layout

- `script.ts` — feed UI/playback
- `admin.ts` — admin overlay (add/edit/delete/reorder/export/import)
- `data.ts` — IndexedDB layer + zip import/export (JSZip)
- `index.html`, `style.css` — shell and styles
- `assets/icons/` — UI icons (Phosphor fill/bold)
- `seed.zip` — bundled sample feed, imported automatically on first run
- `seed/videos/`, `seed/meta/`, `seed/source.txt`, `make-seed.ts` — source
  media and the pipeline that produces `seed.zip` (not shipped)
- `server.ts` — dev/start server (not needed for the static build)

## Zip format

```
data.json          # array of video metadata (see VideoMeta in data.ts)
videos/<id>.mp4    # video file per entry (src field)
videos/<id>.jpg    # optional poster (poster field)
```

Importing a zip lets you choose **replace** (wipe local feed) or **merge**
(upsert by id).

## Seed

The seed is made of a handful of actual tiktok videos and their metadata.
