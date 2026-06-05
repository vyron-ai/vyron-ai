---
name: Video enhancement H.264 compatibility
description: FFmpeg settings required for Android WebView and broad browser compatibility in the enhance endpoint
---

## Rule
The `/api/enhance/video` endpoint must use `-level 4.1` (not 3.0), always add `-vf scale=trunc(iw/2)*2:trunc(ih/2)*2` when no other vf filter is present, and normalise audio to `-ar 44100 -ac 2 -c:a aac`.

**Why:** H.264 Baseline Level 3.0 caps at 720×480@30fps — any HD input gets rejected by Android WebView with MEDIA_ERR_SRC_NOT_SUPPORTED (code 4). Level 4.1 supports 1080p60. Odd pixel dimensions crash yuv420p encoding. Non-stereo/non-44.1kHz AAC causes silent failures on some mobile decoders.

**How to apply:** Any new FFmpeg transcode endpoint targeting in-browser playback should use the same set: `-profile:v baseline -level 4.1 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2` and force even dims via `scale=trunc(iw/2)*2:trunc(ih/2)*2`.
