/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/typedarray-to-buffer";
exports.ids = ["vendor-chunks/typedarray-to-buffer"];
exports.modules = {

/***/ "(ssr)/../../node_modules/typedarray-to-buffer/index.js":
/*!********************************************************!*\
  !*** ../../node_modules/typedarray-to-buffer/index.js ***!
  \********************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("/**\n * Convert a typed array to a Buffer without a copy\n *\n * Author:   Feross Aboukhadijeh <https://feross.org>\n * License:  MIT\n *\n * `npm install typedarray-to-buffer`\n */\n\nvar isTypedArray = (__webpack_require__(/*! is-typedarray */ \"(ssr)/../../node_modules/is-typedarray/index.js\").strict)\n\nmodule.exports = function typedarrayToBuffer (arr) {\n  if (isTypedArray(arr)) {\n    // To avoid a copy, use the typed array's underlying ArrayBuffer to back new Buffer\n    var buf = Buffer.from(arr.buffer)\n    if (arr.byteLength !== arr.buffer.byteLength) {\n      // Respect the \"view\", i.e. byteOffset and byteLength, without doing a copy\n      buf = buf.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)\n    }\n    return buf\n  } else {\n    // Pass through all other types to `Buffer.from`\n    return Buffer.from(arr)\n  }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzL3R5cGVkYXJyYXktdG8tYnVmZmVyL2luZGV4LmpzIiwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsbUJBQW1CLG9HQUErQjs7QUFFbEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSTtBQUNKO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vQGFyYmltaW5kL3VpLy4uLy4uL25vZGVfbW9kdWxlcy90eXBlZGFycmF5LXRvLWJ1ZmZlci9pbmRleC5qcz9jNmQ1Il0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ29udmVydCBhIHR5cGVkIGFycmF5IHRvIGEgQnVmZmVyIHdpdGhvdXQgYSBjb3B5XG4gKlxuICogQXV0aG9yOiAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGh0dHBzOi8vZmVyb3NzLm9yZz5cbiAqIExpY2Vuc2U6ICBNSVRcbiAqXG4gKiBgbnBtIGluc3RhbGwgdHlwZWRhcnJheS10by1idWZmZXJgXG4gKi9cblxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJ2lzLXR5cGVkYXJyYXknKS5zdHJpY3RcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB0eXBlZGFycmF5VG9CdWZmZXIgKGFycikge1xuICBpZiAoaXNUeXBlZEFycmF5KGFycikpIHtcbiAgICAvLyBUbyBhdm9pZCBhIGNvcHksIHVzZSB0aGUgdHlwZWQgYXJyYXkncyB1bmRlcmx5aW5nIEFycmF5QnVmZmVyIHRvIGJhY2sgbmV3IEJ1ZmZlclxuICAgIHZhciBidWYgPSBCdWZmZXIuZnJvbShhcnIuYnVmZmVyKVxuICAgIGlmIChhcnIuYnl0ZUxlbmd0aCAhPT0gYXJyLmJ1ZmZlci5ieXRlTGVuZ3RoKSB7XG4gICAgICAvLyBSZXNwZWN0IHRoZSBcInZpZXdcIiwgaS5lLiBieXRlT2Zmc2V0IGFuZCBieXRlTGVuZ3RoLCB3aXRob3V0IGRvaW5nIGEgY29weVxuICAgICAgYnVmID0gYnVmLnNsaWNlKGFyci5ieXRlT2Zmc2V0LCBhcnIuYnl0ZU9mZnNldCArIGFyci5ieXRlTGVuZ3RoKVxuICAgIH1cbiAgICByZXR1cm4gYnVmXG4gIH0gZWxzZSB7XG4gICAgLy8gUGFzcyB0aHJvdWdoIGFsbCBvdGhlciB0eXBlcyB0byBgQnVmZmVyLmZyb21gXG4gICAgcmV0dXJuIEJ1ZmZlci5mcm9tKGFycilcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/typedarray-to-buffer/index.js\n");

/***/ })

};
;