# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

# Video output codec
When writing video files in any project, always use a codec Chromium/VS Code can play:
H.264 for `.mp4` (OpenCV: `cv2.VideoWriter_fourcc(*"avc1")`, check `writer.isOpened()`).
Never use `"mp4v"` (MPEG-4 Part 2) — it produces files that cannot be played inside
VS Code or any Chromium-based viewer. On this machine ffmpeg has no libx264; use
`-c:v h264_mf` for CLI encodes.

# Changing the harness
Make every harness change in `C:/Users/jkind/Documents/04 Personal Coding/Harness_Development/harness`
first, under that repository's task board, and test and commit it there. Then deploy it to the
installed copy with the steps in that repository's `docs/maintenance.md`. Do not edit the
installed copy by hand.
