#!/usr/bin/env node

import("../dist/index.cjs").then(({ run }) => {
  process.title = "Cappa";
  run();
});
