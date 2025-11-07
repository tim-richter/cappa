---
"@cappa/logger": patch
---

Store the logger instance on the global scope so it can be reused across packages, preventing "Logger not initialized" errors when plugins use the logger.
