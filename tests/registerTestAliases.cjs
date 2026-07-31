const Module = require("node:module");
const path = require("node:path");

const compiledSourceRoot = path.resolve(__dirname, "../.test-build/src");
const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveTestAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(compiledSourceRoot, request.slice(2))
    : request;
  return resolveFilename.call(this, resolvedRequest, parent, isMain, options);
};
