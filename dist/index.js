/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 469:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(469);
const fs = __nccwpck_require__(147);

try {
  // Get inputs
  const dirPath = core.getInput('path', { required: true });
  const includeHidden = core.getInput('include_hidden') === 'true';
  const excludeInput = core.getInput('exclude');
  const excludeList = excludeInput ? excludeInput.split(',').map((item) => item.trim()) : [];

  // Ensure the directory exists
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  // Get subdirectories
  const subdirectories = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((dirent) => {
      // Only include directories
      if (!dirent.isDirectory()) {
        return false;
      }

      // Filter hidden directories if not included
      if (!includeHidden && dirent.name.startsWith('.')) {
        return false;
      }

      // Filter excluded directories
      if (excludeList.includes(dirent.name)) {
        return false;
      }

      return true;
    })
    .map((dirent) => dirent.name);

  // Set output for GitHub Actions
  const matrixOutput = {
    directory: subdirectories
  };
  core.setOutput('matrix', JSON.stringify(matrixOutput));

  // Log the result
  console.log(`Found subdirectories: ${JSON.stringify(matrixOutput)}`);
} catch (error) {
  core.setFailed(error.message);
}

})();

module.exports = __webpack_exports__;
/******/ })()
;