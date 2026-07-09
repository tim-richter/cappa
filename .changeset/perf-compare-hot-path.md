---
"@cappa/core": patch
---

perf(core): eliminate redundant PNG decodes and temp-file round-trips in image comparison

- Pass expected-image file path directly to the native comparator instead of reading into a Buffer and writing back to a temp file
- Replace full sharp decode for PNG validation with an 8-byte signature check
- Extract image dimensions from the 24-byte IHDR header instead of a full sharp decode
- Inject diff metadata directly into the PNG buffer instead of decode/set/re-encode
