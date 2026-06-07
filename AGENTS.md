# PDF Tools Repository Rules

## Project Philosophy

This is a browser-first PDF utility suite.

Priority order:

1. Correctness
2. Honesty
3. Reliability
4. Performance
5. Features

Never implement fake functionality.

If a feature cannot be implemented correctly with the current stack, provide an explicit unsupported state rather than a misleading success path.

---

## Engineering Standards

* TypeScript strict mode.
* No `any` escape hatches.
* No dead code.
* No unused state.
* No silent failures.
* No fake progress indicators.
* No hidden data loss.

---

## Performance Standards

Avoid:

* main-thread blocking PDF operations
* repeated ArrayBuffer copies
* unnecessary PDF parsing passes
* memory leaks
* stale worker state

Prefer:

* Web Workers for heavy operations
* transferable buffers where possible
* incremental cleanup
* cancellation support

---

## Reliability Standards

All PDF processing features should:

* support repeated runs
* support cancellation
* handle corrupted files safely
* handle unsupported files safely
* clean up resources after completion

Never allow stale worker results to overwrite active jobs.

---

## User Trust Rules

Do not claim support for functionality that is not truly implemented.

Examples:

* visual PDF stamping is not cryptographic signing
* text extraction is not full Word conversion
* unsupported encryption must not appear as working protection

Honest limitations are preferred over misleading success.

---

## Modification Rules

When making changes:

* modify the minimum number of files necessary
* avoid unrelated refactors
* preserve existing architecture when possible
* do not rewrite working code

---

## Reporting Format

After completing work output only:

1. Files changed
2. Exact fixes applied
3. Remaining risks
4. Ready for review: YES/NO

Do not output full files unless explicitly requested.
