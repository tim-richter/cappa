#!/usr/bin/env node

import("../dist/index.js").then(({ run }) => {
  process.title = "Cappa";
  run();
});
