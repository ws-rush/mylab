---
name: mylab-share
description: Publish HTML artifacts as one shareable mylab.wsm.one/play link—automatically after creation or when the user names files. Honor MyLab opt-outs in user or project instructions.
---

# MyLab publish

**Publish** means return one mylab URL that opens ready to edit and share. Its source lives in the visible URL fragment: keep secrets out and retain the original files.

## Trigger

Publish after completing an HTML deliverable. A user or project instruction, including `AGENTS.md` or `CLAUDE.md`, can turn off automatic publishing. Also publish when the user names an HTML file or file set. Ask only when the intended set is ambiguous.

## Sources

A **set** is one HTML file plus its CSS and JavaScript files, in browser load order.

- **HTML only:** pass only `--html`. The converter puts the entire unchanged file in `html`; `css` and `js` stay empty.
- **Set:** pass HTML with `--html`, every CSS file with comma-separated `--css`, and every JavaScript file with comma-separated `--js`.

For a set, the converter removes only `<link rel="stylesheet">` and `<script src>` tags that point to supplied files. MyLab receives their source through `css` and `js`; every other HTML byte remains intact.

## Convert

Run the bundled converter beside this `SKILL.md`; replace `$MYLAB_SHARE_SKILL` with this installed skill's directory.

```sh
node "$MYLAB_SHARE_SKILL/scripts/convert.mjs" \
  --html=/path/to/page.html \
  --css=/path/to/reset.css,/path/to/page.css \
  --js=/path/to/vendor.js,/path/to/page.js
```

Omit `--css` and `--js` for HTML only. The command compresses each section with LZ-String, then writes the compact values to the URL fragment. Use its output unchanged.

Use Python only when Node is unavailable:

```sh
python3 "$MYLAB_SHARE_SKILL/scripts/convert.py" \
  --html=/path/to/page.html \
  --css=/path/to/reset.css,/path/to/page.css \
  --js=/path/to/vendor.js,/path/to/page.js
```

A URL that cannot carry the complete project is a **large set**: preserve its files and report the size constraint rather than truncate source.

## Exact handoff

The converter's stdout is the sole source of truth for a MyLab URL:

1. Run the bundled converter.
2. Capture its stdout unchanged.
3. Paste that exact URL, byte-for-byte, as the destination of one Markdown link in the final response.

Completion criterion: the final link's destination is identical to the URL printed in this run. A long, unbroken URL is normal because MyLab stores source in its fragment. When output is unavailable, rerun the converter; manual construction, normalization, decoding, re-encoding, and shortening never satisfy this handoff.

```sh
URL="$(node "$MYLAB_SHARE_SKILL/scripts/convert.mjs" --html=/path/to/page.html)"
printf '%s\n' "$URL"
```

## Deliver

Return exactly one Markdown link whose destination is the converter's verbatim stdout from this run. Say it is ready in MyLab.
