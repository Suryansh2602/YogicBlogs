# Feedback log: `feature/media-images`

Branch 2 of the content phase ([content.md](../content.md)). Admins upload images for article thumbnails, condition pages and (from branch 4) the articles themselves.

## Round 0: what was built

- **Upload (`POST /admin/media/images`)**, behind authenticate → admin role → 2FA, in this order:
  1. a per-admin limit of 60 uploads an hour (fails closed);
  2. a size check from `Content-Length` (413 before a byte of the body is read; the connection is then closed so the body isn't drained);
  3. a disk guard (507 when under `MIN_FREE_DISK_MB`, default 2 GB, is free);
  4. multer into `UPLOAD_DIR/tmp` with a random name (1 file, at most 2 parts, 2 KB of text, `MAX_IMAGE_MB` default 15);
  5. the real type read from the bytes (file-type): JPEG, PNG and WebP only. Anything else gets 415 naming what it really is ("This file is a PDF", "an iPhone HEIC photo");
  6. de-duplication by SHA-256 (the same file again returns the first copy, 200);
  7. sharp, one image at a time (3 may wait, then 503 + Retry-After). The header is checked first: over 10 000 px a side or 40 megapixels gets 422 with the real size. The image is re-encoded to WebP at 480/960/1600 px (never upscaled), rotated upright from the camera's orientation, without EXIF/XMP/GPS, plus a 16 px blurred placeholder;
  8. renditions stored under server-made keys (`images/2026/10/<uuid>-960.webp`), the row created, and the upload audited. The temp file is always removed, and renditions are removed if anything after them fails.
- **Public images (`GET /media/i/:id/:width`):** only stored renditions of public, ready images, otherwise a plain 404.
  - Headers: `immutable` cache for a year, ETag/304, `Cross-Origin-Resource-Policy: same-site` (the site and API are sibling origins), `CSP: default-src 'none'; sandbox`, nosniff.
  - Mounted before the general limiter with its own (1500 / 15 min per IP), because one page loads several images.
- **Library:** list (newest first, paged), alt text edit, and delete.
  - Delete is refused with `409 MEDIA_IN_USE` and the counts while an article cover/audio or condition hero uses the image. Otherwise the row is soft-deleted (kept for the audit trail) and the files are removed.
- **Database:** migration `20261026000100-media-pipeline` adds `status`, `failure_reason`, `placeholder` and `storage_backend` (with CHECKs), a CHECK on `mime_type`, and an index on (checksum, kind). Tested up → down → up.
- **Admin page (Media):**
  - Drag and drop or "Choose images". Each file is checked first, with the server's rules, so a HEIC, a GIF or a 20 MB file is named at once and never sent. Uploads go one at a time, with progress and an "Optimising" step.
  - A grid of cards: the blurred placeholder shows under the real image (`srcset` at all widths), with a "Needs alt text" badge, an alt-text field that saves, and an inline delete confirmation.
- **Dependencies:** `multer` 2.5.0, `file-type` 22.1.1, `sharp` 0.35.5 (exact versions). **multer 2.5.0 is an exception to the two-week age rule:** 2.4.0 has a high-severity advisory (GHSA-q7qp-rjg7-q26m). The 2.5.0 diff was read and is defensive only, and it was published from the expressjs GitHub Actions with a signature. `npm audit`: 0 vulnerabilities.
- **Postman:** "Media (public)" and "Admin · Media" folders (upload, duplicate, list, alt text, delete, a non-image renamed .jpg, a smuggled field, path traversal), plus the `mediaId` variable.

## Errors found while building (each fixed and re-tested)

| Error | Cause | Fix |
|---|---|---|
| A fake huge PNG came back "unreadable" instead of "too large" | sharp enforces its pixel limit while reading the *header*, so it threw before our check could name the size | The header is read without sharp's limit (reading it decodes no pixels); our check names the size, and decoding keeps the hard limit as a second guard. Tested at 50 000², 12 000 × 100 and 9000² (81 MP) |
| A file name with a control character gave a 500 | busboy rejects it ("Malformed part header"), and the error mapping didn't know that message | All of busboy's malformed-input errors now map to `400 UPLOAD_INVALID`; disk errors stay 500 and logged |
| `MAX_IMAGE_MB=2.5` would have crashed the API at startup | multer 2.5 requires whole bytes | Rounded down to whole bytes; caught by a unit test using a 0.01 MB limit |
| The library list order was random for uploads in the same second | `created_at` has 1-second precision | Ties are broken by id (UUIDv7 is time-ordered) |
| The over-size test got ECONNRESET instead of 413 | The server refuses before reading and drops the connection while the client is still sending 16 MB | Kept (it protects the server), made explicit with `Connection: close`. The test now promises 1 GB, sends a few bytes and receives the 413, which proves the body was never read. The admin page checks the size before sending, so browsers get the friendly message first |
| Lint flagged the storage-key pattern as possibly slow (nested repeat) | It was safe (the `/` stops backtracking) but unprovable at a glance | Rewritten as a per-segment check |

## Round 1: Reviewer

Three independent reviewers looked at upload/serving security, backend correctness, and the admin page. A fourth agent tried to refute every finding. **34 findings.** The verifier's verdicts went out of step with the findings for some items (its "why not" reasons described other findings), so every finding was judged again by hand against the code.

**30 were real and are fixed. Each fix has a test, and each test was checked by undoing the fix (17 of 17 caught).**

**Serving images (no account needed)**

| Finding | Change |
|---|---|
| A visitor who abandons a download half way left the file open (`pipe` never closes its source); repeated, this could exhaust the server's file handles | Streamed with `pipeline`, which closes the file on any disconnect. Test: a slow reader leaves after 150 ms, and the file stream is closed |
| Year-long cache headers were set before the file was checked, so a 404 or 500 could be cached for a year | Cache headers are set only once the file is confirmed. Every miss is `no-store`. A file deleted mid-request gives 404, not 500 |
| `If-None-Match` was compared as exact text, so weak or listed ETags never got a 304 | Uses Express's `req.fresh` |
| A cold-cache stampede: 1000 simultaneous first requests each queried MySQL (found by the load test) | Simultaneous lookups share one query. Test: 20 at once → 1 query |

**Uploads (needs a stolen admin session, or plain bad luck)**

| Finding | Change |
|---|---|
| The server's 30 s request timeout broke real 15 MB uploads on connections under 4 Mbit/s, with a "check your internet" message | The timeout is sized to the upload limit (15 MB at 1 Mbit/s = 150 s). Headers are still cut at 15 s and JSON bodies stay capped at 100 kB |
| Upload with no `Content-Length` was read up to the limit before the 413 | `411 LENGTH_REQUIRED` before reading (browsers always send the length). multer's limit remains as the second guard, with its own test |
| No time limit on image decoding, and every rendition decoded the full original again | Decode once into a shrunk in-memory copy, make every size from that, and give every step a 30 s limit (`422 IMAGE_TOO_COMPLEX`) |
| A duplicate upload dropped its alt text and wrote no audit entry | A duplicate fills in missing alt text (never replaces it), and every upload is audited (`deduplicated: true`) |
| Two identical uploads at the same moment could both be stored | The duplicate check runs again inside the one-at-a-time queue. Test: two at once → one row |
| A cancelled upload was logged as a 500 "Unhandled error" | It becomes `400 UPLOAD_ABORTED`, which isn't logged as a server fault. **This fix first had its own bug:** it also checked `req.destroyed`, which Node sets after *any* fully read body, so a malformed upload was mislabelled. The existing test caught it. The check now uses multer's exact messages |
| Temp files and half-written renditions from a crash were never cleaned up | Swept at startup and hourly (only files older than 10 minutes). A failed write removes its own `.part` file |
| Failed file removals were silently ignored | Logged as warnings (the file is an orphan) |
| An animated PNG (an ordinary `.png`) was refused with an ungrammatical message ("a APNG file") | Accepted (its first frame is used). Other types are named as "in X format" |
| The placeholder of a transparent image stayed visible behind it | The placeholder is made solid, and the page removes it once the image has loaded |
| Missing tests: non-public images, audio usage, rollback when saving fails, 503 when busy | Added (the busy test fills the queue for real and checks `Retry-After`) |

**Admin page**

| Finding | Change |
|---|---|
| A file dropped outside the drop area opened in the browser and left the page mid-upload | Drops anywhere on the page are caught, and closing the tab mid-upload asks first |
| A second drop during an upload started a parallel loop and wiped the first batch's progress | One queue: later drops join it |
| Every reload (after an upload or delete) unmounted the cards and lost unsaved alt text | The last loaded page stays on screen while it reloads |
| Deleting the last image on page 2 showed "No images yet" | Steps back to the last real page; the empty message depends on the total |
| Saving alt text overwrote whatever was typed during the save | Only an unchanged field is tidied |
| A delete error appeared as an alt-text field error | Shown next to the delete button |
| Focus fell to the top of the page after Keep or a delete | Back to Delete, or to the result notice |
| Results weren't reliably announced to screen readers | One always-present live region announces each result |
| A batch kept sending after "upload limit reached", "signed out", "busy" or "disk full" | The batch stops, and the rest say "Not sent" and why |
| A connection cut part-way through an upload said "check your internet" | "The upload stopped before it finished…", and a 408 is explained too |
| The 15 MB limit was hard-coded in the page | The list returns the server's real limit and the page uses it |
| The `sizes` hint understated the card width on phones (blurry images) | Matches the layout |
| The upload helper ignored an already-cancelled request and never removed its listener | Fixed (no caller cancels yet) |

**Not changed (1):** browsers that already showed an image may keep it for up to a year after it is deleted. URLs are unguessable and there is no CDN yet; this is written down in content.md, including "purge the CDN on delete" for when one is added.

**Smaller things found by me:** the "not an image" message ended with "SVG and GIF aren't accepted", which was beside the point for a text file. SVGs now get their own explanation (they can carry scripts; export as PNG).

## Round 2: Tester

- **Backend:**
  - 36 real-database tests for media:
    - access;
    - GPS removed from the served bytes;
    - PNG, WebP and APNG accepted;
    - de-duplication, including two identical uploads at once;
    - hostile file names;
    - six disguised or unsupported files (SVG with a script, GIF, PDF, HTML, text);
    - a polyglot JPEG+HTML;
    - a decompression bomb;
    - a 1 GB declared upload refused from its headers;
    - several files, smuggled fields, the wrong field name, a broken body;
    - the 60/hour limit;
    - serving headers, 304 with weak and listed ETags, 404s that are never cached;
    - a burst of 20 cold requests sharing one query;
    - an abandoned download closing its file;
    - list, alt text, delete protection (cover, condition, audio), rollback when saving fails, 503 when the queue is full.
  - 36 unit tests: pipeline, storage keys, queue, upload guards, 411, cancelled uploads, the leftover-file sweep, timeout sizing.
- **Frontend:** 15 page tests (6 original + 9 for the review):
  - list, upload with progress, file checks before sending, the server's reason, alt text, delete;
  - for the review: 401 → refresh → the same file re-sent, an interrupted upload, a batch stopping at the limit, a second drop joining the queue, a drop outside the zone, the server's size limit, unsaved alt text surviving a reload, focus after Keep, an emptied page stepping back.
- **Mutation checks:** every fix from the review was undone one at a time, and a test failed each time (9 backend, 8 frontend).
- **Real browser (Edge), 25/25 steps:**
  - a real photo with camera + GPS data uploaded through the page;
  - a disguised text file refused with the reason;
  - the image displays on the site (cross-origin image allowed);
  - a script on another origin cannot read its bytes;
  - the served bytes contain no camera data;
  - alt text saved.
  - Console messages were only the expected ones: the deliberate 415, and the deliberate cross-origin read.
- **Load:** all 10 scenarios pass.

  | Scenario | Before the fixes | After |
  |---|---|---|
  | Image serving (500 connections) | 230 req/s, p99 3.1 s | 397–644 req/s, p99 1.35–1.6 s |
  | Image flood (1 IP, 1000 connections, from cold) | p99 7.8 s; only 863 of the 1500 allowed got through | p99 2.9 s; exactly 1500 through, 5304 × 429 |

  The first run also failed "flood" and "login flood" (code unchanged by this branch) while the machine had only 844 MB of 10 GB RAM free. They passed in both later runs, and no threshold was loosened.
- **QA:**
  - Backend: 287 tests, 93.2% statements / 85.2% branches (merged), 0 vulnerabilities.
  - Frontend: 171 tests, 90.6% statements / 86.0% branches, bundle within budget, 0 vulnerabilities.
  - One backend QA run failed only because `npm audit` couldn't reach registry.npmjs.org (DNS). A re-run found 0 vulnerabilities.

## Open

- **sharp's 30 s per-step limit is not covered by a test.** Making it fire reliably would need a deliberately slow image, which would make the test flaky on a slow machine. The error mapping is a two-line branch.
- **Duplicate check across several API processes:** two identical uploads arriving at two different processes at the same moment can still both be stored (only harmless duplication). A unique index would close it, once there is more than one process.
