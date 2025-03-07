/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./node_modules/electron-squirrel-startup/index.js":
/*!*********************************************************!*\
  !*** ./node_modules/electron-squirrel-startup/index.js ***!
  \*********************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("var path = __webpack_require__(/*! path */ \"path\");\nvar spawn = (__webpack_require__(/*! child_process */ \"child_process\").spawn);\nvar debug = __webpack_require__(/*! debug */ \"./node_modules/electron-squirrel-startup/node_modules/debug/src/index.js\")('electron-squirrel-startup');\nvar app = (__webpack_require__(/*! electron */ \"electron\").app);\n\nvar run = function(args, done) {\n  var updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');\n  debug('Spawning `%s` with args `%s`', updateExe, args);\n  spawn(updateExe, args, {\n    detached: true\n  }).on('close', done);\n};\n\nvar check = function() {\n  if (process.platform === 'win32') {\n    var cmd = process.argv[1];\n    debug('processing squirrel command `%s`', cmd);\n    var target = path.basename(process.execPath);\n\n    if (cmd === '--squirrel-install' || cmd === '--squirrel-updated') {\n      run(['--createShortcut=' + target + ''], app.quit);\n      return true;\n    }\n    if (cmd === '--squirrel-uninstall') {\n      run(['--removeShortcut=' + target + ''], app.quit);\n      return true;\n    }\n    if (cmd === '--squirrel-obsolete') {\n      app.quit();\n      return true;\n    }\n  }\n  return false;\n};\n\nmodule.exports = check();\n\n\n//# sourceURL=webpack://nash/./node_modules/electron-squirrel-startup/index.js?");

/***/ }),

/***/ "./node_modules/electron-squirrel-startup/node_modules/debug/src/browser.js":
/*!**********************************************************************************!*\
  !*** ./node_modules/electron-squirrel-startup/node_modules/debug/src/browser.js ***!
  \**********************************************************************************/
/***/ ((module, exports, __webpack_require__) => {

eval("/**\n * This is the web browser implementation of `debug()`.\n *\n * Expose `debug()` as the module.\n */\n\nexports = module.exports = __webpack_require__(/*! ./debug */ \"./node_modules/electron-squirrel-startup/node_modules/debug/src/debug.js\");\nexports.log = log;\nexports.formatArgs = formatArgs;\nexports.save = save;\nexports.load = load;\nexports.useColors = useColors;\nexports.storage = 'undefined' != typeof chrome\n               && 'undefined' != typeof chrome.storage\n                  ? chrome.storage.local\n                  : localstorage();\n\n/**\n * Colors.\n */\n\nexports.colors = [\n  'lightseagreen',\n  'forestgreen',\n  'goldenrod',\n  'dodgerblue',\n  'darkorchid',\n  'crimson'\n];\n\n/**\n * Currently only WebKit-based Web Inspectors, Firefox >= v31,\n * and the Firebug extension (any Firefox version) are known\n * to support \"%c\" CSS customizations.\n *\n * TODO: add a `localStorage` variable to explicitly enable/disable colors\n */\n\nfunction useColors() {\n  // NB: In an Electron preload script, document will be defined but not fully\n  // initialized. Since we know we're in Chrome, we'll just detect this case\n  // explicitly\n  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {\n    return true;\n  }\n\n  // is webkit? http://stackoverflow.com/a/16459606/376773\n  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632\n  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||\n    // is firebug? http://stackoverflow.com/a/398120/376773\n    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||\n    // is firefox >= v31?\n    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages\n    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\\/(\\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||\n    // double check webkit in userAgent just in case we are in a worker\n    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\\/(\\d+)/));\n}\n\n/**\n * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.\n */\n\nexports.formatters.j = function(v) {\n  try {\n    return JSON.stringify(v);\n  } catch (err) {\n    return '[UnexpectedJSONParseError]: ' + err.message;\n  }\n};\n\n\n/**\n * Colorize log arguments if enabled.\n *\n * @api public\n */\n\nfunction formatArgs(args) {\n  var useColors = this.useColors;\n\n  args[0] = (useColors ? '%c' : '')\n    + this.namespace\n    + (useColors ? ' %c' : ' ')\n    + args[0]\n    + (useColors ? '%c ' : ' ')\n    + '+' + exports.humanize(this.diff);\n\n  if (!useColors) return;\n\n  var c = 'color: ' + this.color;\n  args.splice(1, 0, c, 'color: inherit')\n\n  // the final \"%c\" is somewhat tricky, because there could be other\n  // arguments passed either before or after the %c, so we need to\n  // figure out the correct index to insert the CSS into\n  var index = 0;\n  var lastC = 0;\n  args[0].replace(/%[a-zA-Z%]/g, function(match) {\n    if ('%%' === match) return;\n    index++;\n    if ('%c' === match) {\n      // we only are interested in the *last* %c\n      // (the user may have provided their own)\n      lastC = index;\n    }\n  });\n\n  args.splice(lastC, 0, c);\n}\n\n/**\n * Invokes `console.log()` when available.\n * No-op when `console.log` is not a \"function\".\n *\n * @api public\n */\n\nfunction log() {\n  // this hackery is required for IE8/9, where\n  // the `console.log` function doesn't have 'apply'\n  return 'object' === typeof console\n    && console.log\n    && Function.prototype.apply.call(console.log, console, arguments);\n}\n\n/**\n * Save `namespaces`.\n *\n * @param {String} namespaces\n * @api private\n */\n\nfunction save(namespaces) {\n  try {\n    if (null == namespaces) {\n      exports.storage.removeItem('debug');\n    } else {\n      exports.storage.debug = namespaces;\n    }\n  } catch(e) {}\n}\n\n/**\n * Load `namespaces`.\n *\n * @return {String} returns the previously persisted debug modes\n * @api private\n */\n\nfunction load() {\n  var r;\n  try {\n    r = exports.storage.debug;\n  } catch(e) {}\n\n  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG\n  if (!r && typeof process !== 'undefined' && 'env' in process) {\n    r = process.env.DEBUG;\n  }\n\n  return r;\n}\n\n/**\n * Enable namespaces listed in `localStorage.debug` initially.\n */\n\nexports.enable(load());\n\n/**\n * Localstorage attempts to return the localstorage.\n *\n * This is necessary because safari throws\n * when a user disables cookies/localstorage\n * and you attempt to access it.\n *\n * @return {LocalStorage}\n * @api private\n */\n\nfunction localstorage() {\n  try {\n    return window.localStorage;\n  } catch (e) {}\n}\n\n\n//# sourceURL=webpack://nash/./node_modules/electron-squirrel-startup/node_modules/debug/src/browser.js?");

/***/ }),

/***/ "./node_modules/electron-squirrel-startup/node_modules/debug/src/debug.js":
/*!********************************************************************************!*\
  !*** ./node_modules/electron-squirrel-startup/node_modules/debug/src/debug.js ***!
  \********************************************************************************/
/***/ ((module, exports, __webpack_require__) => {

eval("\n/**\n * This is the common logic for both the Node.js and web browser\n * implementations of `debug()`.\n *\n * Expose `debug()` as the module.\n */\n\nexports = module.exports = createDebug.debug = createDebug['default'] = createDebug;\nexports.coerce = coerce;\nexports.disable = disable;\nexports.enable = enable;\nexports.enabled = enabled;\nexports.humanize = __webpack_require__(/*! ms */ \"./node_modules/electron-squirrel-startup/node_modules/ms/index.js\");\n\n/**\n * The currently active debug mode names, and names to skip.\n */\n\nexports.names = [];\nexports.skips = [];\n\n/**\n * Map of special \"%n\" handling functions, for the debug \"format\" argument.\n *\n * Valid key names are a single, lower or upper-case letter, i.e. \"n\" and \"N\".\n */\n\nexports.formatters = {};\n\n/**\n * Previous log timestamp.\n */\n\nvar prevTime;\n\n/**\n * Select a color.\n * @param {String} namespace\n * @return {Number}\n * @api private\n */\n\nfunction selectColor(namespace) {\n  var hash = 0, i;\n\n  for (i in namespace) {\n    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);\n    hash |= 0; // Convert to 32bit integer\n  }\n\n  return exports.colors[Math.abs(hash) % exports.colors.length];\n}\n\n/**\n * Create a debugger with the given `namespace`.\n *\n * @param {String} namespace\n * @return {Function}\n * @api public\n */\n\nfunction createDebug(namespace) {\n\n  function debug() {\n    // disabled?\n    if (!debug.enabled) return;\n\n    var self = debug;\n\n    // set `diff` timestamp\n    var curr = +new Date();\n    var ms = curr - (prevTime || curr);\n    self.diff = ms;\n    self.prev = prevTime;\n    self.curr = curr;\n    prevTime = curr;\n\n    // turn the `arguments` into a proper Array\n    var args = new Array(arguments.length);\n    for (var i = 0; i < args.length; i++) {\n      args[i] = arguments[i];\n    }\n\n    args[0] = exports.coerce(args[0]);\n\n    if ('string' !== typeof args[0]) {\n      // anything else let's inspect with %O\n      args.unshift('%O');\n    }\n\n    // apply any `formatters` transformations\n    var index = 0;\n    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {\n      // if we encounter an escaped % then don't increase the array index\n      if (match === '%%') return match;\n      index++;\n      var formatter = exports.formatters[format];\n      if ('function' === typeof formatter) {\n        var val = args[index];\n        match = formatter.call(self, val);\n\n        // now we need to remove `args[index]` since it's inlined in the `format`\n        args.splice(index, 1);\n        index--;\n      }\n      return match;\n    });\n\n    // apply env-specific formatting (colors, etc.)\n    exports.formatArgs.call(self, args);\n\n    var logFn = debug.log || exports.log || console.log.bind(console);\n    logFn.apply(self, args);\n  }\n\n  debug.namespace = namespace;\n  debug.enabled = exports.enabled(namespace);\n  debug.useColors = exports.useColors();\n  debug.color = selectColor(namespace);\n\n  // env-specific initialization logic for debug instances\n  if ('function' === typeof exports.init) {\n    exports.init(debug);\n  }\n\n  return debug;\n}\n\n/**\n * Enables a debug mode by namespaces. This can include modes\n * separated by a colon and wildcards.\n *\n * @param {String} namespaces\n * @api public\n */\n\nfunction enable(namespaces) {\n  exports.save(namespaces);\n\n  exports.names = [];\n  exports.skips = [];\n\n  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\\s,]+/);\n  var len = split.length;\n\n  for (var i = 0; i < len; i++) {\n    if (!split[i]) continue; // ignore empty strings\n    namespaces = split[i].replace(/\\*/g, '.*?');\n    if (namespaces[0] === '-') {\n      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));\n    } else {\n      exports.names.push(new RegExp('^' + namespaces + '$'));\n    }\n  }\n}\n\n/**\n * Disable debug output.\n *\n * @api public\n */\n\nfunction disable() {\n  exports.enable('');\n}\n\n/**\n * Returns true if the given mode name is enabled, false otherwise.\n *\n * @param {String} name\n * @return {Boolean}\n * @api public\n */\n\nfunction enabled(name) {\n  var i, len;\n  for (i = 0, len = exports.skips.length; i < len; i++) {\n    if (exports.skips[i].test(name)) {\n      return false;\n    }\n  }\n  for (i = 0, len = exports.names.length; i < len; i++) {\n    if (exports.names[i].test(name)) {\n      return true;\n    }\n  }\n  return false;\n}\n\n/**\n * Coerce `val`.\n *\n * @param {Mixed} val\n * @return {Mixed}\n * @api private\n */\n\nfunction coerce(val) {\n  if (val instanceof Error) return val.stack || val.message;\n  return val;\n}\n\n\n//# sourceURL=webpack://nash/./node_modules/electron-squirrel-startup/node_modules/debug/src/debug.js?");

/***/ }),

/***/ "./node_modules/electron-squirrel-startup/node_modules/debug/src/index.js":
/*!********************************************************************************!*\
  !*** ./node_modules/electron-squirrel-startup/node_modules/debug/src/index.js ***!
  \********************************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("/**\n * Detect Electron renderer process, which is node, but we should\n * treat as a browser.\n */\n\nif (typeof process !== 'undefined' && process.type === 'renderer') {\n  module.exports = __webpack_require__(/*! ./browser.js */ \"./node_modules/electron-squirrel-startup/node_modules/debug/src/browser.js\");\n} else {\n  module.exports = __webpack_require__(/*! ./node.js */ \"./node_modules/electron-squirrel-startup/node_modules/debug/src/node.js\");\n}\n\n\n//# sourceURL=webpack://nash/./node_modules/electron-squirrel-startup/node_modules/debug/src/index.js?");

/***/ }),

/***/ "./node_modules/electron-squirrel-startup/node_modules/debug/src/node.js":
/*!*******************************************************************************!*\
  !*** ./node_modules/electron-squirrel-startup/node_modules/debug/src/node.js ***!
  \*******************************************************************************/
/***/ ((module, exports, __webpack_require__) => {

eval("/**\n * Module dependencies.\n */\n\nvar tty = __webpack_require__(/*! tty */ \"tty\");\nvar util = __webpack_require__(/*! util */ \"util\");\n\n/**\n * This is the Node.js implementation of `debug()`.\n *\n * Expose `debug()` as the module.\n */\n\nexports = module.exports = __webpack_require__(/*! ./debug */ \"./node_modules/electron-squirrel-startup/node_modules/debug/src/debug.js\");\nexports.init = init;\nexports.log = log;\nexports.formatArgs = formatArgs;\nexports.save = save;\nexports.load = load;\nexports.useColors = useColors;\n\n/**\n * Colors.\n */\n\nexports.colors = [6, 2, 3, 4, 5, 1];\n\n/**\n * Build up the default `inspectOpts` object from the environment variables.\n *\n *   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js\n */\n\nexports.inspectOpts = Object.keys(process.env).filter(function (key) {\n  return /^debug_/i.test(key);\n}).reduce(function (obj, key) {\n  // camel-case\n  var prop = key\n    .substring(6)\n    .toLowerCase()\n    .replace(/_([a-z])/g, function (_, k) { return k.toUpperCase() });\n\n  // coerce string value into JS value\n  var val = process.env[key];\n  if (/^(yes|on|true|enabled)$/i.test(val)) val = true;\n  else if (/^(no|off|false|disabled)$/i.test(val)) val = false;\n  else if (val === 'null') val = null;\n  else val = Number(val);\n\n  obj[prop] = val;\n  return obj;\n}, {});\n\n/**\n * The file descriptor to write the `debug()` calls to.\n * Set the `DEBUG_FD` env variable to override with another value. i.e.:\n *\n *   $ DEBUG_FD=3 node script.js 3>debug.log\n */\n\nvar fd = parseInt(process.env.DEBUG_FD, 10) || 2;\n\nif (1 !== fd && 2 !== fd) {\n  util.deprecate(function(){}, 'except for stderr(2) and stdout(1), any other usage of DEBUG_FD is deprecated. Override debug.log if you want to use a different log function (https://git.io/debug_fd)')()\n}\n\nvar stream = 1 === fd ? process.stdout :\n             2 === fd ? process.stderr :\n             createWritableStdioStream(fd);\n\n/**\n * Is stdout a TTY? Colored output is enabled when `true`.\n */\n\nfunction useColors() {\n  return 'colors' in exports.inspectOpts\n    ? Boolean(exports.inspectOpts.colors)\n    : tty.isatty(fd);\n}\n\n/**\n * Map %o to `util.inspect()`, all on a single line.\n */\n\nexports.formatters.o = function(v) {\n  this.inspectOpts.colors = this.useColors;\n  return util.inspect(v, this.inspectOpts)\n    .split('\\n').map(function(str) {\n      return str.trim()\n    }).join(' ');\n};\n\n/**\n * Map %o to `util.inspect()`, allowing multiple lines if needed.\n */\n\nexports.formatters.O = function(v) {\n  this.inspectOpts.colors = this.useColors;\n  return util.inspect(v, this.inspectOpts);\n};\n\n/**\n * Adds ANSI color escape codes if enabled.\n *\n * @api public\n */\n\nfunction formatArgs(args) {\n  var name = this.namespace;\n  var useColors = this.useColors;\n\n  if (useColors) {\n    var c = this.color;\n    var prefix = '  \\u001b[3' + c + ';1m' + name + ' ' + '\\u001b[0m';\n\n    args[0] = prefix + args[0].split('\\n').join('\\n' + prefix);\n    args.push('\\u001b[3' + c + 'm+' + exports.humanize(this.diff) + '\\u001b[0m');\n  } else {\n    args[0] = new Date().toUTCString()\n      + ' ' + name + ' ' + args[0];\n  }\n}\n\n/**\n * Invokes `util.format()` with the specified arguments and writes to `stream`.\n */\n\nfunction log() {\n  return stream.write(util.format.apply(util, arguments) + '\\n');\n}\n\n/**\n * Save `namespaces`.\n *\n * @param {String} namespaces\n * @api private\n */\n\nfunction save(namespaces) {\n  if (null == namespaces) {\n    // If you set a process.env field to null or undefined, it gets cast to the\n    // string 'null' or 'undefined'. Just delete instead.\n    delete process.env.DEBUG;\n  } else {\n    process.env.DEBUG = namespaces;\n  }\n}\n\n/**\n * Load `namespaces`.\n *\n * @return {String} returns the previously persisted debug modes\n * @api private\n */\n\nfunction load() {\n  return process.env.DEBUG;\n}\n\n/**\n * Copied from `node/src/node.js`.\n *\n * XXX: It's lame that node doesn't expose this API out-of-the-box. It also\n * relies on the undocumented `tty_wrap.guessHandleType()` which is also lame.\n */\n\nfunction createWritableStdioStream (fd) {\n  var stream;\n  var tty_wrap = process.binding('tty_wrap');\n\n  // Note stream._type is used for test-module-load-list.js\n\n  switch (tty_wrap.guessHandleType(fd)) {\n    case 'TTY':\n      stream = new tty.WriteStream(fd);\n      stream._type = 'tty';\n\n      // Hack to have stream not keep the event loop alive.\n      // See https://github.com/joyent/node/issues/1726\n      if (stream._handle && stream._handle.unref) {\n        stream._handle.unref();\n      }\n      break;\n\n    case 'FILE':\n      var fs = __webpack_require__(/*! fs */ \"fs\");\n      stream = new fs.SyncWriteStream(fd, { autoClose: false });\n      stream._type = 'fs';\n      break;\n\n    case 'PIPE':\n    case 'TCP':\n      var net = __webpack_require__(/*! net */ \"net\");\n      stream = new net.Socket({\n        fd: fd,\n        readable: false,\n        writable: true\n      });\n\n      // FIXME Should probably have an option in net.Socket to create a\n      // stream from an existing fd which is writable only. But for now\n      // we'll just add this hack and set the `readable` member to false.\n      // Test: ./node test/fixtures/echo.js < /etc/passwd\n      stream.readable = false;\n      stream.read = null;\n      stream._type = 'pipe';\n\n      // FIXME Hack to have stream not keep the event loop alive.\n      // See https://github.com/joyent/node/issues/1726\n      if (stream._handle && stream._handle.unref) {\n        stream._handle.unref();\n      }\n      break;\n\n    default:\n      // Probably an error on in uv_guess_handle()\n      throw new Error('Implement me. Unknown stream file type!');\n  }\n\n  // For supporting legacy API we put the FD here.\n  stream.fd = fd;\n\n  stream._isStdio = true;\n\n  return stream;\n}\n\n/**\n * Init logic for `debug` instances.\n *\n * Create a new `inspectOpts` object in case `useColors` is set\n * differently for a particular `debug` instance.\n */\n\nfunction init (debug) {\n  debug.inspectOpts = {};\n\n  var keys = Object.keys(exports.inspectOpts);\n  for (var i = 0; i < keys.length; i++) {\n    debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];\n  }\n}\n\n/**\n * Enable namespaces listed in `process.env.DEBUG` initially.\n */\n\nexports.enable(load());\n\n\n//# sourceURL=webpack://nash/./node_modules/electron-squirrel-startup/node_modules/debug/src/node.js?");

/***/ }),

/***/ "./node_modules/electron-squirrel-startup/node_modules/ms/index.js":
/*!*************************************************************************!*\
  !*** ./node_modules/electron-squirrel-startup/node_modules/ms/index.js ***!
  \*************************************************************************/
/***/ ((module) => {

eval("/**\n * Helpers.\n */\n\nvar s = 1000;\nvar m = s * 60;\nvar h = m * 60;\nvar d = h * 24;\nvar y = d * 365.25;\n\n/**\n * Parse or format the given `val`.\n *\n * Options:\n *\n *  - `long` verbose formatting [false]\n *\n * @param {String|Number} val\n * @param {Object} [options]\n * @throws {Error} throw an error if val is not a non-empty string or a number\n * @return {String|Number}\n * @api public\n */\n\nmodule.exports = function(val, options) {\n  options = options || {};\n  var type = typeof val;\n  if (type === 'string' && val.length > 0) {\n    return parse(val);\n  } else if (type === 'number' && isNaN(val) === false) {\n    return options.long ? fmtLong(val) : fmtShort(val);\n  }\n  throw new Error(\n    'val is not a non-empty string or a valid number. val=' +\n      JSON.stringify(val)\n  );\n};\n\n/**\n * Parse the given `str` and return milliseconds.\n *\n * @param {String} str\n * @return {Number}\n * @api private\n */\n\nfunction parse(str) {\n  str = String(str);\n  if (str.length > 100) {\n    return;\n  }\n  var match = /^((?:\\d+)?\\.?\\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(\n    str\n  );\n  if (!match) {\n    return;\n  }\n  var n = parseFloat(match[1]);\n  var type = (match[2] || 'ms').toLowerCase();\n  switch (type) {\n    case 'years':\n    case 'year':\n    case 'yrs':\n    case 'yr':\n    case 'y':\n      return n * y;\n    case 'days':\n    case 'day':\n    case 'd':\n      return n * d;\n    case 'hours':\n    case 'hour':\n    case 'hrs':\n    case 'hr':\n    case 'h':\n      return n * h;\n    case 'minutes':\n    case 'minute':\n    case 'mins':\n    case 'min':\n    case 'm':\n      return n * m;\n    case 'seconds':\n    case 'second':\n    case 'secs':\n    case 'sec':\n    case 's':\n      return n * s;\n    case 'milliseconds':\n    case 'millisecond':\n    case 'msecs':\n    case 'msec':\n    case 'ms':\n      return n;\n    default:\n      return undefined;\n  }\n}\n\n/**\n * Short format for `ms`.\n *\n * @param {Number} ms\n * @return {String}\n * @api private\n */\n\nfunction fmtShort(ms) {\n  if (ms >= d) {\n    return Math.round(ms / d) + 'd';\n  }\n  if (ms >= h) {\n    return Math.round(ms / h) + 'h';\n  }\n  if (ms >= m) {\n    return Math.round(ms / m) + 'm';\n  }\n  if (ms >= s) {\n    return Math.round(ms / s) + 's';\n  }\n  return ms + 'ms';\n}\n\n/**\n * Long format for `ms`.\n *\n * @param {Number} ms\n * @return {String}\n * @api private\n */\n\nfunction fmtLong(ms) {\n  return plural(ms, d, 'day') ||\n    plural(ms, h, 'hour') ||\n    plural(ms, m, 'minute') ||\n    plural(ms, s, 'second') ||\n    ms + ' ms';\n}\n\n/**\n * Pluralization helper.\n */\n\nfunction plural(ms, n, name) {\n  if (ms < n) {\n    return;\n  }\n  if (ms < n * 1.5) {\n    return Math.floor(ms / n) + ' ' + name;\n  }\n  return Math.ceil(ms / n) + ' ' + name + 's';\n}\n\n\n//# sourceURL=webpack://nash/./node_modules/electron-squirrel-startup/node_modules/ms/index.js?");

/***/ }),

/***/ "./public/icon.png":
/*!*************************!*\
  !*** ./public/icon.png ***!
  \*************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
eval("module.exports = __webpack_require__.p + \"icon.png\";\n\n//# sourceURL=webpack://nash/./public/icon.png?");

/***/ }),

/***/ "./src/config.ts":
/*!***********************!*\
  !*** ./src/config.ts ***!
  \***********************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
eval("\nvar __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { \"default\": mod };\n};\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.writeConfig = exports.readConfig = exports.getConfigPath = void 0;\nconst node_fs_1 = __importDefault(__webpack_require__(/*! node:fs */ \"node:fs\"));\nconst node_os_1 = __importDefault(__webpack_require__(/*! node:os */ \"node:os\"));\nconst node_path_1 = __importDefault(__webpack_require__(/*! node:path */ \"node:path\"));\n// Initialize platform-specific paths\nconst homeDir = node_os_1.default.homedir();\nconst platformPaths = {\n    win32: {\n        baseDir: process.env.APPDATA || node_path_1.default.join(homeDir, \"AppData\", \"Roaming\"),\n        vscodePath: node_path_1.default.join(\"Code\", \"User\", \"globalStorage\"),\n    },\n    darwin: {\n        baseDir: node_path_1.default.join(homeDir, \"Library\", \"Application Support\"),\n        vscodePath: node_path_1.default.join(\"Code\", \"User\", \"globalStorage\"),\n    },\n    linux: {\n        baseDir: process.env.XDG_CONFIG_HOME || node_path_1.default.join(homeDir, \".config\"),\n        vscodePath: node_path_1.default.join(\"Code/User/globalStorage\"),\n    },\n};\nconst platform = process.platform;\nconst { baseDir, vscodePath } = platformPaths[platform];\n// Define client paths using the platform-specific base directories\nconst clientPaths = {\n    claude: node_path_1.default.join(baseDir, \"Claude\", \"claude_desktop_config.json\"),\n    cline: node_path_1.default.join(baseDir, vscodePath, \"saoudrizwan.claude-dev\", \"settings\", \"cline_mcp_settings.json\"),\n    \"roo-cline\": node_path_1.default.join(baseDir, vscodePath, \"rooveterinaryinc.roo-cline\", \"settings\", \"cline_mcp_settings.json\"),\n    windsurf: node_path_1.default.join(homeDir, \".codeium\", \"windsurf\", \"mcp_config.json\"),\n    witsy: node_path_1.default.join(baseDir, \"Witsy\", \"settings.json\"),\n    enconvo: node_path_1.default.join(homeDir, \".config\", \"enconvo\", \"mcp_config.json\"),\n};\nfunction getConfigPath(client) {\n    const normalizedClient = (client === null || client === void 0 ? void 0 : client.toLowerCase()) || \"claude\";\n    console.log(`Getting config path for client: ${normalizedClient}`);\n    const configPath = clientPaths[normalizedClient] ||\n        node_path_1.default.join(node_path_1.default.dirname(clientPaths.claude), \"..\", client || \"claude\", `${normalizedClient}_config.json`);\n    console.log(`Config path resolved to: ${configPath}`);\n    return configPath;\n}\nexports.getConfigPath = getConfigPath;\nfunction readConfig(client) {\n    console.log(`Reading config for client: ${client}`);\n    try {\n        const configPath = getConfigPath(client);\n        console.log(`Checking if config file exists at: ${configPath}`);\n        if (!node_fs_1.default.existsSync(configPath)) {\n            console.log(`Config file not found, returning default empty config`);\n            return { mcpServers: {} };\n        }\n        console.log(`Reading config file content`);\n        const rawConfig = JSON.parse(node_fs_1.default.readFileSync(configPath, \"utf8\"));\n        console.log(`Config loaded successfully: ${JSON.stringify(rawConfig, null, 2)}`);\n        return Object.assign(Object.assign({}, rawConfig), { mcpServers: rawConfig.mcpServers || {} });\n    }\n    catch (error) {\n        console.error(`Error reading config: ${error instanceof Error ? error.stack : JSON.stringify(error)}`);\n        return { mcpServers: {} };\n    }\n}\nexports.readConfig = readConfig;\nfunction writeConfig(config, client) {\n    console.log(`Writing config for client: ${client || \"default\"}`);\n    console.log(`Config data: ${JSON.stringify(config, null, 2)}`);\n    const configPath = getConfigPath(client);\n    const configDir = node_path_1.default.dirname(configPath);\n    console.log(`Ensuring config directory exists: ${configDir}`);\n    if (!node_fs_1.default.existsSync(configDir)) {\n        console.log(`Creating directory: ${configDir}`);\n        node_fs_1.default.mkdirSync(configDir, { recursive: true });\n    }\n    if (!config.mcpServers || typeof config.mcpServers !== \"object\") {\n        console.log(`Invalid mcpServers structure in config`);\n        throw new Error(\"Invalid mcpServers structure\");\n    }\n    let existingConfig = { mcpServers: {} };\n    try {\n        if (node_fs_1.default.existsSync(configPath)) {\n            console.log(`Reading existing config file for merging`);\n            existingConfig = JSON.parse(node_fs_1.default.readFileSync(configPath, \"utf8\"));\n            console.log(`Existing config loaded: ${JSON.stringify(existingConfig, null, 2)}`);\n        }\n    }\n    catch (error) {\n        console.log(`Error reading existing config for merge: ${error instanceof Error ? error.message : String(error)}`);\n        // If reading fails, continue with empty existing config\n    }\n    console.log(`Merging configs`);\n    const mergedConfig = Object.assign(Object.assign({}, existingConfig), config);\n    console.log(`Merged config: ${JSON.stringify(mergedConfig, null, 2)}`);\n    console.log(`Writing config to file: ${configPath}`);\n    node_fs_1.default.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));\n    console.log(`Config successfully written`);\n}\nexports.writeConfig = writeConfig;\n\n\n//# sourceURL=webpack://nash/./src/config.ts?");

/***/ }),

/***/ "./src/index.ts":
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
eval("\nvar __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {\n    if (k2 === undefined) k2 = k;\n    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });\n}) : (function(o, m, k, k2) {\n    if (k2 === undefined) k2 = k;\n    o[k2] = m[k];\n}));\nvar __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {\n    Object.defineProperty(o, \"default\", { enumerable: true, value: v });\n}) : function(o, v) {\n    o[\"default\"] = v;\n});\nvar __importStar = (this && this.__importStar) || function (mod) {\n    if (mod && mod.__esModule) return mod;\n    var result = {};\n    if (mod != null) for (var k in mod) if (k !== \"default\" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);\n    __setModuleDefault(result, mod);\n    return result;\n};\nvar __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {\n    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }\n    return new (P || (P = Promise))(function (resolve, reject) {\n        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }\n        function rejected(value) { try { step(generator[\"throw\"](value)); } catch (e) { reject(e); } }\n        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }\n        step((generator = generator.apply(thisArg, _arguments || [])).next());\n    });\n};\nvar __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { \"default\": mod };\n};\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nconst electron_1 = __webpack_require__(/*! electron */ \"electron\");\nconst path = __importStar(__webpack_require__(/*! path */ \"path\"));\nconst child_process_1 = __webpack_require__(/*! child_process */ \"child_process\");\nconst fs = __importStar(__webpack_require__(/*! fs */ \"fs\"));\nconst os = __importStar(__webpack_require__(/*! os */ \"os\"));\nconst icon_png_1 = __importDefault(__webpack_require__(/*! ../public/icon.png */ \"./public/icon.png\"));\nconst config_1 = __webpack_require__(/*! ./config */ \"./src/config.ts\");\n// Handle creating/removing shortcuts on Windows when installing/uninstalling.\nif (__webpack_require__(/*! electron-squirrel-startup */ \"./node_modules/electron-squirrel-startup/index.js\")) {\n    electron_1.app.quit();\n}\nconst absoluteIconPath = path.join(__dirname, icon_png_1.default);\n// Define the Nash installation directory path\nconst nashInstallPath = path.join(os.homedir(), \"Library\", \"Application Support\", \"Nash\", \"nash-mcp-0.1.0\");\n// Define the secrets file path\nconst secretsFilePath = path.join(os.homedir(), \"Library\", \"Application Support\", \"Nash\", \"secrets.json\");\n// Function to read secrets from file\nfunction readSecrets() {\n    return __awaiter(this, void 0, void 0, function* () {\n        if (!fs.existsSync(secretsFilePath)) {\n            return [];\n        }\n        try {\n            const data = yield fs.promises.readFile(secretsFilePath, \"utf8\");\n            return JSON.parse(data);\n        }\n        catch (error) {\n            console.error(\"Error reading secrets:\", error);\n            return [];\n        }\n    });\n}\n// Function to write secrets to file\nfunction writeSecrets(secrets) {\n    return __awaiter(this, void 0, void 0, function* () {\n        try {\n            const nashDir = path.dirname(secretsFilePath);\n            if (!fs.existsSync(nashDir)) {\n                yield fs.promises.mkdir(nashDir, { recursive: true });\n            }\n            yield fs.promises.writeFile(secretsFilePath, JSON.stringify(secrets, null, 2), \"utf8\");\n            return true;\n        }\n        catch (error) {\n            console.error(\"Error writing secrets:\", error);\n            return false;\n        }\n    });\n}\n// Function to add a new secret\nfunction addSecret(key, value, description) {\n    return __awaiter(this, void 0, void 0, function* () {\n        try {\n            const secrets = yield readSecrets();\n            const existingIndex = secrets.findIndex((s) => s.key === key);\n            if (existingIndex >= 0) {\n                secrets[existingIndex] = { key, value, description };\n            }\n            else {\n                secrets.push({ key, value, description });\n            }\n            return yield writeSecrets(secrets);\n        }\n        catch (error) {\n            console.error(\"Error adding secret:\", error);\n            return false;\n        }\n    });\n}\n// Function to delete a secret\nfunction deleteSecret(key) {\n    return __awaiter(this, void 0, void 0, function* () {\n        try {\n            console.log(\"Reading existing secrets...\");\n            const secrets = yield readSecrets();\n            console.log(`Found ${secrets.length} secrets`);\n            console.log(`Attempting to delete secret with key: ${key}`);\n            const existingIndex = secrets.findIndex((s) => s.key === key);\n            if (existingIndex === -1) {\n                console.error(\"Secret not found\");\n                return false;\n            }\n            const filteredSecrets = secrets.filter((s) => s.key !== key);\n            console.log(`Filtered secrets length: ${filteredSecrets.length}`);\n            const success = yield writeSecrets(filteredSecrets);\n            console.log(`Write operation success: ${success}`);\n            return success;\n        }\n        catch (error) {\n            console.error(\"Error in deleteSecret:\", error);\n            return false;\n        }\n    });\n}\n// Function to check installed services\nfunction checkInstalledServices() {\n    const appSupportPath = path.join(os.homedir(), \"Library\", \"Application Support\");\n    const serviceConfigs = [\n        {\n            name: \"Claude\",\n            path: path.join(appSupportPath, \"Claude\"),\n            configCheck: () => __awaiter(this, void 0, void 0, function* () {\n                var _a;\n                const config = (0, config_1.readConfig)(\"claude\");\n                return ((_a = config.mcpServers) === null || _a === void 0 ? void 0 : _a.Nash) !== undefined;\n            }),\n        },\n        {\n            name: \"Cline\",\n            path: path.join(appSupportPath, \"Code\", \"User\", \"globalStorage\", \"saoudrizwan.claude-dev\"),\n            configCheck: () => __awaiter(this, void 0, void 0, function* () {\n                var _b;\n                const config = (0, config_1.readConfig)(\"cline\");\n                return ((_b = config.mcpServers) === null || _b === void 0 ? void 0 : _b.Nash) !== undefined;\n            }),\n        },\n        {\n            name: \"Roo-Cline\",\n            path: path.join(appSupportPath, \"Code\", \"User\", \"globalStorage\", \"rooveterinaryinc.roo-cline\"),\n            configCheck: () => __awaiter(this, void 0, void 0, function* () {\n                var _c;\n                const config = (0, config_1.readConfig)(\"roo-cline\");\n                return ((_c = config.mcpServers) === null || _c === void 0 ? void 0 : _c.Nash) !== undefined;\n            }),\n        },\n        {\n            name: \"Windsurf\",\n            path: path.join(os.homedir(), \".codeium\", \"windsurf\"),\n            configCheck: () => __awaiter(this, void 0, void 0, function* () {\n                var _d;\n                const config = (0, config_1.readConfig)(\"windsurf\");\n                return ((_d = config.mcpServers) === null || _d === void 0 ? void 0 : _d.Nash) !== undefined;\n            }),\n        },\n        {\n            name: \"Witsy\",\n            path: path.join(appSupportPath, \"Witsy\"),\n            configCheck: () => __awaiter(this, void 0, void 0, function* () {\n                var _e;\n                const config = (0, config_1.readConfig)(\"witsy\");\n                return ((_e = config.mcpServers) === null || _e === void 0 ? void 0 : _e.Nash) !== undefined;\n            }),\n        },\n        {\n            name: \"Enconvo\",\n            path: path.join(os.homedir(), \".config\", \"enconvo\"),\n            configCheck: () => __awaiter(this, void 0, void 0, function* () {\n                var _f;\n                const config = (0, config_1.readConfig)(\"enconvo\");\n                return ((_f = config.mcpServers) === null || _f === void 0 ? void 0 : _f.Nash) !== undefined;\n            }),\n        },\n    ];\n    return Promise.all(serviceConfigs\n        .filter((config) => fs.existsSync(config.path))\n        .map((config) => __awaiter(this, void 0, void 0, function* () {\n        return ({\n            name: config.name,\n            added: config.configCheck ? yield config.configCheck() : false,\n        });\n    })));\n}\n// Check if Nash is installed\nfunction checkNashInstalled() {\n    try {\n        return fs.existsSync(nashInstallPath);\n    }\n    catch (error) {\n        console.error(\"Error checking Nash installation:\", error);\n        return false;\n    }\n}\nfunction runInstallScript() {\n    // Create a temporary directory for our script\n    const tempDir = path.join(os.tmpdir(), \"nash-installer\");\n    try {\n        if (!fs.existsSync(tempDir)) {\n            fs.mkdirSync(tempDir, { recursive: true });\n        }\n    }\n    catch (error) {\n        console.error(\"Failed to create temp directory:\", error);\n        electron_1.dialog.showErrorBox(\"Installation Error\", \"Failed to create temporary directory for installation.\");\n        return Promise.reject(error);\n    }\n    // Determine script path based on environment\n    const scriptPath = electron_1.app.isPackaged\n        ? path.join(process.resourcesPath, \"install.sh\")\n        : path.join(electron_1.app.getAppPath(), \"src\", \"install.sh\");\n    // Copy script to temp and make executable\n    const tmpPath = path.join(tempDir, \"install.sh\");\n    try {\n        fs.copyFileSync(scriptPath, tmpPath);\n        fs.chmodSync(tmpPath, \"755\");\n        console.log(\"Copied script to:\", tmpPath);\n    }\n    catch (error) {\n        console.error(\"Failed to copy install script:\", error);\n        electron_1.dialog.showErrorBox(\"Installation Error\", \"Failed to prepare installation script.\");\n        return Promise.reject(error);\n    }\n    const currentUser = process.env.USER || os.userInfo().username;\n    const command = `osascript -e 'do shell script \"SUDO_USER=${currentUser} /bin/bash ${tmpPath}\" with administrator privileges'`;\n    return new Promise((resolve, reject) => {\n        (0, child_process_1.exec)(command, { cwd: os.homedir() }, (error, stdout, stderr) => {\n            // Clean up temp file\n            try {\n                fs.unlinkSync(tmpPath);\n                console.log(\"Cleaned up temp script\");\n            }\n            catch (cleanupError) {\n                console.error(\"Failed to clean up temp script:\", cleanupError);\n            }\n            if (error) {\n                console.error(\"Command error:\", error);\n                electron_1.dialog.showErrorBox(\"Installation Error\", error.message);\n                reject(error);\n                return;\n            }\n            if (stdout)\n                console.log(\"Command stdout:\", stdout);\n            if (stderr)\n                console.error(\"Command stderr:\", stderr);\n            electron_1.dialog.showMessageBox({\n                type: \"info\",\n                title: \"Done\",\n                message: \"Installation complete\",\n            });\n            resolve(true);\n        });\n    });\n}\n// Function to configure MCP server for a specific client\nfunction configureMcpServer(clientName) {\n    return __awaiter(this, void 0, void 0, function* () {\n        try {\n            console.log(`Configuring MCP server for ${clientName}...`);\n            // Read existing config\n            const config = (0, config_1.readConfig)(clientName);\n            // Ensure mcpServers object exists\n            if (!config.mcpServers) {\n                config.mcpServers = {};\n            }\n            // Add Nash MCP server configuration\n            config.mcpServers.Nash = {\n                command: path.join(nashInstallPath, \".venv/bin/mcp\"),\n                args: [\"run\", path.join(nashInstallPath, \"src/nash_mcp/server.py\")],\n            };\n            // Write updated config\n            (0, config_1.writeConfig)(config, clientName);\n            console.log(`Successfully configured MCP server for ${clientName}`);\n            return true;\n        }\n        catch (error) {\n            console.error(`Error configuring MCP server for ${clientName}:`, error);\n            return false;\n        }\n    });\n}\n// Function to check if Cursor is installed\nfunction checkCursorInstalled() {\n    try {\n        const cursorPath = path.join(os.homedir(), \"Library\", \"Application Support\", \"Cursor\");\n        return fs.existsSync(cursorPath);\n    }\n    catch (error) {\n        console.error(\"Error checking Cursor installation:\", error);\n        return false;\n    }\n}\nconst createWindow = () => {\n    // Create the browser window.\n    const mainWindow = new electron_1.BrowserWindow({\n        height: 700,\n        width: 900,\n        minHeight: 600,\n        minWidth: 800,\n        icon: path.join(__dirname, icon_png_1.default),\n        webPreferences: {\n            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,\n            contextIsolation: true,\n            sandbox: false,\n            nodeIntegration: false,\n        },\n        show: false,\n        backgroundColor: \"#0f0f0f\", // Dark background matching our new color\n    });\n    // Show window when ready to avoid flickering\n    mainWindow.once(\"ready-to-show\", () => {\n        mainWindow.show();\n    });\n    // and load the index.html of the app.\n    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);\n};\n// This method will be called when Electron has finished\n// initialization and is ready to create browser windows.\n// Some APIs can only be used after this event occurs.\nelectron_1.app.whenReady().then(() => {\n    if (process.platform === \"darwin\") {\n        electron_1.app.dock.setIcon(absoluteIconPath);\n    }\n    console.log(\"App is ready, registering IPC handlers...\");\n    // Register all IPC handlers first\n    try {\n        electron_1.ipcMain.handle(\"run-install\", (event) => {\n            console.log(\"run-install handler called\");\n            return runInstallScript();\n        });\n        console.log(\"Registered run-install handler\");\n        electron_1.ipcMain.handle(\"check-nash-installed\", (event) => {\n            console.log(\"check-nash-installed handler called\");\n            return checkNashInstalled();\n        });\n        console.log(\"Registered check-nash-installed handler\");\n        electron_1.ipcMain.handle(\"check-installed-services\", (event) => {\n            console.log(\"check-installed-services handler called\");\n            return checkInstalledServices();\n        });\n        console.log(\"Registered check-installed-services handler\");\n        electron_1.ipcMain.handle(\"check-cursor-installed\", (event) => {\n            console.log(\"check-cursor-installed handler called\");\n            return checkCursorInstalled();\n        });\n        console.log(\"Registered check-cursor-installed handler\");\n        // Register secrets management handlers\n        electron_1.ipcMain.handle(\"get-secrets\", () => __awaiter(void 0, void 0, void 0, function* () {\n            console.log(\"get-secrets handler called\");\n            return yield readSecrets();\n        }));\n        console.log(\"Registered get-secrets handler\");\n        electron_1.ipcMain.handle(\"add-secret\", (_, key, value, description) => __awaiter(void 0, void 0, void 0, function* () {\n            console.log(\"add-secret handler called\");\n            return yield addSecret(key, value, description);\n        }));\n        console.log(\"Registered add-secret handler\");\n        electron_1.ipcMain.handle(\"delete-secret\", (_, key) => __awaiter(void 0, void 0, void 0, function* () {\n            console.log(\"delete-secret handler called\");\n            return yield deleteSecret(key);\n        }));\n        console.log(\"Registered delete-secret handler\");\n        electron_1.ipcMain.handle(\"configure-mcp\", (_, serviceName) => __awaiter(void 0, void 0, void 0, function* () {\n            console.log(\"configure-mcp handler called\");\n            const normalizedServiceName = serviceName.toLowerCase();\n            // Map service names to their config names\n            const serviceToConfigMap = {\n                claude: \"claude\",\n                cline: \"cline\",\n                \"roo-cline\": \"roo-cline\",\n                windsurf: \"windsurf\",\n                witsy: \"witsy\",\n                enconvo: \"enconvo\",\n            };\n            const configName = serviceToConfigMap[normalizedServiceName];\n            if (!configName) {\n                console.error(`Unknown service name: ${serviceName}`);\n                return false;\n            }\n            return yield configureMcpServer(configName);\n        }));\n        console.log(\"Registered configure-mcp handler\");\n    }\n    catch (error) {\n        console.error(\"Error registering IPC handlers:\", error);\n    }\n    // Then create the window\n    console.log(\"Creating main window...\");\n    createWindow();\n    electron_1.app.on(\"activate\", () => {\n        // On OS X it's common to re-create a window in the app when the\n        // dock icon is clicked and there are no other windows open.\n        if (electron_1.BrowserWindow.getAllWindows().length === 0) {\n            createWindow();\n        }\n    });\n});\n// Quit when all windows are closed, except on macOS. There, it's common\n// for applications and their menu bar to stay active until the user quits\n// explicitly with Cmd + Q.\nelectron_1.app.on(\"window-all-closed\", () => {\n    if (process.platform !== \"darwin\") {\n        electron_1.app.quit();\n    }\n});\n// In this file you can include the rest of your app's specific main process\n// code. You can also put them in separate files and import them here.\n\n\n//# sourceURL=webpack://nash/./src/index.ts?");

/***/ }),

/***/ "child_process":
/*!********************************!*\
  !*** external "child_process" ***!
  \********************************/
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ "electron":
/*!***************************!*\
  !*** external "electron" ***!
  \***************************/
/***/ ((module) => {

"use strict";
module.exports = require("electron");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "net":
/*!**********************!*\
  !*** external "net" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("net");

/***/ }),

/***/ "node:fs":
/*!**************************!*\
  !*** external "node:fs" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:fs");

/***/ }),

/***/ "node:os":
/*!**************************!*\
  !*** external "node:os" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:os");

/***/ }),

/***/ "node:path":
/*!****************************!*\
  !*** external "node:path" ***!
  \****************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:path");

/***/ }),

/***/ "os":
/*!*********************!*\
  !*** external "os" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ "tty":
/*!**********************!*\
  !*** external "tty" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("tty");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
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
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		__webpack_require__.p = "";
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __webpack_require__ !== 'undefined') __webpack_require__.ab = __dirname + "/native_modules/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/index.ts");
/******/ 	
/******/ })()
;
