---
name: Video thumbnail fallback pattern
description: How thumbnail fallback works in the AI Video Enhancement page when video playback fails
---

## Rule
Thumbnails are extracted **on-demand, only after a video error fires** — not proactively on upload. The video blob is stored in state (`origBlob` / `enhBlob`) when the preview/enhance XHR completes. When `onVideoError` fires, the async handler sends that blob to `POST /api/thumbnail/video` and stores the resulting JPEG object URL in `origThumbUrl` / `enhThumbUrl`.

**Why:** Extracting thumbnails upfront would double the server work for every upload, even when the video plays fine. On-demand extraction is only needed when the browser rejects the codec, which is the minority case.

**How to apply:** VideoCard receives `thumbUrl` and `thumbLoading` props. When `hasError && thumbUrl` it shows the JPEG; when `hasError && thumbLoading` it shows a spinner; when `hasError` only it shows the text fallback. Always revoke thumbnail object URLs in `resetFile()` alongside video URLs.
