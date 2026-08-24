/* Copyright (c) Auki Labs Limited 2024-2026, 0.1.0, 1c577bc700a3d972fcfdd88b21c5680b9af61327 */ (function (
  e,
  t,
) {
  "function" == typeof define && define.amd
    ? define("Posemesh", [], t)
    : "object" == typeof module && module.exports
      ? (module.exports = t())
      : "object" == typeof exports
        ? (exports.Posemesh = t())
        : (e.Posemesh = t());
})(
  "undefined" == typeof globalThis
    ? "undefined" == typeof window
      ? "undefined" == typeof self
        ? "undefined" == typeof global
          ? this
          : global
        : self
      : window
    : globalThis,
  function () {
    /// --- BEGIN MAIN JS WRAPPER --- ///
    async function e(e) {
      if ((e instanceof URL && (e = e.href), "string" == typeof e))
        if ("undefined" == typeof window) {
          let t;
          try {
            t = require("fs/promises");
          } catch {
            t = require("fs").promises;
          }
          e = await t.readFile(e);
        } else {
          if ("function" != typeof fetch) throw new Error("Unavailable 'fetch()' function.");
          e = fetch(e);
        } /// --- BEGIN RUST JS WRAPPER --- ///
      // stub
      /// --- END RUST JS WRAPPER --- ///
      for (const t of regClsFuncs) t();
      if ("object" == typeof e && "function" == typeof e.then) {
        if ("instantiateStreaming" in WebAssembly)
          return (
            __wbg_set_wasm(
              (await WebAssembly.instantiateStreaming(e, wasmImports)).instance.exports,
            ),
            wasmImports["./PosemeshBase_bg.js"]
          );
        e = await e;
      }
      if (
        (e instanceof Response && (e = await e.arrayBuffer()),
        !(
          e instanceof ArrayBuffer ||
          e instanceof Uint8Array ||
          ("undefined" != typeof Buffer && Buffer.isBuffer(e))
        ))
      )
        throw new Error("Invalid 'source' buffer type.");
      return (
        __wbg_set_wasm((await WebAssembly.instantiate(e, wasmImports)).instance.exports),
        wasmImports["./PosemeshBase_bg.js"]
      );
    }
    let t = {},
      r = // smart pointer properties
        !0;
    var o = (() => {
      var t = "undefined" == typeof document ? void 0 : document.currentScript?.src;
      return (
        "undefined" != typeof __filename && (t = t || __filename),
        function (r = {}) {
          var o = Math.floor,
            s = Math.max,
            n = Math.ceil,
            a = Math.min,
            l = String.fromCharCode;
          function p(e) {
            return ae.locateFile ? ae.locateFile(e, Te) : Te + e;
          } // Hooks that are implemented differently in different runtime environments.
          // In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
          // don't define it at all in release modes.  This matches the behaviour of
          // MINIMAL_RUNTIME.
          // TODO(sbc): Make this the default even without STRICT enabled.
          /** @type {function(*, string=)} */ function d(e, t) {
            e || S("Assertion failed" + (t ? ": " + t : ""));
          } // We used to include malloc/free by default in the past. Show a helpful error in
          // builds with assertions.
          // Memory management
          // include: runtime_shared.js
          function c() {
            var e = xe.buffer;
            ((ae.HEAP8 = Fe = new Int8Array(e)),
              (ae.HEAP16 = ke = new Int16Array(e)),
              (ae.HEAPU8 = Ve = new Uint8Array(e)),
              (ae.HEAPU16 = De = new Uint16Array(e)),
              (ae.HEAP32 = Re = new Int32Array(e)),
              (ae.HEAPU32 = Oe = new Uint32Array(e)),
              (ae.HEAPF32 = Ue = new Float32Array(e)),
              (ae.HEAPF64 = $e = new Float64Array(e)),
              (ae.HEAP64 = Ne = new BigInt64Array(e)),
              (ae.HEAPU64 = Le = new BigUint64Array(e)));
          } // end include: runtime_shared.js
          // include: runtime_stack_check.js
          // Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
          function m() {
            var e = So();
            (d(0 == (3 & e)),
              0 == e && (e += 4),
              (Oe[e >> 2] = 34821223),
              (Oe[(e + 4) >> 2] = 2310721022),
              (Oe[0] = 1668509029));
          }
          function u() {
            if (!Ie) {
              var e = So(); // See writeStackCookie().
              0 == e && (e += 4);
              var t = Oe[e >> 2],
                r = Oe[(e + 4) >> 2];
              ((34821223 != t || 2310721022 != r) &&
                S(
                  `Stack overflow! Stack cookie has been overwritten at ${tt(e)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${tt(r)} ${tt(t)}`,
                ),
                1668509029 != Oe[0] /* 'emsc' */ &&
                  S(
                    "Runtime error: The application has corrupted its heap memory area (address zero)!",
                  ));
            }
          } // end include: runtime_stack_check.js
          function y() {
            var e = ae.preRun;
            (e && ("function" == typeof e && (e = [e]), e.forEach(f)), Ze(ze));
          }
          function g() {
            (d(!He),
              (He = !0),
              u(),
              ae.noFSInit || Ft.initialized || Ft.init(),
              (Ft.ignorePermissions = !1),
              Pt.init(),
              Ze(Be));
          }
          function _() {
            u();
            var e = ae.postRun;
            (e && ("function" == typeof e && (e = [e]), e.forEach(T)), Ze(We));
          }
          function f(e) {
            ze.unshift(e);
          }
          function P(e) {
            Be.unshift(e);
          }
          function T(e) {
            We.unshift(e);
          } // include: runtime_math.js
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc
          function C(e) {
            for (var t = e; 1;) {
              if (!Xe[e]) return e;
              e = t + Math.random();
            }
          }
          function h(e) {
            (Ge++,
              ae.monitorRunDependencies?.(Ge),
              e
                ? (d(!Xe[e]),
                  (Xe[e] = 1),
                  null === je &&
                    "undefined" != typeof setInterval &&
                    (je = setInterval(() => {
                      if (Ie) return (clearInterval(je), void (je = null));
                      var e = !1;
                      for (var t in Xe)
                        (e || ((e = !0), we("still waiting on run dependencies:")),
                          we(`dependency: ${t}`));
                      e && we("(end of list)");
                    }, 1e4)))
                : we("warning: run dependency added without ID"));
          }
          function b(e) {
            if (
              (Ge--,
              ae.monitorRunDependencies?.(Ge),
              e ? (d(Xe[e]), delete Xe[e]) : we("warning: run dependency removed without ID"),
              0 == Ge && (null !== je && (clearInterval(je), (je = null)), Ye))
            ) {
              var t = Ye;
              ((Ye = null), t());
            }
          }
          /** @param {string|number=} what */ function S(t) {
            (ae.onAbort?.(t), (t = "Aborted(" + t + ")"), we(t), (Ie = !0)); // Use a wasm runtime error, because a JS error might be seen as a foreign
            // exception, which means we'd run destructors on it. We need the error to
            // simply make the program stop.
            // FIXME This approach does not work in Wasm EH because it currently does not assume
            // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
            // a trap or not based on a hidden field within the object. So at the moment
            // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
            // allows this in the wasm spec.
            // Suppress closure compiler warning here. Closure compiler's builtin extern
            // definition for WebAssembly.RuntimeError claims it takes no arguments even
            // though it can.
            // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
            /** @suppress {checkTypes} */ var r = new WebAssembly.RuntimeError(t); // Throw the error whether or not MODULARIZE is set because abort is used
            // in code paths apart from instantiation where an exception is expected
            // to be thrown when abort is called.
            throw (de(r), r);
          } // include: memoryprofiler.js
          // end include: memoryprofiler.js
          // include: URIUtils.js
          // Prefix of data URIs emitted by SINGLE_FILE and related options.
          // end include: URIUtils.js
          function A(e, t) {
            return (...r) => {
              d(He, `native function \`${e}\` called before runtime initialization`);
              var o = mo[e];
              return (
                d(o, `exported native function \`${e}\` not found`),
                d(
                  r.length <= t,
                  `native function \`${e}\` called with ${r.length} args but expects ${t}`,
                ),
                o(...r)
              );
            };
          } // include: runtime_exceptions.js
          // end include: runtime_exceptions.js
          function E() {
            var e = "Posemesh.wasm";
            return Qe("Posemesh.wasm") ? "Posemesh.wasm" : p("Posemesh.wasm");
          }
          function w(e) {
            if (e == qe && Me) return new Uint8Array(Me);
            if (he) return he(e);
            throw "both async and sync fetching of the wasm failed";
          }
          function M(e) {
            // If we don't have the binary yet, load it asynchronously using readAsync.
            return Me
              ? Promise.resolve().then(() => w(e))
              : Ce(e).then(
                  (e) => new Uint8Array(/** @type{!ArrayBuffer} */ e), // Fall back to getBinarySync if readAsync fails
                  () => w(e),
                ); // Otherwise, getBinarySync should be able to get it synchronously
          }
          function I(e, t, r) {
            return M(e)
              .then((e) => WebAssembly.instantiate(e, t))
              .then(r, (e) => {
                (we(`failed to asynchronously prepare wasm: ${e}`),
                  Ke(qe) &&
                    we(
                      `warning: Loading from a file URI (${qe}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`,
                    ),
                  S(e));
              });
          }
          function x(e, t, r, o) {
            return e ||
              "function" != typeof WebAssembly.instantiateStreaming ||
              Qe(t) ||
              ue ||
              "function" != typeof fetch
              ? I(t, r, o)
              : fetch(t, { credentials: "same-origin" }).then((e) => {
                  // Suppress closure warning here since the upstream definition for
                  // instantiateStreaming only allows Promise<Repsponse> rather than
                  // an actual Response.
                  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
                  /** @suppress {checkTypes} */ var s = WebAssembly.instantiateStreaming(e, r);
                  return s.then(o, function (e) {
                    return (
                      we(`wasm streaming compile failed: ${e}`),
                      we("falling back to ArrayBuffer instantiation"),
                      I(t, r, o)
                    );
                  });
                });
          }
          function v() {
            // prepare imports
            return { env: co, wasi_snapshot_preview1: co };
          } // Create the wasm instance.
          // Receives the wasm imports, returns the exports.
          function F() {
            // Load the wasm module and create an instance of using native support in the JS engine.
            // handle a generated wasm instance, receiving its exports and
            // performing other necessary setup
            /** @param {WebAssembly.Module=} module*/ function e(e, t) {
              return (
                (mo = e.exports),
                (xe = mo.memory),
                d(xe, "memory not found in wasm exports"),
                c(),
                (lo = mo.__indirect_function_table),
                d(lo, "table not found in wasm exports"),
                P(mo.__wasm_call_ctors),
                b("wasm-instantiate"),
                mo
              );
            } // wait for the pthread pool (if any)
            function t(t) {
              (d(
                ae === o,
                "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?",
              ),
                (o = null),
                e(t.instance));
            } // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
            // to manually instantiate the Wasm module themselves. This allows pages to
            // run the instantiation parallel to any other async startup actions they are
            // performing.
            // Also pthreads and wasm workers initialize the wasm instance through this
            // path.
            var r = v();
            h("wasm-instantiate"); // Prefer streaming instantiation if available.
            // Async compilation can be confusing when an error on the page overwrites Module
            // (for example, if the order of elements is wrong, and the one defining Module is
            // later), so we save Module and check it later.
            var o = ae;
            if (ae.instantiateWasm)
              try {
                return ae.instantiateWasm(r, e);
              } catch (t) {
                (we(`Module.instantiateWasm callback failed with error: ${t}`), de(t));
              }
            return ((qe ??= E()), x(Me, qe, r, t).catch(de), {}); // no exports yet; we'll fill them in later
          } // include: runtime_debug.js
          // Endianness check
          function V(e, t, r = !0) {
            Object.getOwnPropertyDescriptor(ae, e) ||
              Object.defineProperty(ae, e, {
                configurable: !0,
                get() {
                  let o = r
                    ? " (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)"
                    : "";
                  S(`\`Module.${e}\` has been replaced by \`${t}\`` + o);
                },
              });
          }
          function k(e) {
            Object.getOwnPropertyDescriptor(ae, e) &&
              S(`\`Module.${e}\` was supplied but \`${e}\` not included in INCOMING_MODULE_JS_API`);
          } // forcing the filesystem exports a few things by default
          function D(e) {
            return (
              "FS_createPath" === e ||
              "FS_createDataFile" === e ||
              "FS_createPreloadedFile" === e ||
              "FS_unlink" === e ||
              "addRunDependency" === e || // The old FS has some functionality that WasmFS lacks.
              "FS_createLazyFile" === e ||
              "FS_createDevice" === e ||
              "removeRunDependency" === e
            );
          }
          /**
           * Intercept access to a global symbol.  This enables us to give informative
           * warnings/errors when folks attempt to use symbols they did not include in
           * their build, or no symbols that no longer exist.
           */ function R(e, t) {
            // In MODULARIZE mode the generated code runs inside a function scope and not
            // the global scope, and JavaScript does not provide access to function scopes
            // so we cannot dynamically modify the scrope using `defineProperty` in this
            // case.
            //
            // In this mode we simply ignore requests for `hookGlobalSymbolAccess`. Since
            // this is a debug-only feature, skipping it is not major issue.
          }
          function O(e, t) {
            R(e, () => {
              rt(`\`${e}\` is not longer defined by emscripten. ${t}`);
            });
          }
          function U(e) {
            Object.getOwnPropertyDescriptor(ae, e) ||
              Object.defineProperty(ae, e, {
                configurable: !0,
                get() {
                  var t = `'${e}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
                  (D(e) &&
                    (t +=
                      ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you"),
                    S(t));
                },
              });
          } // Used by XXXXX_DEBUG settings to output debug messages.
          // end include: runtime_debug.js
          // === Body ===
          // end include: preamble.js
          /** @constructor */ function N(e) {
            ((this.name = "ExitStatus"),
              (this.message = `Program terminated with exit(${e})`),
              (this.status = e));
          }
          /**
           * @param {number} ptr
           * @param {string} type
           *//**
           * @param {number} ptr
           * @param {number} value
           * @param {string} type
           */ /** @suppress {duplicate } */ function L() {
            d(null != Vt.varargs); // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
            var e = Re[+Vt.varargs >> 2];
            return ((Vt.varargs += 4), e);
          }
          /** @type {function(string, boolean=, number=)} */ function $(e, t, r) {
            var o = 0 < r ? r : gt(e) + 1,
              s = Array(o),
              n = _t(e, s, 0, s.length);
            return (t && (s.length = n), s);
          }
          /** @param {Object=} options */ function z(e, t, r = {}) {
            var o = t.name;
            if (
              (e || Nt(`type "${o}" must have a positive integer typeid pointer`),
              Ot.hasOwnProperty(e))
            ) {
              if (r.ignoreDuplicateRegistrations) return;
              Nt(`Cannot register type '${o}' twice`);
            }
            if (((Ot[e] = t), delete Ut[e], Rt.hasOwnProperty(e))) {
              var s = Rt[e];
              (delete Rt[e], s.forEach((e) => e()));
            }
          }
          /** @param {Object=} options */ function B(e, t, r = {}) {
            if (!("argPackAdvance" in t))
              throw new TypeError("registerType registeredInstance requires argPackAdvance");
            return z(e, t, r);
          }
          /** @suppress {globalThis} */ function W(e) {
            function t() {
              return this.isSmartPointer
                ? er(this.registeredClass.instancePrototype, {
                    ptrType: this.pointeeType,
                    ptr: r,
                    smartPtrType: this,
                    smartPtr: e,
                  })
                : er(this.registeredClass.instancePrototype, { ptrType: this, ptr: e });
            } // ptr is a raw pointer (or a raw smartpointer)
            // rawPointer is a maybe-null raw pointer
            var r = this.getPointee(e);
            if (!r) return (this.destructor(e), null);
            var o = Zt(this.registeredClass, r);
            if (void 0 !== o) {
              // JS object has been neutered, time to repopulate it
              if (0 === o.$$.count.value) return ((o.$$.ptr = r), (o.$$.smartPtr = e), o.clone()); // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var s = o.clone();
              return (this.destructor(e), s);
            }
            var n = this.registeredClass.getActualType(r),
              a = Kt[n];
            if (!a) return t.call(this);
            var i;
            i = this.isConst ? a.constPointerType : a.pointerType;
            var l = Qt(r, this.registeredClass, i.registeredClass);
            return null === l
              ? t.call(this)
              : this.isSmartPointer
                ? er(i.registeredClass.instancePrototype, {
                    ptrType: i,
                    ptr: l,
                    smartPtrType: this,
                    smartPtr: e,
                  })
                : er(i.registeredClass.instancePrototype, { ptrType: i, ptr: l });
          }
          /** @constructor */ function H() {}
          /** @constructor */ function G(e, t, r, o, s, n, a, i) {
            ((this.name = e),
              (this.constructor = t),
              (this.instancePrototype = r),
              (this.rawDestructor = o),
              (this.baseClass = s),
              (this.getActualType = n),
              (this.upcast = a),
              (this.downcast = i),
              (this.pureVirtualFunctions = []));
          }
          /** @suppress {globalThis} */ function j(e, t) {
            if (null === t) return (this.isReference && Nt(`null is not a valid ${this.name}`), 0);
            (t.$$ || Nt(`Cannot pass "${kt(t)}" as a ${this.name}`),
              t.$$.ptr || Nt(`Cannot pass deleted object as a pointer of type ${this.name}`));
            var r = t.$$.ptrType.registeredClass,
              o = lr(t.$$.ptr, r, this.registeredClass);
            return o;
          }
          /** @suppress {globalThis} */ function Y(e, t) {
            var r;
            if (null === t)
              return (
                this.isReference && Nt(`null is not a valid ${this.name}`),
                this.isSmartPointer
                  ? ((r = this.rawConstructor()), null !== e && e.push(this.rawDestructor, r), r)
                  : 0
              );
            ((t && t.$$) || Nt(`Cannot pass "${kt(t)}" as a ${this.name}`),
              t.$$.ptr || Nt(`Cannot pass deleted object as a pointer of type ${this.name}`),
              !this.isConst &&
                t.$$.ptrType.isConst &&
                Nt(
                  `Cannot convert argument of type ${t.$$.smartPtrType ? t.$$.smartPtrType.name : t.$$.ptrType.name} to parameter type ${this.name}`,
                ));
            var o = t.$$.ptrType.registeredClass;
            if (((r = lr(t.$$.ptr, o, this.registeredClass)), this.isSmartPointer))
              switch (
                (void 0 === t.$$.smartPtr && Nt("Passing raw pointer to smart pointer is illegal"),
                this.sharingPolicy)
              ) {
                case 0:
                  t.$$.smartPtrType === this
                    ? (r = t.$$.smartPtr)
                    : Nt(
                        `Cannot convert argument of type ${t.$$.smartPtrType ? t.$$.smartPtrType.name : t.$$.ptrType.name} to parameter type ${this.name}`,
                      );
                  break;
                case 1:
                  r = t.$$.smartPtr;
                  break;
                case 2: // BY_EMVAL
                  if (t.$$.smartPtrType === this) r = t.$$.smartPtr;
                  else {
                    var s = t.clone();
                    ((r = this.rawShare(
                      r,
                      Sr.toHandle(() => s["delete"]()),
                    )),
                      null !== e && e.push(this.rawDestructor, r));
                  }
                  break;
                default:
                  Nt("Unsupporting sharing policy");
              }
            return r;
          }
          /** @suppress {globalThis} */ function X(e, t) {
            if (null === t) return (this.isReference && Nt(`null is not a valid ${this.name}`), 0);
            (t.$$ || Nt(`Cannot pass "${kt(t)}" as a ${this.name}`),
              t.$$.ptr || Nt(`Cannot pass deleted object as a pointer of type ${this.name}`),
              t.$$.ptrType.isConst &&
                Nt(
                  `Cannot convert argument of type ${t.$$.ptrType.name} to parameter type ${this.name}`,
                ));
            var r = t.$$.ptrType.registeredClass,
              o = lr(t.$$.ptr, r, this.registeredClass);
            return o;
          }
          /** @suppress {globalThis} */ function Q(e) {
            return this.fromWireType(Oe[e >> 2]);
          }
          /** @constructor
      @param {*=} pointeeType,
      @param {*=} sharingPolicy,
      @param {*=} rawGetPointee,
      @param {*=} rawConstructor,
      @param {*=} rawShare,
      @param {*=} rawDestructor,
       */ function K(
            e,
            t,
            r,
            o, // smart pointer properties
            s,
            n,
            a,
            i,
            l,
            p,
            d,
          ) {
            ((this.name = e),
              (this.registeredClass = t),
              (this.isReference = r),
              (this.isConst = o),
              (this.isSmartPointer = s),
              (this.pointeeType = n),
              (this.sharingPolicy = a),
              (this.rawGetPointee = i),
              (this.rawConstructor = l),
              (this.rawShare = p),
              (this.rawDestructor = d),
              s || void 0 !== t.baseClass
                ? (this.toWireType = Y)
                : o
                  ? ((this.toWireType = j), (this.destructorFunction = null))
                  : ((this.toWireType = X), (this.destructorFunction = null)));
          }
          /** @param {number=} numArguments */ function q(e) {
            // Skip return value at index 0 - it's not deleted here.
            for (var t = 1; t < e.length; ++t)
              // The type does not define a destructor function - must use dynamic stack
              if (null !== e[t] && void 0 === e[t].destructorFunction) return !0;
            return !1;
          }
          function J(e, t) {
            if (!(e instanceof Function))
              throw new TypeError(
                `new_ called with constructor type ${typeof e} which is not a function`,
              );
            /*
             * Previously, the following line was just:
             *   function dummy() {};
             * Unfortunately, Chrome was preserving 'dummy' as the object's name, even
             * though at creation, the 'dummy' has the correct constructor name.  Thus,
             * objects created with IMVU.new would show up in the debugger as 'dummy',
             * which isn't very helpful.  Using IMVU.createNamedFunction addresses the
             * issue.  Doubly-unfortunately, there's no way to write a test for this
             * behavior.  -NRD 2013.02.22
             */ var o = sr(e.name || "unknownFunctionName", function () {});
            o.prototype = e.prototype;
            var s = new o(),
              n = e.apply(s, t);
            return n instanceof Object ? n : s;
          }
          function Z(e, t, r, o, s) {
            if (e < t || e > r) {
              var n = t == r ? t : `${t} to ${r}`;
              s(`function ${o} called with ${e} arguments, expected ${n}`);
            }
          }
          function ee(e, t, r, o) {
            var s = q(e),
              n = e.length - 2,
              a = [],
              l = ["fn"];
            t && l.push("thisWired");
            for (var p = 0; p < n; ++p) (a.push(`arg${p}`), l.push(`arg${p}Wired`));
            ((a = a.join(",")), (l = l.join(",")));
            var d = `return function (${a}) {\n`;
            ((d +=
              "checkArgCount(arguments.length, minArgs, maxArgs, humanName, throwBindingError);\n"),
              s && (d += "var destructors = [];\n"));
            var c = s ? "destructors" : "null",
              m = [
                "humanName",
                "throwBindingError",
                "invoker",
                "fn",
                "runDestructors",
                "retType",
                "classParam",
              ];
            t && (d += `var thisWired = classParam['toWireType'](${c}, this);\n`);
            for (var p = 0; p < n; ++p)
              ((d += `var arg${p}Wired = argType${p}['toWireType'](${c}, arg${p});\n`),
                m.push(`argType${p}`));
            d += (r || o ? "var rv = " : "") + `invoker(${l});\n`;
            var u = r ? "rv" : "";
            if (s) d += "runDestructors(destructors);\n";
            else
              for (var p = t ? 1 : 2, y; p < e.length; ++p)
                // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
                ((y = 1 == p ? "thisWired" : "arg" + (p - 2) + "Wired"),
                  null !== e[p].destructorFunction &&
                    ((d += `${y}_dtor(${y});\n`), m.push(`${y}_dtor`)));
            return (
              r && (d += "var ret = retType['fromWireType'](rv);\nreturn ret;\n"),
              (d += "}\n"),
              m.push("checkArgCount", "minArgs", "maxArgs"),
              (d = `if (arguments.length !== ${m.length}){ throw new Error(humanName + "Expected ${m.length} closure arguments " + arguments.length + " given."); }\n${d}`),
              [m, d]
            );
          }
          function te(e) {
            for (var t = e.length - 2, r = e.length - 1; 2 <= r && !!e[r].optional; --r) t--;
            return t;
          }
          function re(e, t, r, o, s, /** boolean= */ n) {
            // humanName: a human-readable string name for the function to be generated.
            // argTypes: An array that contains the embind type objects for all types in the function signature.
            //    argTypes[0] is the type object for the function return value.
            //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
            //    argTypes[2...] are the actual function parameters.
            // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
            // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
            // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
            // isAsync: Optional. If true, returns an async function. Async bindings are only supported with JSPI.
            var a = t.length;
            (2 > a &&
              Nt("argTypes array size mismatch! Must at least get return value and 'this' types!"),
              d(!n, "Async bindings are only supported with JSPI.")); // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
            // TODO: This omits argument count check - enable only at -O3 or similar.
            //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
            //       return FUNCTION_TABLE[fn];
            //    }
            // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
            // TODO: Remove this completely once all function invokers are being dynamically generated.
            // Builld the arguments that will be passed into the closure around the invoker
            // function.
            for (
              var l = null !== t[1] && null !== r,
                p = q(t),
                c = "void" !== t[0].name,
                m = a - 2,
                u = te(t),
                y = [e, Nt, o, s, gr, t[0], t[1]],
                g = 0;
              g < a - 2;
              ++g
            )
              y.push(t[g + 2]);
            if (!p)
              for (var g = l ? 1 : 2; g < t.length; ++g)
                // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
                null !== t[g].destructorFunction && y.push(t[g].destructorFunction);
            y.push(Z, u, m);
            let [_, f] = ee(t, l, c, n);
            _.push(f);
            var P = J(Function, _)(...y);
            return sr(e, P);
          }
          function oe() {
            return new Error().stack.toString();
          }
          /** @param {number=} offset */ /** @param {number=} offset */ function se() {
            (Co(), m());
          }
          function ne() {
            function e() {
              Mo ||
                ((Mo = 1),
                (ae.calledRun = 1),
                Ie ||
                  (g(),
                  pe(ae),
                  ae.onRuntimeInitialized?.(),
                  d(
                    !ae._main,
                    'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]',
                  ),
                  _()));
            }
            0 < Ge ||
              (se(),
              (!Io && ((Io = 1), y(), 0 < Ge)) ||
                (ae.setStatus
                  ? (ae.setStatus("Running..."),
                    setTimeout(() => {
                      (setTimeout(() => ae.setStatus(""), 1), e());
                    }, 1))
                  : e(),
                u()));
          }
          var ae = r,
            ie = new Promise((e, t) => {
              ((pe = e), (de = t));
            }),
            le,
            pe,
            de; // include: shell.js
          // The Module object: Our interface to the outside world. We import
          // and export values on it. There are various ways Module can be used:
          // 1. Not defined. We create it here
          // 2. A function parameter, function(moduleArg) => Promise<Module>
          // 3. pre-run appended it, var Module = {}; ..generated code..
          // 4. External script tag defines var Module.
          // We need to check if Module already exists (e.g. case 3 above).
          // Substitution will be replaced with actual code on later stage of the build,
          // this way Closure Compiler will not mangle it (e.g. case 4. above).
          // Note that if you want to run closure, and also to use Module
          // after the generated code, you will need to define   var Module = {};
          // before the code. Then that object will be used in the code, and you
          // can continue to use Module afterwards as well.
          // Set up the promise that indicates the Module is initialized
          [
            "_memory",
            "___indirect_function_table",
            "_HaveOffsetConverter",
            "onRuntimeInitialized",
          ].forEach((e) => {
            Object.getOwnPropertyDescriptor(ie, e) ||
              Object.defineProperty(ie, e, {
                get: () =>
                  S(
                    "You are getting " +
                      e +
                      " on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js",
                  ),
                set: () =>
                  S(
                    "You are setting " +
                      e +
                      " on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js",
                  ),
              });
          }); // Determine the runtime environment we are in. You can customize this by
          // setting the ENVIRONMENT setting at compile time (see settings.js).
          // Attempt to auto-detect the environment
          var ce = "object" == typeof window,
            me = "function" == typeof importScripts,
            ue =
              "object" == typeof process &&
              "object" == typeof process.versions &&
              "string" == typeof process.versions.node &&
              "renderer" != process.type,
            ye = !ce && !ue && !me; // N.b. Electron.js environment is simultaneously a NODE-environment, but
          // also a web environment.
          ue; // --pre-jses are emitted after the Module integration code, so that they can
          // refer to Module (if they choose; they can also define Module)
          // Sometimes an existing Module object exists with properties
          // meant to overwrite the default module functionality. Here
          // we collect those properties and reapply _after_ we configure
          // the current environment's defaults to avoid having to be so
          // defensive during initialization.
          var ge = Object.assign({}, ae),
            _e = [],
            fe = "./this.program",
            Pe = (e, t) => {
              throw t;
            },
            Te = "",
            Ce,
            he; // `/` should be present at the end if `scriptDirectory` is not empty
          if (ue) {
            if (
              "undefined" == typeof process ||
              !process.release ||
              "node" !== process.release.name
            )
              throw new Error(
                "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
              );
            var be = process.versions.node,
              Se = be.split(".").slice(0, 3);
            Se = 1e4 * Se[0] + 100 * Se[1] + 1 * Se[2].split("-")[0];
            if (16e4 > Se)
              throw new Error(
                "This emscripten-generated code requires node v16.0.0 (detected v" + be + ")",
              ); // These modules will usually be used on Node.js. Load them eagerly to avoid
            // the complexity of lazy-loading.
            var Ae = require("fs"),
              i = require("path");
            ((Te = __dirname + "/"),
              (he = (e) => {
                e = Ke(e) ? new URL(e) : i.normalize(e);
                var t = Ae.readFileSync(e);
                return (d(t.buffer), t);
              }),
              (Ce = (e, t = !0) => (
                (e = Ke(e) ? new URL(e) : i.normalize(e)),
                new Promise((r, o) => {
                  Ae.readFile(e, t ? void 0 : "utf8", (e, s) => {
                    e ? o(e) : r(t ? s.buffer : s);
                  });
                })
              )),
              !ae.thisProgram &&
                1 < process.argv.length &&
                (fe = process.argv[1].replace(/\\/g, "/")),
              (_e = process.argv.slice(2)),
              (Pe = (e, t) => {
                throw ((process.exitCode = e), t);
              }));
          } else if (ye) {
            if (
              ("object" == typeof process && "function" == typeof require) ||
              "object" == typeof window ||
              "function" == typeof importScripts
            )
              throw new Error(
                "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
              );
          } else // Note that this includes Node.js workers when relevant (pthreads is enabled).
          // Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
          // ENVIRONMENT_IS_NODE.
          if (ce || me) {
            if (
              (me
                ? (Te = self.location.href)
                : "undefined" != typeof document &&
                  document.currentScript &&
                  (Te = document.currentScript.src),
              t && (Te = t),
              (Te = Te.startsWith("blob:")
                ? ""
                : Te.substr(0, Te.replace(/[?#].*/, "").lastIndexOf("/") + 1)),
              "object" != typeof window && "function" != typeof importScripts)
            )
              throw new Error(
                "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
              );
            Ce = (e) => (
              d(!Ke(e), "readAsync does not work with file:// URLs"),
              fetch(e, { credentials: "same-origin" }).then((e) =>
                e.ok ? e.arrayBuffer() : Promise.reject(new Error(e.status + " : " + e.url)),
              )
            );
          } else throw new Error("environment detection error");
          var Ee = ae.print || console.log.bind(console),
            we = ae.printErr || console.error.bind(console);
          (Object.assign(ae, ge),
            (ge = null),
            (function e() {
              k("fetchSettings");
            })(),
            ae.arguments && (_e = ae.arguments),
            V("arguments", "arguments_"),
            ae.thisProgram && (fe = ae.thisProgram),
            V("thisProgram", "thisProgram"),
            d(
              "undefined" == typeof ae.memoryInitializerPrefixURL,
              "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead",
            ),
            d(
              "undefined" == typeof ae.pthreadMainPrefixURL,
              "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead",
            ),
            d(
              "undefined" == typeof ae.cdInitializerPrefixURL,
              "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead",
            ),
            d(
              "undefined" == typeof ae.filePackagePrefixURL,
              "Module.filePackagePrefixURL option was removed, use Module.locateFile instead",
            ),
            d("undefined" == typeof ae.read, "Module.read option was removed"),
            d(
              "undefined" == typeof ae.readAsync,
              "Module.readAsync option was removed (modify readAsync in JS)",
            ),
            d(
              "undefined" == typeof ae.readBinary,
              "Module.readBinary option was removed (modify readBinary in JS)",
            ),
            d(
              "undefined" == typeof ae.setWindowTitle,
              "Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)",
            ),
            d(
              "undefined" == typeof ae.TOTAL_MEMORY,
              "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY",
            ),
            V("asm", "wasmExports"),
            V("readAsync", "readAsync"),
            V("readBinary", "readBinary"),
            V("setWindowTitle", "setWindowTitle"));
          (d(
            !me,
            "worker environment detected but not enabled at build time.  Add `worker` to `-sENVIRONMENT` to enable.",
          ),
            d(
              !ye,
              "shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.",
            )); // end include: shell.js
          // include: preamble.js
          // === Preamble library stuff ===
          // Documentation for the public APIs defined in this file must be updated in:
          //    site/source/docs/api_reference/preamble.js.rst
          // A prebuilt local version of the documentation is available at:
          //    site/build/text/docs/api_reference/preamble.js.txt
          // You can also build docs locally as HTML or other formats in site/
          // An online HTML version (which may be of a different version of Emscripten)
          //    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html
          var Me = ae.wasmBinary;
          (V("wasmBinary", "wasmBinary"),
            "object" != typeof WebAssembly && we("no native wasm support detected")); // Wasm globals
          var Ie = !1,
            xe,
            ve,
            /** @type {!Int8Array} */ Fe,
            /** @type {!Uint8Array} */ Ve,
            /** @type {!Int16Array} */ ke,
            /** @type {!Uint16Array} */ De,
            /** @type {!Int32Array} */ Re,
            /** @type {!Uint32Array} */ Oe,
            /** @type {!Float32Array} */ Ue,
            /* BigInt64Array type is not correctly defined in closure
/** not-@type {!BigInt64Array} */ Ne,
            /* BigUint64Array type is not correctly defined in closure
/** not-t@type {!BigUint64Array} */ Le,
            /** @type {!Float64Array} */ $e; //========================================
          // Runtime essentials
          //========================================
          // whether we are quitting the application. no code should run after this.
          // set in exit() and abort()
          // set by exit() and abort().  Passed to 'onExit' handler.
          // NOTE: This is also used as the process return code code in shell environments
          // but only when noExitRuntime is false.
          (d(
            !ae.STACK_SIZE,
            "STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time",
          ),
            d(
              "undefined" != typeof Int32Array &&
                "undefined" != typeof Float64Array &&
                null != Int32Array.prototype.subarray &&
                null != Int32Array.prototype.set,
              "JS engine does not provide full typed array support",
            ),
            d(
              !ae.wasmMemory,
              "Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally",
            ),
            d(
              !ae.INITIAL_MEMORY,
              "Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically",
            ));
          var ze = [],
            Be = [],
            We = [],
            He = !1; // functions called before the runtime is initialized
          // functions called during startup
          // functions called during shutdown
          // functions called after the main() is called
          (d(
            Math.imul,
            "This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
          ),
            d(
              Math.fround,
              "This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
            ),
            d(
              Math.clz32,
              "This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
            ),
            d(
              Math.trunc,
              "This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
            )); // end include: runtime_math.js
          // A counter of dependencies for calling run(). If we need to
          // do asynchronous work before running, increment this and
          // decrement it. Incrementing must happen in a place like
          // Module.preRun (used by emcc to add file preloading).
          // Note that you can add dependencies in preRun, even though
          // it happens right before run - run will be postponed until
          // the dependencies are met.
          var Ge = 0,
            je = null,
            Ye = null,
            Xe = {},
            Qe = (e) => e.startsWith("data:application/octet-stream;base64,"),
            Ke = (e) => e.startsWith("file://"),
            qe; // overridden to take different actions when all run dependencies are fulfilled
          /**
           * Indicates whether filename is a base64 data URI.
           * @noinline
           *//**
           * Indicates whether filename is delivered via file protocol (as opposed to http/https)
           * @noinline
           */ if (
            ((() => {
              var e = new Int16Array(1),
                t = new Int8Array(e.buffer);
              if (((e[0] = 25459), 115 !== t[0] || 99 !== t[1]))
                throw "Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)";
            })(),
            ae.ENVIRONMENT)
          )
            throw new Error(
              "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)",
            );
          (O("buffer", "Please use HEAP8.buffer or wasmMemory.buffer"),
            O("asm", "Please use wasmExports instead"));
          var Je = {
              561564: (t, r, o, s, n) => {
                let a = nt(t).split(";"),
                  i = nt(r).split(";"),
                  l = o,
                  p = s,
                  d = nt(n),
                  c = new e.Config(a, i, new Uint8Array(Ve.buffer, l, p), d);
                return e.posemeshNetworkingContextCreate(c);
              },
              561937: (t) => {
                e.posemeshNetworkingContextDestroy(t);
              },
              562002: (t, r, o, s, n, a, i, l) => {
                let p = t,
                  d = r,
                  c = o,
                  m = nt(s),
                  u = nt(n),
                  y = a,
                  g = i,
                  _ = l;
                e.posemeshNetworkingContextSendMessage(p, new Uint8Array(Ve.buffer, d, c), m, u, g)
                  .then(function (e) {
                    _ && dynCall("vip", _, [e ? 1 : 0, y]);
                  })
                  .catch(function (e) {
                    (console.error("psm_posemesh_networking_context_send_message():", e.message),
                      _ && dynCall("vip", _, [0, y]));
                  });
              },
              562602: () => "undefined" != typeof wasmOffsetConverter,
            },
            Ze = (e) => {
              e.forEach((e) => e(ae));
            },
            et = ae.noExitRuntime || !0,
            tt = (e) => (
              d("number" == typeof e),
              (e >>>= 0),
              "0x" + e.toString(16).padStart(8, "0")
            ),
            rt = (e) => {
              ((rt.shown ||= {}),
                rt.shown[e] || ((rt.shown[e] = 1), ue && (e = "warning: " + e), we(e)));
            },
            ot = "undefined" == typeof TextDecoder ? void 0 : new TextDecoder(),
            st = (e, t = 0, r = NaN) => {
              // TextDecoder needs to know the byte length in advance, it doesn't stop on
              // null terminator by itself.  Also, use the length info to avoid running tiny
              // strings through TextDecoder, since .subarray() allocates garbage.
              // (As a tiny code save trick, compare endPtr against endIdx using a negation,
              // so that undefined/NaN means Infinity)
              for (var o = t + r, s = t; e[s] && !(s >= o);) ++s;
              if (16 < s - t && e.buffer && ot) return ot.decode(e.subarray(t, s)); // If building with TextDecoder, we have already computed the string length
              // above, so test loop end condition against that
              for (var n = "", a; t < s;) {
                if (((a = e[t++]), !(128 & a))) {
                  n += l(a);
                  continue;
                }
                var i = 63 & e[t++];
                if (192 == (224 & a)) {
                  n += l(((31 & a) << 6) | i);
                  continue;
                }
                var p = 63 & e[t++];
                if (
                  (224 == (240 & a)
                    ? (a = ((15 & a) << 12) | (i << 6) | p)
                    : (240 != (248 & a) &&
                        rt(
                          "Invalid UTF-8 leading byte " +
                            tt(a) +
                            " encountered when deserializing a UTF-8 string in wasm memory to a JS string!",
                        ),
                      (a = ((7 & a) << 18) | (i << 12) | (p << 6) | (63 & e[t++]))),
                  65536 > a)
                )
                  n += l(a);
                else {
                  var d = a - 65536;
                  n += l(55296 | (d >> 10), 56320 | (1023 & d));
                }
              }
              return n;
            },
            nt = (e, t) => (
              d("number" == typeof e, `UTF8ToString expects a number (got ${typeof e})`),
              e ? st(Ve, e, t) : ""
            );
          /**
           * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
           * array that contains uint8 values, returns a copy of that string as a
           * Javascript String object.
           * heapOrArray is either a regular array, or a JavaScript typed array view.
           * @param {number=} idx
           * @param {number=} maxBytesToRead
           * @return {string}
           *//**
           * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
           * emscripten HEAP, returns a copy of that string as a Javascript String object.
           *
           * @param {number} ptr
           * @param {number=} maxBytesToRead - An optional length that specifies the
           *   maximum number of bytes to read. You can omit this parameter to scan the
           *   string until the first 0 byte. If maxBytesToRead is passed, and the string
           *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
           *   string will cut short at that byte index (i.e. maxBytesToRead will not
           *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
           *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
           *   JS JIT optimizations off, so it is worth to consider consistently using one
           * @return {string}
           */ class at {
            // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
            constructor(e) {
              ((this.excPtr = e), (this.ptr = e - 24));
            }
            set_type(e) {
              Oe[(this.ptr + 4) >> 2] = e;
            }
            get_type() {
              return Oe[(this.ptr + 4) >> 2];
            }
            set_destructor(e) {
              Oe[(this.ptr + 8) >> 2] = e;
            }
            get_destructor() {
              return Oe[(this.ptr + 8) >> 2];
            }
            set_caught(e) {
              ((e = e ? 1 : 0), (Fe[this.ptr + 12] = e));
            }
            get_caught() {
              return 0 != Fe[this.ptr + 12];
            }
            set_rethrown(e) {
              ((e = e ? 1 : 0), (Fe[this.ptr + 13] = e));
            }
            get_rethrown() {
              return 0 != Fe[this.ptr + 13];
            } // Initialize native structure fields. Should be called once after allocated.
            init(e, t) {
              (this.set_adjusted_ptr(0), this.set_type(e), this.set_destructor(t));
            }
            set_adjusted_ptr(e) {
              Oe[(this.ptr + 16) >> 2] = e;
            }
            get_adjusted_ptr() {
              return Oe[(this.ptr + 16) >> 2];
            }
          }
          var it = 0,
            lt = 0,
            pt = L,
            dt = {
              isAbs: (e) => "/" === e.charAt(0),
              splitPath: (e) => {
                var t = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
                return t.exec(e).slice(1);
              },
              normalizeArray: (e, t) => {
                // if the path tries to go above the root, `up` ends up > 0
                for (var r = 0, o = e.length - 1, s; 0 <= o; o--)
                  ((s = e[o]),
                    "." === s
                      ? e.splice(o, 1)
                      : ".." === s
                        ? (e.splice(o, 1), r++)
                        : r && (e.splice(o, 1), r--)); // if the path is allowed to go above the root, restore leading ..s
                if (t) for (; r; r--) e.unshift("..");
                return e;
              },
              normalize: (e) => {
                var t = dt.isAbs(e),
                  r = "/" === e.substr(-1); // Normalize the path
                return (
                  (e = dt
                    .normalizeArray(
                      e.split("/").filter((e) => !!e),
                      !t,
                    )
                    .join("/")),
                  e || t || (e = "."),
                  e && r && (e += "/"),
                  (t ? "/" : "") + e
                );
              },
              dirname: (e) => {
                var t = dt.splitPath(e),
                  r = t[0],
                  o = t[1];
                return r || o ? (o && (o = o.substr(0, o.length - 1)), r + o) : ".";
              },
              basename: (e) => {
                // EMSCRIPTEN return '/'' for '/', not an empty string
                if ("/" === e) return "/";
                ((e = dt.normalize(e)), (e = e.replace(/\/$/, "")));
                var t = e.lastIndexOf("/");
                return -1 === t ? e : e.substr(t + 1);
              },
              join: (...e) => dt.normalize(e.join("/")),
              join2: (e, t) => dt.normalize(e + "/" + t),
            },
            ct = () => {
              if ("object" == typeof crypto && "function" == typeof crypto.getRandomValues)
                // for modern web browsers
                return (e) => crypto.getRandomValues(e); // we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
              if (ue)
                // for nodejs with or without crypto support included
                try {
                  var e = require("crypto"),
                    t = e.randomFillSync;
                  if (t)
                    // nodejs with LTS crypto support
                    return (t) => e.randomFillSync(t); // very old nodejs with the original crypto API
                  var r = e.randomBytes;
                  return (e) => (
                    e.set(r(e.byteLength)), // Return the original view to match modern native implementations.
                    e
                  );
                } catch (t) {
                  // nodejs doesn't have crypto support
                }
              S(
                "no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: (array) => { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };",
              );
            },
            mt = (e) => (mt = ct())(e),
            ut = {
              resolve: (...e) => {
                for (var t = "", r = !1, o = e.length - 1, s; -1 <= o && !r; o--) {
                  // Skip empty and invalid entries
                  if (((s = 0 <= o ? e[o] : Ft.cwd()), "string" != typeof s))
                    throw new TypeError("Arguments to path.resolve must be strings");
                  else if (!s) return ""; // an invalid portion invalidates the whole thing
                  ((t = s + "/" + t), (r = dt.isAbs(s)));
                } // At this point the path should be resolved to a full absolute path, but
                // handle relative paths to be safe (might happen when process.cwd() fails)
                return (
                  (t = dt
                    .normalizeArray(
                      t.split("/").filter((e) => !!e),
                      !r,
                    )
                    .join("/")),
                  (r ? "/" : "") + t || "."
                );
              },
              relative: (e, t) => {
                function r(e) {
                  for (var t = 0; t < e.length && "" === e[t]; t++);
                  for (var r = e.length - 1; 0 <= r && "" === e[r]; r--);
                  return t > r ? [] : e.slice(t, r - t + 1);
                }
                ((e = ut.resolve(e).substr(1)), (t = ut.resolve(t).substr(1)));
                for (
                  var o = r(e.split("/")),
                    s = r(t.split("/")),
                    n = a(o.length, s.length),
                    l = n,
                    p = 0;
                  p < n;
                  p++
                )
                  if (o[p] !== s[p]) {
                    l = p;
                    break;
                  }
                for (var d = [], p = l; p < o.length; p++) d.push("..");
                return ((d = d.concat(s.slice(l))), d.join("/"));
              },
            },
            yt = [],
            gt = (e) => {
              for (var t = 0, r = 0, o; r < e.length; ++r)
                // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
                // unit, not a Unicode code point of the character! So decode
                // UTF16->UTF32->UTF8.
                // See http://unicode.org/faq/utf_bom.html#utf16-3
                ((o = e.charCodeAt(r)),
                  127 >= o
                    ? t++
                    : 2047 >= o
                      ? (t += 2)
                      : 55296 <= o && 57343 >= o
                        ? ((t += 4), ++r)
                        : (t += 3));
              return t;
            },
            _t = (e, t, r, o) => {
              // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
              // undefined and false each don't write out any bytes.
              if (
                (d("string" == typeof e, `stringToUTF8Array expects a string (got ${typeof e})`),
                !(0 < o))
              )
                return 0; // -1 for string null terminator.
              for (var s = r, n = r + o - 1, a = 0, l; a < e.length; ++a) {
                // possibly a lead surrogate
                if (((l = e.charCodeAt(a)), 55296 <= l && 57343 >= l)) {
                  var p = e.charCodeAt(++a);
                  l = (65536 + ((1023 & l) << 10)) | (1023 & p);
                }
                if (127 >= l) {
                  if (r >= n) break;
                  t[r++] = l;
                } else if (2047 >= l) {
                  if (r + 1 >= n) break;
                  ((t[r++] = 192 | (l >> 6)), (t[r++] = 128 | (63 & l)));
                } else if (65535 >= l) {
                  if (r + 2 >= n) break;
                  ((t[r++] = 224 | (l >> 12)),
                    (t[r++] = 128 | (63 & (l >> 6))),
                    (t[r++] = 128 | (63 & l)));
                } else {
                  if (r + 3 >= n) break;
                  (1114111 < l &&
                    rt(
                      "Invalid Unicode code point " +
                        tt(l) +
                        " encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).",
                    ),
                    (t[r++] = 240 | (l >> 18)),
                    (t[r++] = 128 | (63 & (l >> 12))),
                    (t[r++] = 128 | (63 & (l >> 6))),
                    (t[r++] = 128 | (63 & l)));
                }
              } // Null-terminate the pointer to the buffer.
              return ((t[r] = 0), r - s);
            },
            ft = () => {
              if (!yt.length) {
                var e = null;
                if (ue) {
                  // we will read data by chunks of BUFSIZE
                  var t = 256,
                    r = Buffer.alloc(256),
                    o = 0,
                    s = process.stdin.fd; // For some reason we must suppress a closure warning here, even though
                  // fd definitely exists on process.stdin, and is even the proper way to
                  // get the fd of stdin,
                  // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
                  // This started to happen after moving this logic out of library_tty.js,
                  // so it is related to the surrounding code in some unclear manner.
                  /** @suppress {missingProperties} */ try {
                    o = Ae.readSync(s, r, 0, 256);
                  } catch (t) {
                    // Cross-platform differences: on Windows, reading EOF throws an
                    // exception, but on other OSes, reading EOF returns 0. Uniformize
                    // behavior by treating the EOF exception to return 0.
                    if (t.toString().includes("EOF")) o = 0;
                    else throw t;
                  }
                  0 < o && (e = r.slice(0, o).toString("utf-8"));
                } else if ("undefined" != typeof window && "function" == typeof window.prompt)
                  // Browser.
                  ((e = window.prompt("Input: ")), null !== e && (e += "\n"));
                else;
                if (!e) return null;
                yt = $(e, !0);
              }
              return yt.shift();
            },
            Pt = {
              ttys: [],
              init() {
                // https://github.com/emscripten-core/emscripten/pull/1555
                // if (ENVIRONMENT_IS_NODE) {
                //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
                //   // device, it always assumes it's a TTY device. because of this, we're forcing
                //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
                //   // with text files until FS.init can be refactored.
                //   process.stdin.setEncoding('utf8');
                // }
              },
              shutdown() {
                // https://github.com/emscripten-core/emscripten/pull/1555
                // if (ENVIRONMENT_IS_NODE) {
                //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
                //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
                //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
                //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
                //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
                //   process.stdin.pause();
                // }
              },
              register(e, t) {
                ((Pt.ttys[e] = { input: [], output: [], ops: t }),
                  Ft.registerDevice(e, Pt.stream_ops));
              },
              stream_ops: {
                open(e) {
                  var t = Pt.ttys[e.node.rdev];
                  if (!t) throw new Ft.ErrnoError(43);
                  ((e.tty = t), (e.seekable = !1));
                },
                close(e) {
                  e.tty.ops.fsync(e.tty);
                },
                fsync(e) {
                  e.tty.ops.fsync(e.tty);
                },
                read(e, t, r, o, s /* ignored */) {
                  if (!e.tty || !e.tty.ops.get_char) throw new Ft.ErrnoError(60);
                  for (var n = 0, a = 0; a < o; a++) {
                    var l;
                    try {
                      l = e.tty.ops.get_char(e.tty);
                    } catch (t) {
                      throw new Ft.ErrnoError(29);
                    }
                    if (void 0 === l && 0 === n) throw new Ft.ErrnoError(6);
                    if (null === l || void 0 === l) break;
                    (n++, (t[r + a] = l));
                  }
                  return (n && (e.node.timestamp = Date.now()), n);
                },
                write(e, t, r, o, s) {
                  if (!e.tty || !e.tty.ops.put_char) throw new Ft.ErrnoError(60);
                  try {
                    for (var n = 0; n < o; n++) e.tty.ops.put_char(e.tty, t[r + n]);
                  } catch (t) {
                    throw new Ft.ErrnoError(29);
                  }
                  return (o && (e.node.timestamp = Date.now()), n);
                },
              },
              default_tty_ops: {
                get_char(e) {
                  return ft();
                },
                put_char(e, t) {
                  null === t || 10 === t
                    ? (Ee(st(e.output)), (e.output = []))
                    : 0 != t && e.output.push(t);
                },
                fsync(e) {
                  e.output && 0 < e.output.length && (Ee(st(e.output)), (e.output = []));
                },
                ioctl_tcgets(e) {
                  // typical setting
                  return {
                    c_iflag: 25856,
                    c_oflag: 5,
                    c_cflag: 191,
                    c_lflag: 35387,
                    c_cc: [
                      3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0,
                      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    ],
                  };
                },
                ioctl_tcsets(e, t, r) {
                  // currently just ignore
                  return 0;
                },
                ioctl_tiocgwinsz(e) {
                  return [24, 80];
                },
              },
              default_tty1_ops: {
                put_char(e, t) {
                  null === t || 10 === t
                    ? (we(st(e.output)), (e.output = []))
                    : 0 != t && e.output.push(t);
                },
                fsync(e) {
                  e.output && 0 < e.output.length && (we(st(e.output)), (e.output = []));
                },
              },
            },
            Tt = (e, t) => {
              Ve.fill(0, e, e + t);
            },
            Ct = (e, t) => (d(t, "alignment argument is required"), n(e / t) * t),
            ht = (e) => {
              e = Ct(e, 65536);
              var t = To(65536, e);
              return (t && Tt(t, e), t);
            },
            bt = {
              ops_table: null,
              mount(e) {
                return bt.createNode(null, "/", 16895 /* 0777 */, 0);
              },
              createNode(e, t, r, o) {
                if (Ft.isBlkdev(r) || Ft.isFIFO(r))
                  // no supported
                  throw new Ft.ErrnoError(63);
                bt.ops_table ||= {
                  dir: {
                    node: {
                      getattr: bt.node_ops.getattr,
                      setattr: bt.node_ops.setattr,
                      lookup: bt.node_ops.lookup,
                      mknod: bt.node_ops.mknod,
                      rename: bt.node_ops.rename,
                      unlink: bt.node_ops.unlink,
                      rmdir: bt.node_ops.rmdir,
                      readdir: bt.node_ops.readdir,
                      symlink: bt.node_ops.symlink,
                    },
                    stream: { llseek: bt.stream_ops.llseek },
                  },
                  file: {
                    node: { getattr: bt.node_ops.getattr, setattr: bt.node_ops.setattr },
                    stream: {
                      llseek: bt.stream_ops.llseek,
                      read: bt.stream_ops.read,
                      write: bt.stream_ops.write,
                      allocate: bt.stream_ops.allocate,
                      mmap: bt.stream_ops.mmap,
                      msync: bt.stream_ops.msync,
                    },
                  },
                  link: {
                    node: {
                      getattr: bt.node_ops.getattr,
                      setattr: bt.node_ops.setattr,
                      readlink: bt.node_ops.readlink,
                    },
                    stream: {},
                  },
                  chrdev: {
                    node: { getattr: bt.node_ops.getattr, setattr: bt.node_ops.setattr },
                    stream: Ft.chrdev_stream_ops,
                  },
                };
                var s = Ft.createNode(e, t, r, o);
                return (
                  Ft.isDir(s.mode)
                    ? ((s.node_ops = bt.ops_table.dir.node),
                      (s.stream_ops = bt.ops_table.dir.stream),
                      (s.contents = {}))
                    : Ft.isFile(s.mode)
                      ? ((s.node_ops = bt.ops_table.file.node),
                        (s.stream_ops = bt.ops_table.file.stream),
                        (s.usedBytes = 0),
                        (s.contents = null))
                      : Ft.isLink(s.mode)
                        ? ((s.node_ops = bt.ops_table.link.node),
                          (s.stream_ops = bt.ops_table.link.stream))
                        : Ft.isChrdev(s.mode) &&
                          ((s.node_ops = bt.ops_table.chrdev.node),
                          (s.stream_ops = bt.ops_table.chrdev.stream)),
                  (s.timestamp = Date.now()),
                  e && ((e.contents[t] = s), (e.timestamp = s.timestamp)),
                  s
                );
              },
              getFileDataAsTypedArray(e) {
                return e.contents
                  ? e.contents.subarray
                    ? e.contents.subarray(0, e.usedBytes)
                    : new Uint8Array(e.contents)
                  : new Uint8Array(0); // Make sure to not return excess unused bytes.
              },
              expandFileStorage(e, t) {
                var r = e.contents ? e.contents.length : 0;
                if (!(r >= t)) {
                  // No need to expand, the storage was already large enough.
                  // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
                  // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
                  // avoid overshooting the allocation cap by a very large margin.
                  var o = 1048576;
                  ((t = s(t, (r * (1048576 > r ? 2 : 1.125)) >>> 0)), 0 != r && (t = s(t, 256))); // At minimum allocate 256b for each file when expanding.
                  var n = e.contents;
                  ((e.contents = new Uint8Array(t)),
                    0 < e.usedBytes && e.contents.set(n.subarray(0, e.usedBytes), 0));
                }
              },
              resizeFileStorage(e, t) {
                if (e.usedBytes != t)
                  if (0 == t) ((e.contents = null), (e.usedBytes = 0));
                  else {
                    var r = e.contents;
                    ((e.contents = new Uint8Array(t)),
                      r && e.contents.set(r.subarray(0, a(t, e.usedBytes))),
                      (e.usedBytes = t));
                  }
              },
              node_ops: {
                getattr(e) {
                  var t = {}; // device numbers reuse inode numbers.
                  return (
                    (t.dev = Ft.isChrdev(e.mode) ? e.id : 1),
                    (t.ino = e.id),
                    (t.mode = e.mode),
                    (t.nlink = 1),
                    (t.uid = 0),
                    (t.gid = 0),
                    (t.rdev = e.rdev),
                    (t.size = Ft.isDir(e.mode)
                      ? 4096
                      : Ft.isFile(e.mode)
                        ? e.usedBytes
                        : Ft.isLink(e.mode)
                          ? e.link.length
                          : 0),
                    (t.atime = new Date(e.timestamp)),
                    (t.mtime = new Date(e.timestamp)),
                    (t.ctime = new Date(e.timestamp)),
                    (t.blksize = 4096),
                    (t.blocks = n(t.size / t.blksize)),
                    t
                  );
                },
                setattr(e, t) {
                  (void 0 !== t.mode && (e.mode = t.mode),
                    void 0 !== t.timestamp && (e.timestamp = t.timestamp),
                    void 0 !== t.size && bt.resizeFileStorage(e, t.size));
                },
                lookup(e, t) {
                  throw Ft.genericErrors[44];
                },
                mknod(e, t, r, o) {
                  return bt.createNode(e, t, r, o);
                },
                rename(e, t, r) {
                  // if we're overwriting a directory at new_name, make sure it's empty.
                  if (Ft.isDir(e.mode)) {
                    var o;
                    try {
                      o = Ft.lookupNode(t, r);
                    } catch (t) {}
                    if (o) for (var s in o.contents) throw new Ft.ErrnoError(55);
                  } // do the internal rewiring
                  (delete e.parent.contents[e.name],
                    (e.parent.timestamp = Date.now()),
                    (e.name = r),
                    (t.contents[r] = e),
                    (t.timestamp = e.parent.timestamp));
                },
                unlink(e, t) {
                  (delete e.contents[t], (e.timestamp = Date.now()));
                },
                rmdir(e, t) {
                  var r = Ft.lookupNode(e, t);
                  for (var o in r.contents) throw new Ft.ErrnoError(55);
                  (delete e.contents[t], (e.timestamp = Date.now()));
                },
                readdir(e) {
                  var t = [".", ".."];
                  for (var r of Object.keys(e.contents)) t.push(r);
                  return t;
                },
                symlink(e, t, r) {
                  var o = bt.createNode(e, t, 41471, 0);
                  return ((o.link = r), o);
                },
                readlink(e) {
                  if (!Ft.isLink(e.mode)) throw new Ft.ErrnoError(28);
                  return e.link;
                },
              },
              stream_ops: {
                read(e, t, r, o, s) {
                  var n = e.node.contents;
                  if (s >= e.node.usedBytes) return 0;
                  var l = a(e.node.usedBytes - s, o);
                  if ((d(0 <= l), 8 < l && n.subarray)) t.set(n.subarray(s, s + l), r);
                  else for (var p = 0; p < l; p++) t[r + p] = n[s + p];
                  return l;
                },
                write(e, t, r, o, n, a) {
                  if ((d(!(t instanceof ArrayBuffer)), !o)) return 0;
                  var l = e.node;
                  if (
                    ((l.timestamp = Date.now()), t.subarray && (!l.contents || l.contents.subarray))
                  ) {
                    // This write is from a typed array to a typed array?
                    if (a)
                      return (
                        d(0 === n, "canOwn must imply no weird position inside the file"),
                        (l.contents = t.subarray(r, r + o)),
                        (l.usedBytes = o),
                        o
                      );
                    if (0 === l.usedBytes && 0 === n)
                      return ((l.contents = t.slice(r, r + o)), (l.usedBytes = o), o);
                    if (n + o <= l.usedBytes) return (l.contents.set(t.subarray(r, r + o), n), o);
                  } // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
                  if ((bt.expandFileStorage(l, n + o), l.contents.subarray && t.subarray))
                    l.contents.set(t.subarray(r, r + o), n);
                  else for (var p = 0; p < o; p++) l.contents[n + p] = t[r + p]; // Or fall back to manual write if not.
                  return ((l.usedBytes = s(l.usedBytes, n + o)), o);
                },
                llseek(e, t, r) {
                  var o = t;
                  if (
                    (1 === r
                      ? (o += e.position)
                      : 2 == r && Ft.isFile(e.node.mode) && (o += e.node.usedBytes),
                    0 > o)
                  )
                    throw new Ft.ErrnoError(28);
                  return o;
                },
                allocate(e, t, r) {
                  (bt.expandFileStorage(e.node, t + r),
                    (e.node.usedBytes = s(e.node.usedBytes, t + r)));
                },
                mmap(e, t, r, o, s) {
                  if (!Ft.isFile(e.node.mode)) throw new Ft.ErrnoError(43);
                  var n = e.node.contents,
                    a,
                    i; // Only make a new copy when MAP_PRIVATE is specified.
                  if (!(2 & s) && n && n.buffer === Fe.buffer) ((i = !1), (a = n.byteOffset));
                  else {
                    if (((i = !0), (a = ht(t)), !a)) throw new Ft.ErrnoError(48);
                    n &&
                      ((0 < r || r + t < n.length) &&
                        (n.subarray
                          ? (n = n.subarray(r, r + t))
                          : (n = Array.prototype.slice.call(n, r, r + t))),
                      Fe.set(n, a));
                  }
                  return { ptr: a, allocated: i };
                },
                msync(e, t, r, o, s) {
                  // should we check if bytesWritten and length are the same?
                  return (bt.stream_ops.write(e, t, 0, o, r, !1), 0);
                },
              },
            },
            St = (e, t, r, o) => {
              var s = o ? "" : C(`al ${e}`);
              (Ce(e).then(
                (r) => {
                  (d(r, `Loading data file "${e}" failed (no arrayBuffer).`),
                    t(new Uint8Array(r)),
                    s && b(s));
                },
                (t) => {
                  if (r) r();
                  else throw `Loading data file "${e}" failed.`;
                },
              ),
                s && h(s));
            },
            At = (e, t, r, o, s, n) => {
              Ft.createDataFile(e, t, r, o, s, n);
            },
            Et = ae.preloadPlugins || [],
            wt = (e, t, r, o) => {
              "undefined" != typeof Browser && Browser.init();
              var s = !1;
              return (
                Et.forEach((n) => {
                  s || (n.canHandle(t) && (n.handle(e, t, r, o), (s = !0)));
                }),
                s
              );
            },
            Mt = (e) => {
              var t = { r: 0, "r+": 2, w: 577, "w+": 578, a: 1089, "a+": 1090 },
                r = t[e];
              if ("undefined" == typeof r) throw new Error(`Unknown file open mode: ${e}`);
              return r;
            },
            It = (e, t) => {
              var r = 0;
              return (e && (r |= 365), t && (r |= 146), r);
            },
            xt = (e) => nt(Po(e)),
            vt = {
              EPERM: 63,
              ENOENT: 44,
              ESRCH: 71,
              EINTR: 27,
              EIO: 29,
              ENXIO: 60,
              E2BIG: 1,
              ENOEXEC: 45,
              EBADF: 8,
              ECHILD: 12,
              EAGAIN: 6,
              EWOULDBLOCK: 6,
              ENOMEM: 48,
              EACCES: 2,
              EFAULT: 21,
              ENOTBLK: 105,
              EBUSY: 10,
              EEXIST: 20,
              EXDEV: 75,
              ENODEV: 43,
              ENOTDIR: 54,
              EISDIR: 31,
              EINVAL: 28,
              ENFILE: 41,
              EMFILE: 33,
              ENOTTY: 59,
              ETXTBSY: 74,
              EFBIG: 22,
              ENOSPC: 51,
              ESPIPE: 70,
              EROFS: 69,
              EMLINK: 34,
              EPIPE: 64,
              EDOM: 18,
              ERANGE: 68,
              ENOMSG: 49,
              EIDRM: 24,
              ECHRNG: 106,
              EL2NSYNC: 156,
              EL3HLT: 107,
              EL3RST: 108,
              ELNRNG: 109,
              EUNATCH: 110,
              ENOCSI: 111,
              EL2HLT: 112,
              EDEADLK: 16,
              ENOLCK: 46,
              EBADE: 113,
              EBADR: 114,
              EXFULL: 115,
              ENOANO: 104,
              EBADRQC: 103,
              EBADSLT: 102,
              EDEADLOCK: 16,
              EBFONT: 101,
              ENOSTR: 100,
              ENODATA: 116,
              ETIME: 117,
              ENOSR: 118,
              ENONET: 119,
              ENOPKG: 120,
              EREMOTE: 121,
              ENOLINK: 47,
              EADV: 122,
              ESRMNT: 123,
              ECOMM: 124,
              EPROTO: 65,
              EMULTIHOP: 36,
              EDOTDOT: 125,
              EBADMSG: 9,
              ENOTUNIQ: 126,
              EBADFD: 127,
              EREMCHG: 128,
              ELIBACC: 129,
              ELIBBAD: 130,
              ELIBSCN: 131,
              ELIBMAX: 132,
              ELIBEXEC: 133,
              ENOSYS: 52,
              ENOTEMPTY: 55,
              ENAMETOOLONG: 37,
              ELOOP: 32,
              EOPNOTSUPP: 138,
              EPFNOSUPPORT: 139,
              ECONNRESET: 15,
              ENOBUFS: 42,
              EAFNOSUPPORT: 5,
              EPROTOTYPE: 67,
              ENOTSOCK: 57,
              ENOPROTOOPT: 50,
              ESHUTDOWN: 140,
              ECONNREFUSED: 14,
              EADDRINUSE: 3,
              ECONNABORTED: 13,
              ENETUNREACH: 40,
              ENETDOWN: 38,
              ETIMEDOUT: 73,
              EHOSTDOWN: 142,
              EHOSTUNREACH: 23,
              EINPROGRESS: 26,
              EALREADY: 7,
              EDESTADDRREQ: 17,
              EMSGSIZE: 35,
              EPROTONOSUPPORT: 66,
              ESOCKTNOSUPPORT: 137,
              EADDRNOTAVAIL: 4,
              ENETRESET: 39,
              EISCONN: 30,
              ENOTCONN: 53,
              ETOOMANYREFS: 141,
              EUSERS: 136,
              EDQUOT: 19,
              ESTALE: 72,
              ENOTSUP: 138,
              ENOMEDIUM: 148,
              EILSEQ: 25,
              EOVERFLOW: 61,
              ECANCELED: 11,
              ENOTRECOVERABLE: 56,
              EOWNERDEAD: 62,
              ESTRPIPE: 135,
            },
            Ft = {
              root: null,
              mounts: [],
              devices: {},
              streams: [],
              nextInode: 1,
              nameTable: null,
              currentPath: "/",
              initialized: !1,
              ignorePermissions: !0,
              ErrnoError: class extends Error {
                // We set the `name` property to be able to identify `FS.ErrnoError`
                // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
                // - when using PROXYFS, an error can come from an underlying FS
                // as different FS objects have their own FS.ErrnoError each,
                // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
                // we'll use the reliable test `err.name == "ErrnoError"` instead
                constructor(e) {
                  for (var t in (super(He ? xt(e) : ""),
                  (this.name = "ErrnoError"),
                  (this.errno = e),
                  vt))
                    if (vt[t] === e) {
                      this.code = t;
                      break;
                    }
                }
              },
              genericErrors: {},
              filesystems: null,
              syncFSRequests: 0,
              readFiles: {},
              FSStream: class {
                constructor() {
                  this.shared = {};
                }
                get object() {
                  return this.node;
                }
                set object(e) {
                  this.node = e;
                }
                get isRead() {
                  return 1 != (2097155 & this.flags);
                }
                get isWrite() {
                  return 0 != (2097155 & this.flags);
                }
                get isAppend() {
                  return 1024 & this.flags;
                }
                get flags() {
                  return this.shared.flags;
                }
                set flags(e) {
                  this.shared.flags = e;
                }
                get position() {
                  return this.shared.position;
                }
                set position(e) {
                  this.shared.position = e;
                }
              },
              FSNode: class {
                constructor(e, t, r, o) {
                  (e || (e = this),
                    (this.parent = e),
                    (this.mount = e.mount),
                    (this.mounted = null),
                    (this.id = Ft.nextInode++),
                    (this.name = t),
                    (this.mode = r),
                    (this.node_ops = {}),
                    (this.stream_ops = {}),
                    (this.rdev = o),
                    (this.readMode = 365),
                    (this.writeMode = 146));
                }
                get read() {
                  return (this.mode & this.readMode) === this.readMode;
                }
                set read(e) {
                  e ? (this.mode |= this.readMode) : (this.mode &= ~this.readMode);
                }
                get write() {
                  return (this.mode & this.writeMode) === this.writeMode;
                }
                set write(e) {
                  e ? (this.mode |= this.writeMode) : (this.mode &= ~this.writeMode);
                }
                get isFolder() {
                  return Ft.isDir(this.mode);
                }
                get isDevice() {
                  return Ft.isChrdev(this.mode);
                }
              },
              lookupPath(e, t = {}) {
                if (((e = ut.resolve(e)), !e)) return { path: "", node: null };
                var r = { follow_mount: !0, recurse_count: 0 };
                if (((t = Object.assign(r, t)), 8 < t.recurse_count))
                  // max recursive lookup of 8
                  throw new Ft.ErrnoError(32); // split the absolute path
                // start at the root
                for (
                  var o = e.split("/").filter((e) => !!e), s = Ft.root, n = "/", a = 0, l;
                  a < o.length && ((l = a == o.length - 1), !(l && t.parent));
                  a++
                )
                  // by default, lookupPath will not follow a symlink if it is the final path component.
                  // setting opts.follow = true will override this behavior.
                  if (
                    ((s = Ft.lookupNode(s, o[a])),
                    (n = dt.join2(n, o[a])),
                    Ft.isMountpoint(s) && (!l || (l && t.follow_mount)) && (s = s.mounted.root),
                    !l || t.follow)
                  )
                    for (var p = 0, d; Ft.isLink(s.mode);) {
                      ((d = Ft.readlink(n)), (n = ut.resolve(dt.dirname(n), d)));
                      var c = Ft.lookupPath(n, { recurse_count: t.recurse_count + 1 });
                      if (((s = c.node), 40 < p++))
                        // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                        throw new Ft.ErrnoError(32);
                    }
                return { path: n, node: s };
              },
              getPath(e) {
                for (var t; !0;) {
                  if (Ft.isRoot(e)) {
                    var r = e.mount.mountpoint;
                    return t ? ("/" === r[r.length - 1] ? r + t : `${r}/${t}`) : r;
                  }
                  ((t = t ? `${e.name}/${t}` : e.name), (e = e.parent));
                }
              },
              hashName(e, t) {
                for (var r = 0, o = 0; o < t.length; o++) r = 0 | ((r << 5) - r + t.charCodeAt(o));
                return ((e + r) >>> 0) % Ft.nameTable.length;
              },
              hashAddNode(e) {
                var t = Ft.hashName(e.parent.id, e.name);
                ((e.name_next = Ft.nameTable[t]), (Ft.nameTable[t] = e));
              },
              hashRemoveNode(e) {
                var t = Ft.hashName(e.parent.id, e.name);
                if (Ft.nameTable[t] === e) Ft.nameTable[t] = e.name_next;
                else
                  for (var r = Ft.nameTable[t]; r;) {
                    if (r.name_next === e) {
                      r.name_next = e.name_next;
                      break;
                    }
                    r = r.name_next;
                  }
              },
              lookupNode(e, t) {
                var r = Ft.mayLookup(e);
                if (r) throw new Ft.ErrnoError(r);
                for (var o = Ft.hashName(e.id, t), s = Ft.nameTable[o], n; s; s = s.name_next)
                  if (((n = s.name), s.parent.id === e.id && n === t)) return s; // if we failed to find it in the cache, call into the VFS
                return Ft.lookup(e, t);
              },
              createNode(e, t, r, o) {
                d("object" == typeof e);
                var s = new Ft.FSNode(e, t, r, o);
                return (Ft.hashAddNode(s), s);
              },
              destroyNode(e) {
                Ft.hashRemoveNode(e);
              },
              isRoot(e) {
                return e === e.parent;
              },
              isMountpoint(e) {
                return !!e.mounted;
              },
              isFile(e) {
                return 32768 == (61440 & e);
              },
              isDir(e) {
                return 16384 == (61440 & e);
              },
              isLink(e) {
                return 40960 == (61440 & e);
              },
              isChrdev(e) {
                return 8192 == (61440 & e);
              },
              isBlkdev(e) {
                return 24576 == (61440 & e);
              },
              isFIFO(e) {
                return 4096 == (61440 & e);
              },
              isSocket(e) {
                return 49152 == (49152 & e);
              },
              flagsToPermissionString(e) {
                var t = ["r", "w", "rw"][3 & e];
                return (512 & e && (t += "w"), t);
              },
              nodePermissions(e, t) {
                return Ft.ignorePermissions
                  ? 0
                  : t.includes("r") && !(292 & e.mode)
                    ? 2
                    : t.includes("w") && !(146 & e.mode)
                      ? 2
                      : t.includes("x") && !(73 & e.mode)
                        ? 2
                        : 0; // return 0 if any user, group or owner bits are set.
              },
              mayLookup(e) {
                if (!Ft.isDir(e.mode)) return 54;
                var t = Ft.nodePermissions(e, "x");
                return t ? t : e.node_ops.lookup ? 0 : 2;
              },
              mayCreate(e, t) {
                try {
                  var r = Ft.lookupNode(e, t);
                  return 20;
                } catch (t) {}
                return Ft.nodePermissions(e, "wx");
              },
              mayDelete(e, t, r) {
                var o;
                try {
                  o = Ft.lookupNode(e, t);
                } catch (t) {
                  return t.errno;
                }
                var s = Ft.nodePermissions(e, "wx");
                if (s) return s;
                if (r) {
                  if (!Ft.isDir(o.mode)) return 54;
                  if (Ft.isRoot(o) || Ft.getPath(o) === Ft.cwd()) return 10;
                } else if (Ft.isDir(o.mode)) return 31;
                return 0;
              },
              mayOpen(e, t) {
                return e
                  ? Ft.isLink(e.mode)
                    ? 32
                    : Ft.isDir(e.mode) &&
                        ("r" !== Ft.flagsToPermissionString(t) || // opening for write
                          512 & t)
                      ? 31
                      : Ft.nodePermissions(e, Ft.flagsToPermissionString(t))
                  : 44;
              },
              MAX_OPEN_FDS: 4096,
              nextfd() {
                for (var e = 0; e <= Ft.MAX_OPEN_FDS; e++) if (!Ft.streams[e]) return e;
                throw new Ft.ErrnoError(33);
              },
              getStreamChecked(e) {
                var t = Ft.getStream(e);
                if (!t) throw new Ft.ErrnoError(8);
                return t;
              },
              getStream: (e) => Ft.streams[e],
              createStream(e, t = -1) {
                return (
                  d(-1 <= t),
                  (e = Object.assign(new Ft.FSStream(), e)),
                  -1 == t && (t = Ft.nextfd()),
                  (e.fd = t),
                  (Ft.streams[t] = e),
                  e
                );
              },
              closeStream(e) {
                Ft.streams[e] = null;
              },
              dupStream(e, t = -1) {
                var r = Ft.createStream(e, t);
                return (r.stream_ops?.dup?.(r), r);
              },
              chrdev_stream_ops: {
                open(e) {
                  var t = Ft.getDevice(e.node.rdev); // override node's stream ops with the device's
                  ((e.stream_ops = t.stream_ops), e.stream_ops.open?.(e));
                },
                llseek() {
                  throw new Ft.ErrnoError(70);
                },
              },
              major: (e) => e >> 8,
              minor: (e) => 255 & e,
              makedev: (e, t) => (e << 8) | t,
              registerDevice(e, t) {
                Ft.devices[e] = { stream_ops: t };
              },
              getDevice: (e) => Ft.devices[e],
              getMounts(e) {
                for (var t = [], r = [e], o; r.length;)
                  ((o = r.pop()), t.push(o), r.push(...o.mounts));
                return t;
              },
              syncfs(e, t) {
                function r(e) {
                  return (d(0 < Ft.syncFSRequests), Ft.syncFSRequests--, t(e));
                }
                function o(e) {
                  return e
                    ? o.errored
                      ? void 0
                      : ((o.errored = !0), r(e))
                    : void (++n >= s.length && r(null));
                }
                ("function" == typeof e && ((t = e), (e = !1)),
                  Ft.syncFSRequests++,
                  1 < Ft.syncFSRequests &&
                    we(
                      `warning: ${Ft.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`,
                    ));
                var s = Ft.getMounts(Ft.root.mount),
                  n = 0;
                s.forEach((t) => (t.type.syncfs ? void t.type.syncfs(t, e, o) : o(null)));
              },
              mount(e, t, r) {
                if ("string" == typeof e)
                  // The filesystem was not included, and instead we have an error
                  // message stored in the variable.
                  throw e;
                var o = "/" === r,
                  s = !r,
                  n;
                if (o && Ft.root) throw new Ft.ErrnoError(10);
                else if (!o && !s) {
                  var a = Ft.lookupPath(r, { follow_mount: !1 });
                  if (((r = a.path), (n = a.node), Ft.isMountpoint(n))) throw new Ft.ErrnoError(10);
                  if (!Ft.isDir(n.mode)) throw new Ft.ErrnoError(54);
                }
                var i = { type: e, opts: t, mountpoint: r, mounts: [] },
                  l = e.mount(i); // create a root node for the fs
                return (
                  (l.mount = i),
                  (i.root = l),
                  o ? (Ft.root = l) : n && ((n.mounted = i), n.mount && n.mount.mounts.push(i)),
                  l
                );
              },
              unmount(e) {
                var t = Ft.lookupPath(e, { follow_mount: !1 });
                if (!Ft.isMountpoint(t.node)) throw new Ft.ErrnoError(28); // destroy the nodes for this mount, and all its child mounts
                var r = t.node,
                  o = r.mounted,
                  s = Ft.getMounts(o);
                (Object.keys(Ft.nameTable).forEach((e) => {
                  for (var t = Ft.nameTable[e], r; t;)
                    ((r = t.name_next), s.includes(t.mount) && Ft.destroyNode(t), (t = r));
                }),
                  (r.mounted = null)); // remove this mount from the child mounts
                var n = r.mount.mounts.indexOf(o);
                (d(-1 !== n), r.mount.mounts.splice(n, 1));
              },
              lookup(e, t) {
                return e.node_ops.lookup(e, t);
              },
              mknod(e, t, r) {
                var o = Ft.lookupPath(e, { parent: !0 }),
                  s = o.node,
                  n = dt.basename(e);
                if (!n || "." === n || ".." === n) throw new Ft.ErrnoError(28);
                var a = Ft.mayCreate(s, n);
                if (a) throw new Ft.ErrnoError(a);
                if (!s.node_ops.mknod) throw new Ft.ErrnoError(63);
                return s.node_ops.mknod(s, n, t, r);
              },
              create(e, t) {
                return (
                  (t = void 0 === t ? 438 : t) /* 0666 */,
                  (t &= 4095),
                  (t |= 32768),
                  Ft.mknod(e, t, 0)
                );
              },
              mkdir(e, t) {
                return (
                  (t = void 0 === t ? 511 : t) /* 0777 */,
                  (t &= 1023),
                  (t |= 16384),
                  Ft.mknod(e, t, 0)
                );
              },
              mkdirTree(e, t) {
                for (var r = e.split("/"), o = "", s = 0; s < r.length; ++s)
                  if (r[s]) {
                    o += "/" + r[s];
                    try {
                      Ft.mkdir(o, t);
                    } catch (t) {
                      if (20 != t.errno) throw t;
                    }
                  }
              },
              mkdev(e, t, r) {
                return (
                  "undefined" == typeof r && ((r = t), (t = 438)) /* 0666 */,
                  (t |= 8192),
                  Ft.mknod(e, t, r)
                );
              },
              symlink(e, t) {
                if (!ut.resolve(e)) throw new Ft.ErrnoError(44);
                var r = Ft.lookupPath(t, { parent: !0 }),
                  o = r.node;
                if (!o) throw new Ft.ErrnoError(44);
                var s = dt.basename(t),
                  n = Ft.mayCreate(o, s);
                if (n) throw new Ft.ErrnoError(n);
                if (!o.node_ops.symlink) throw new Ft.ErrnoError(63);
                return o.node_ops.symlink(o, s, e);
              },
              rename(e, t) {
                var r = dt.dirname(e),
                  o = dt.dirname(t),
                  s = dt.basename(e),
                  n = dt.basename(t),
                  a,
                  i,
                  l; // parents must exist
                // let the errors from non existent directories percolate up
                if (
                  ((a = Ft.lookupPath(e, { parent: !0 })),
                  (i = a.node),
                  (a = Ft.lookupPath(t, { parent: !0 })),
                  (l = a.node),
                  !i || !l)
                )
                  throw new Ft.ErrnoError(44); // need to be part of the same mount
                if (i.mount !== l.mount) throw new Ft.ErrnoError(75); // source must exist
                var p = Ft.lookupNode(i, s),
                  d = ut.relative(e, o); // old path should not be an ancestor of the new path
                if ("." !== d.charAt(0)) throw new Ft.ErrnoError(28); // new path should not be an ancestor of the old path
                if (((d = ut.relative(t, r)), "." !== d.charAt(0))) throw new Ft.ErrnoError(55); // see if the new path already exists
                var c;
                try {
                  c = Ft.lookupNode(l, n);
                } catch (t) {
                  // not fatal
                } // early out if nothing needs to change
                if (p !== c) {
                  // we'll need to delete the old entry
                  var m = Ft.isDir(p.mode),
                    u = Ft.mayDelete(i, s, m);
                  if (u) throw new Ft.ErrnoError(u); // need delete permissions if we'll be overwriting.
                  // need create permissions if new doesn't already exist.
                  if (((u = c ? Ft.mayDelete(l, n, m) : Ft.mayCreate(l, n)), u))
                    throw new Ft.ErrnoError(u);
                  if (!i.node_ops.rename) throw new Ft.ErrnoError(63);
                  if (Ft.isMountpoint(p) || (c && Ft.isMountpoint(c))) throw new Ft.ErrnoError(10); // if we are going to change the parent, check write permissions
                  if (l !== i && ((u = Ft.nodePermissions(i, "w")), u)) throw new Ft.ErrnoError(u); // remove the node from the lookup hash
                  Ft.hashRemoveNode(p); // do the underlying fs rename
                  try {
                    (i.node_ops.rename(p, l, n), (p.parent = l));
                  } catch (t) {
                    throw t;
                  } finally {
                    Ft.hashAddNode(p);
                  }
                }
              },
              rmdir(e) {
                var t = Ft.lookupPath(e, { parent: !0 }),
                  r = t.node,
                  o = dt.basename(e),
                  s = Ft.lookupNode(r, o),
                  n = Ft.mayDelete(r, o, !0);
                if (n) throw new Ft.ErrnoError(n);
                if (!r.node_ops.rmdir) throw new Ft.ErrnoError(63);
                if (Ft.isMountpoint(s)) throw new Ft.ErrnoError(10);
                (r.node_ops.rmdir(r, o), Ft.destroyNode(s));
              },
              readdir(e) {
                var t = Ft.lookupPath(e, { follow: !0 }),
                  r = t.node;
                if (!r.node_ops.readdir) throw new Ft.ErrnoError(54);
                return r.node_ops.readdir(r);
              },
              unlink(e) {
                var t = Ft.lookupPath(e, { parent: !0 }),
                  r = t.node;
                if (!r) throw new Ft.ErrnoError(44);
                var o = dt.basename(e),
                  s = Ft.lookupNode(r, o),
                  n = Ft.mayDelete(r, o, !1);
                if (n)
                  // According to POSIX, we should map EISDIR to EPERM, but
                  // we instead do what Linux does (and we must, as we use
                  // the musl linux libc).
                  throw new Ft.ErrnoError(n);
                if (!r.node_ops.unlink) throw new Ft.ErrnoError(63);
                if (Ft.isMountpoint(s)) throw new Ft.ErrnoError(10);
                (r.node_ops.unlink(r, o), Ft.destroyNode(s));
              },
              readlink(e) {
                var t = Ft.lookupPath(e),
                  r = t.node;
                if (!r) throw new Ft.ErrnoError(44);
                if (!r.node_ops.readlink) throw new Ft.ErrnoError(28);
                return ut.resolve(Ft.getPath(r.parent), r.node_ops.readlink(r));
              },
              stat(e, t) {
                var r = Ft.lookupPath(e, { follow: !t }),
                  o = r.node;
                if (!o) throw new Ft.ErrnoError(44);
                if (!o.node_ops.getattr) throw new Ft.ErrnoError(63);
                return o.node_ops.getattr(o);
              },
              lstat(e) {
                return Ft.stat(e, !0);
              },
              chmod(e, t, r) {
                var o;
                if ("string" == typeof e) {
                  var s = Ft.lookupPath(e, { follow: !r });
                  o = s.node;
                } else o = e;
                if (!o.node_ops.setattr) throw new Ft.ErrnoError(63);
                o.node_ops.setattr(o, {
                  mode: (4095 & t) | (-4096 & o.mode),
                  timestamp: Date.now(),
                });
              },
              lchmod(e, t) {
                Ft.chmod(e, t, !0);
              },
              fchmod(e, t) {
                var r = Ft.getStreamChecked(e);
                Ft.chmod(r.node, t);
              },
              chown(e, t, r, o) {
                var s;
                if ("string" == typeof e) {
                  var n = Ft.lookupPath(e, { follow: !o });
                  s = n.node;
                } else s = e;
                if (!s.node_ops.setattr) throw new Ft.ErrnoError(63);
                s.node_ops.setattr(s, {
                  timestamp: Date.now(), // we ignore the uid / gid for now
                });
              },
              lchown(e, t, r) {
                Ft.chown(e, t, r, !0);
              },
              fchown(e, t, r) {
                var o = Ft.getStreamChecked(e);
                Ft.chown(o.node, t, r);
              },
              truncate(e, t) {
                if (0 > t) throw new Ft.ErrnoError(28);
                var r;
                if ("string" == typeof e) {
                  var o = Ft.lookupPath(e, { follow: !0 });
                  r = o.node;
                } else r = e;
                if (!r.node_ops.setattr) throw new Ft.ErrnoError(63);
                if (Ft.isDir(r.mode)) throw new Ft.ErrnoError(31);
                if (!Ft.isFile(r.mode)) throw new Ft.ErrnoError(28);
                var s = Ft.nodePermissions(r, "w");
                if (s) throw new Ft.ErrnoError(s);
                r.node_ops.setattr(r, { size: t, timestamp: Date.now() });
              },
              ftruncate(e, t) {
                var r = Ft.getStreamChecked(e);
                if (0 == (2097155 & r.flags)) throw new Ft.ErrnoError(28);
                Ft.truncate(r.node, t);
              },
              utime(e, t, r) {
                var o = Ft.lookupPath(e, { follow: !0 }),
                  n = o.node;
                n.node_ops.setattr(n, { timestamp: s(t, r) });
              },
              open(e, t, r) {
                if ("" === e) throw new Ft.ErrnoError(44);
                ((t = "string" == typeof t ? Mt(t) : t),
                  64 & t
                    ? ((r = "undefined" == typeof r ? 438 /* 0666 */ : r), (r = 32768 | (4095 & r)))
                    : (r = 0));
                var o;
                if ("object" == typeof e) o = e;
                else {
                  e = dt.normalize(e);
                  try {
                    var s = Ft.lookupPath(e, { follow: !(131072 & t) });
                    o = s.node;
                  } catch (t) {
                    // ignore
                  }
                } // perhaps we need to create the node
                var n = !1;
                if (64 & t)
                  if (!o) ((o = Ft.mknod(e, r, 0)), (n = !0));
                  else // if O_CREAT and O_EXCL are set, error out if the node already exists
                  if (128 & t) throw new Ft.ErrnoError(20);
                if (!o) throw new Ft.ErrnoError(44); // can't truncate a device
                // if asked only for a directory, then this must be one
                if ((Ft.isChrdev(o.mode) && (t &= -513), 65536 & t && !Ft.isDir(o.mode)))
                  throw new Ft.ErrnoError(54); // check permissions, if this is not a file we just created now (it is ok to
                // create and write to a file with read-only permissions; it is read-only
                // for later use)
                if (!n) {
                  var a = Ft.mayOpen(o, t);
                  if (a) throw new Ft.ErrnoError(a);
                } // do truncation if necessary
                (512 & t && !n && Ft.truncate(o, 0), (t &= -131713)); // register the stream with the filesystem
                var i = Ft.createStream({
                  node: o,
                  path: Ft.getPath(o), // we want the absolute path to the node
                  flags: t,
                  seekable: !0,
                  position: 0,
                  stream_ops: o.stream_ops, // used by the file family libc calls (fopen, fwrite, ferror, etc.)
                  ungotten: [],
                  error: !1,
                }); // call the new stream's open function
                return (
                  i.stream_ops.open && i.stream_ops.open(i),
                  !ae.logReadFiles || 1 & t || e in Ft.readFiles || (Ft.readFiles[e] = 1),
                  i
                );
              },
              close(e) {
                if (Ft.isClosed(e)) throw new Ft.ErrnoError(8);
                e.getdents && (e.getdents = null); // free readdir state
                try {
                  e.stream_ops.close && e.stream_ops.close(e);
                } catch (t) {
                  throw t;
                } finally {
                  Ft.closeStream(e.fd);
                }
                e.fd = null;
              },
              isClosed(e) {
                return null === e.fd;
              },
              llseek(e, t, r) {
                if (Ft.isClosed(e)) throw new Ft.ErrnoError(8);
                if (!e.seekable || !e.stream_ops.llseek) throw new Ft.ErrnoError(70);
                if (0 != r && 1 != r && 2 != r) throw new Ft.ErrnoError(28);
                return ((e.position = e.stream_ops.llseek(e, t, r)), (e.ungotten = []), e.position);
              },
              read(e, t, r, o, s) {
                if ((d(0 <= r), 0 > o || 0 > s)) throw new Ft.ErrnoError(28);
                if (Ft.isClosed(e)) throw new Ft.ErrnoError(8);
                if (1 == (2097155 & e.flags)) throw new Ft.ErrnoError(8);
                if (Ft.isDir(e.node.mode)) throw new Ft.ErrnoError(31);
                if (!e.stream_ops.read) throw new Ft.ErrnoError(28);
                var n = "undefined" != typeof s;
                if (!n) s = e.position;
                else if (!e.seekable) throw new Ft.ErrnoError(70);
                var a = e.stream_ops.read(e, t, r, o, s);
                return (n || (e.position += a), a);
              },
              write(e, t, r, o, s, n) {
                if ((d(0 <= r), 0 > o || 0 > s)) throw new Ft.ErrnoError(28);
                if (Ft.isClosed(e)) throw new Ft.ErrnoError(8);
                if (0 == (2097155 & e.flags)) throw new Ft.ErrnoError(8);
                if (Ft.isDir(e.node.mode)) throw new Ft.ErrnoError(31);
                if (!e.stream_ops.write) throw new Ft.ErrnoError(28);
                e.seekable && 1024 & e.flags && Ft.llseek(e, 0, 2);
                var a = "undefined" != typeof s;
                if (!a) s = e.position;
                else if (!e.seekable) throw new Ft.ErrnoError(70);
                var i = e.stream_ops.write(e, t, r, o, s, n);
                return (a || (e.position += i), i);
              },
              allocate(e, t, r) {
                if (Ft.isClosed(e)) throw new Ft.ErrnoError(8);
                if (0 > t || 0 >= r) throw new Ft.ErrnoError(28);
                if (0 == (2097155 & e.flags)) throw new Ft.ErrnoError(8);
                if (!Ft.isFile(e.node.mode) && !Ft.isDir(e.node.mode)) throw new Ft.ErrnoError(43);
                if (!e.stream_ops.allocate) throw new Ft.ErrnoError(138);
                e.stream_ops.allocate(e, t, r);
              },
              mmap(e, t, r, o, s) {
                // User requests writing to file (prot & PROT_WRITE != 0).
                // Checking if we have permissions to write to the file unless
                // MAP_PRIVATE flag is set. According to POSIX spec it is possible
                // to write to file opened in read-only mode with MAP_PRIVATE flag,
                // as all modifications will be visible only in the memory of
                // the current process.
                if (0 != (2 & o) && 0 == (2 & s) && 2 != (2097155 & e.flags))
                  throw new Ft.ErrnoError(2);
                if (1 == (2097155 & e.flags)) throw new Ft.ErrnoError(2);
                if (!e.stream_ops.mmap) throw new Ft.ErrnoError(43);
                if (!t) throw new Ft.ErrnoError(28);
                return e.stream_ops.mmap(e, t, r, o, s);
              },
              msync(e, t, r, o, s) {
                return (d(0 <= r), e.stream_ops.msync ? e.stream_ops.msync(e, t, r, o, s) : 0);
              },
              ioctl(e, t, r) {
                if (!e.stream_ops.ioctl) throw new Ft.ErrnoError(59);
                return e.stream_ops.ioctl(e, t, r);
              },
              readFile(e, t = {}) {
                if (
                  ((t.flags = t.flags || 0),
                  (t.encoding = t.encoding || "binary"),
                  "utf8" !== t.encoding && "binary" !== t.encoding)
                )
                  throw new Error(`Invalid encoding type "${t.encoding}"`);
                var r = Ft.open(e, t.flags),
                  o = Ft.stat(e),
                  s = o.size,
                  n = new Uint8Array(s),
                  a;
                return (
                  Ft.read(r, n, 0, s, 0),
                  "utf8" === t.encoding ? (a = st(n)) : "binary" === t.encoding && (a = n),
                  Ft.close(r),
                  a
                );
              },
              writeFile(e, t, r = {}) {
                r.flags = r.flags || 577;
                var o = Ft.open(e, r.flags, r.mode);
                if ("string" == typeof t) {
                  var s = new Uint8Array(gt(t) + 1),
                    n = _t(t, s, 0, s.length);
                  Ft.write(o, s, 0, n, void 0, r.canOwn);
                } else if (ArrayBuffer.isView(t)) Ft.write(o, t, 0, t.byteLength, void 0, r.canOwn);
                else throw new Error("Unsupported data type");
                Ft.close(o);
              },
              cwd: () => Ft.currentPath,
              chdir(e) {
                var t = Ft.lookupPath(e, { follow: !0 });
                if (null === t.node) throw new Ft.ErrnoError(44);
                if (!Ft.isDir(t.node.mode)) throw new Ft.ErrnoError(54);
                var r = Ft.nodePermissions(t.node, "x");
                if (r) throw new Ft.ErrnoError(r);
                Ft.currentPath = t.path;
              },
              createDefaultDirectories() {
                (Ft.mkdir("/tmp"), Ft.mkdir("/home"), Ft.mkdir("/home/web_user"));
              },
              createDefaultDevices() {
                (Ft.mkdir("/dev"),
                  Ft.registerDevice(Ft.makedev(1, 3), {
                    read: () => 0,
                    write: (e, t, r, o, s) => o,
                  }),
                  Ft.mkdev("/dev/null", Ft.makedev(1, 3)),
                  Pt.register(Ft.makedev(5, 0), Pt.default_tty_ops),
                  Pt.register(Ft.makedev(6, 0), Pt.default_tty1_ops),
                  Ft.mkdev("/dev/tty", Ft.makedev(5, 0)),
                  Ft.mkdev("/dev/tty1", Ft.makedev(6, 0))); // setup /dev/[u]random
                // use a buffer to avoid overhead of individual crypto calls per byte
                var e = new Uint8Array(1024),
                  t = 0,
                  r = () => (0 === t && (t = mt(e).byteLength), e[--t]);
                (Ft.createDevice("/dev", "random", r),
                  Ft.createDevice("/dev", "urandom", r),
                  Ft.mkdir("/dev/shm"),
                  Ft.mkdir("/dev/shm/tmp"));
              },
              createSpecialDirectories() {
                Ft.mkdir("/proc");
                var e = Ft.mkdir("/proc/self");
                (Ft.mkdir("/proc/self/fd"),
                  Ft.mount(
                    {
                      mount() {
                        var t = Ft.createNode(e, "fd", 16895 /* 0777 */, 73);
                        return (
                          (t.node_ops = {
                            lookup(e, t) {
                              var r = +t,
                                o = Ft.getStreamChecked(r),
                                s = {
                                  parent: null,
                                  mount: { mountpoint: "fake" },
                                  node_ops: { readlink: () => o.path },
                                }; // make it look like a simple root node
                              return ((s.parent = s), s);
                            },
                          }),
                          t
                        );
                      },
                    },
                    {},
                    "/proc/self/fd",
                  ));
              },
              createStandardStreams(e, t, r) {
                (e ? Ft.createDevice("/dev", "stdin", e) : Ft.symlink("/dev/tty", "/dev/stdin"),
                  t
                    ? Ft.createDevice("/dev", "stdout", null, t)
                    : Ft.symlink("/dev/tty", "/dev/stdout"),
                  r
                    ? Ft.createDevice("/dev", "stderr", null, r)
                    : Ft.symlink("/dev/tty1", "/dev/stderr")); // open default streams for the stdin, stdout and stderr devices
                var o = Ft.open("/dev/stdin", 0),
                  s = Ft.open("/dev/stdout", 1),
                  n = Ft.open("/dev/stderr", 1);
                (d(0 === o.fd, `invalid handle for stdin (${o.fd})`),
                  d(1 === s.fd, `invalid handle for stdout (${s.fd})`),
                  d(2 === n.fd, `invalid handle for stderr (${n.fd})`));
              },
              staticInit() {
                ([44].forEach((e) => {
                  ((Ft.genericErrors[e] = new Ft.ErrnoError(e)),
                    (Ft.genericErrors[e].stack = "<generic error, no stack>"));
                }),
                  (Ft.nameTable = Array(4096)),
                  Ft.mount(bt, {}, "/"),
                  Ft.createDefaultDirectories(),
                  Ft.createDefaultDevices(),
                  Ft.createSpecialDirectories(),
                  (Ft.filesystems = { MEMFS: bt }));
              },
              init(e, t, r) {
                (d(
                  !Ft.initialized,
                  "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)",
                ),
                  (Ft.initialized = !0),
                  (e ??= ae.stdin),
                  (t ??= ae.stdout),
                  (r ??= ae.stderr),
                  Ft.createStandardStreams(e, t, r));
              },
              quit() {
                ((Ft.initialized = !1), fo(0)); // close all of our streams
                for (var e = 0, t; e < Ft.streams.length; e++)
                  ((t = Ft.streams[e]), !!t) && Ft.close(t);
              },
              findObject(e, t) {
                var r = Ft.analyzePath(e, t);
                return r.exists ? r.object : null;
              },
              analyzePath(e, t) {
                // operate from within the context of the symlink's target
                try {
                  var r = Ft.lookupPath(e, { follow: !t });
                  e = r.path;
                } catch (t) {}
                var o = {
                  isRoot: !1,
                  exists: !1,
                  error: 0,
                  name: null,
                  path: null,
                  object: null,
                  parentExists: !1,
                  parentPath: null,
                  parentObject: null,
                };
                try {
                  var r = Ft.lookupPath(e, { parent: !0 });
                  ((o.parentExists = !0),
                    (o.parentPath = r.path),
                    (o.parentObject = r.node),
                    (o.name = dt.basename(e)),
                    (r = Ft.lookupPath(e, { follow: !t })),
                    (o.exists = !0),
                    (o.path = r.path),
                    (o.object = r.node),
                    (o.name = r.node.name),
                    (o.isRoot = "/" === r.path));
                } catch (t) {
                  o.error = t.errno;
                }
                return o;
              },
              createPath(e, t, r, o) {
                e = "string" == typeof e ? e : Ft.getPath(e);
                for (var s = t.split("/").reverse(), n; s.length;)
                  if (((n = s.pop()), n)) {
                    var a = dt.join2(e, n);
                    try {
                      Ft.mkdir(a);
                    } catch (t) {
                      // ignore EEXIST
                    }
                    e = a;
                  }
                return a;
              },
              createFile(e, t, r, o, s) {
                var n = dt.join2("string" == typeof e ? e : Ft.getPath(e), t),
                  a = It(o, s);
                return Ft.create(n, a);
              },
              createDataFile(e, t, r, o, s, n) {
                var a = t;
                e && ((e = "string" == typeof e ? e : Ft.getPath(e)), (a = t ? dt.join2(e, t) : e));
                var l = It(o, s),
                  p = Ft.create(a, l);
                if (r) {
                  if ("string" == typeof r) {
                    for (var d = Array(r.length), c = 0, m = r.length; c < m; ++c)
                      d[c] = r.charCodeAt(c);
                    r = d;
                  } // make sure we can write to the file
                  Ft.chmod(p, 146 | l);
                  var u = Ft.open(p, 577);
                  (Ft.write(u, r, 0, r.length, 0, n), Ft.close(u), Ft.chmod(p, l));
                }
              },
              createDevice(e, t, r, o) {
                var s = dt.join2("string" == typeof e ? e : Ft.getPath(e), t),
                  n = It(!!r, !!o);
                Ft.createDevice.major ??= 64;
                var a = Ft.makedev(Ft.createDevice.major++, 0); // Create a fake device that a set of stream ops to emulate
                // the old behavior.
                return (
                  Ft.registerDevice(a, {
                    open(e) {
                      e.seekable = !1;
                    },
                    close(e) {
                      o?.buffer?.length && o(10);
                    },
                    read(e, t, o, s, n /* ignored */) {
                      for (var a = 0, l = 0; l < s; l++) {
                        var p;
                        try {
                          p = r();
                        } catch (t) {
                          throw new Ft.ErrnoError(29);
                        }
                        if (void 0 === p && 0 === a) throw new Ft.ErrnoError(6);
                        if (null === p || void 0 === p) break;
                        (a++, (t[o + l] = p));
                      }
                      return (a && (e.node.timestamp = Date.now()), a);
                    },
                    write(e, t, r, s, n) {
                      for (var a = 0; a < s; a++)
                        try {
                          o(t[r + a]);
                        } catch (t) {
                          throw new Ft.ErrnoError(29);
                        }
                      return (s && (e.node.timestamp = Date.now()), a);
                    },
                  }),
                  Ft.mkdev(s, n, a)
                );
              },
              forceLoadFile(e) {
                if (e.isDevice || e.isFolder || e.link || e.contents) return !0;
                if ("undefined" != typeof XMLHttpRequest)
                  throw new Error(
                    "Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.",
                  );
                else
                  // Command-line.
                  try {
                    ((e.contents = he(e.url)), (e.usedBytes = e.contents.length));
                  } catch (t) {
                    throw new Ft.ErrnoError(29);
                  }
              },
              createLazyFile(e, t, r, o, s) {
                function n(e, t, r, o, s) {
                  var n = e.node.contents;
                  if (s >= n.length) return 0;
                  var l = a(n.length - s, o);
                  if ((d(0 <= l), n.slice))
                    // normal array
                    for (var p = 0; p < l; p++) t[r + p] = n[s + p];
                  else
                    for (var p = 0; p < l; p++)
                      // LazyUint8Array from sync binary XHR
                      t[r + p] = n.get(s + p);
                  return l;
                } // use a custom read function
                // Lazy chunked Uint8Array (implements get and length from Uint8Array).
                // Actual getting is abstracted away for eventual reuse.
                class i {
                  constructor() {
                    ((this.lengthKnown = !1), (this.chunks = []));
                  }
                  get(e) {
                    if (!(e > this.length - 1 || 0 > e)) {
                      var t = e % this.chunkSize,
                        r = 0 | (e / this.chunkSize);
                      return this.getter(r)[t];
                    }
                  }
                  setDataGetter(e) {
                    this.getter = e;
                  }
                  cacheLength() {
                    // Find length
                    var e = new XMLHttpRequest();
                    if (
                      (e.open("HEAD", r, !1),
                      e.send(null),
                      !((200 <= e.status && 300 > e.status) || 304 === e.status))
                    )
                      throw new Error("Couldn't load " + r + ". Status: " + e.status);
                    var t = +e.getResponseHeader("Content-length"),
                      o = (i = e.getResponseHeader("Accept-Ranges")) && "bytes" === i,
                      s = (i = e.getResponseHeader("Content-Encoding")) && "gzip" === i,
                      n = 1048576,
                      i;
                    o || (n = t); // Function to get a range from the remote URL.
                    var l = (e, o) => {
                        if (e > o)
                          throw new Error(
                            "invalid range (" + e + ", " + o + ") or no bytes requested!",
                          );
                        if (o > t - 1)
                          throw new Error("only " + t + " bytes available! programmer error!"); // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
                        var s = new XMLHttpRequest();
                        if (
                          (s.open("GET", r, !1),
                          t !== n && s.setRequestHeader("Range", "bytes=" + e + "-" + o),
                          (s.responseType = "arraybuffer"),
                          s.overrideMimeType &&
                            s.overrideMimeType("text/plain; charset=x-user-defined"),
                          s.send(null),
                          !((200 <= s.status && 300 > s.status) || 304 === s.status))
                        )
                          throw new Error("Couldn't load " + r + ". Status: " + s.status);
                        return void 0 === s.response
                          ? $(s.responseText || "", !0)
                          : new Uint8Array(/** @type{Array<number>} */ s.response || []);
                      },
                      p = this;
                    (p.setDataGetter((e) => {
                      var r = e * n,
                        o = (e + 1) * n - 1; // including this byte
                      if (
                        ((o = a(o, t - 1)),
                        "undefined" == typeof p.chunks[e] && (p.chunks[e] = l(r, o)),
                        "undefined" == typeof p.chunks[e])
                      )
                        throw new Error("doXHR failed!");
                      return p.chunks[e];
                    }),
                      (s || !t) &&
                        ((n = t = 1),
                        (t = this.getter(0).length),
                        (n = t),
                        Ee(
                          "LazyFiles on gzip forces download of the whole file when length is accessed",
                        )),
                      (this._length = t),
                      (this._chunkSize = n),
                      (this.lengthKnown = !0));
                  }
                  get length() {
                    return (this.lengthKnown || this.cacheLength(), this._length);
                  }
                  get chunkSize() {
                    return (this.lengthKnown || this.cacheLength(), this._chunkSize);
                  }
                }
                if ("undefined" != typeof XMLHttpRequest) {
                  if (!me)
                    throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
                  var l = new i(),
                    p = { isDevice: !1, contents: l };
                } else var p = { isDevice: !1, url: r };
                var c = Ft.createFile(e, t, p, o, s); // This is a total hack, but I want to get this lazy file code out of the
                // core of MEMFS. If we want to keep this lazy file concept I feel it should
                // be its own thin LAZYFS proxying calls to MEMFS.
                (p.contents
                  ? (c.contents = p.contents)
                  : p.url && ((c.contents = null), (c.url = p.url)),
                  Object.defineProperties(c, {
                    usedBytes: {
                      get: function () {
                        return this.contents.length;
                      },
                    },
                  })); // override each stream op with one that tries to force load the lazy file first
                var m = {},
                  u = Object.keys(c.stream_ops);
                return (
                  u.forEach((e) => {
                    var t = c.stream_ops[e];
                    m[e] = (...e) => (Ft.forceLoadFile(c), t(...e));
                  }),
                  (m.read = (e, t, r, o, s) => (Ft.forceLoadFile(c), n(e, t, r, o, s))),
                  (m.mmap = (e, t, r, o, s) => {
                    Ft.forceLoadFile(c);
                    var a = ht(t);
                    if (!a) throw new Ft.ErrnoError(48);
                    return (n(e, Fe, a, t, r), { ptr: a, allocated: !0 });
                  }),
                  (c.stream_ops = m),
                  c
                );
              },
              absolutePath() {
                S("FS.absolutePath has been removed; use PATH_FS.resolve instead");
              },
              createFolder() {
                S("FS.createFolder has been removed; use FS.mkdir instead");
              },
              createLink() {
                S("FS.createLink has been removed; use FS.symlink instead");
              },
              joinPath() {
                S("FS.joinPath has been removed; use PATH.join instead");
              },
              mmapAlloc() {
                S("FS.mmapAlloc has been replaced by the top level function mmapAlloc");
              },
              standardizePath() {
                S("FS.standardizePath has been removed; use PATH.normalize instead");
              },
            },
            Vt = {
              DEFAULT_POLLMASK: 5,
              calculateAt(e, t, r) {
                if (dt.isAbs(t)) return t; // relative path
                var o;
                if (-100 === e) o = Ft.cwd();
                else {
                  var s = Vt.getStreamFromFD(e);
                  o = s.path;
                }
                if (0 == t.length) {
                  if (!r) throw new Ft.ErrnoError(44);
                  return o;
                }
                return dt.join2(o, t);
              },
              doStat(e, t, r) {
                var s = e(t);
                ((Re[r >> 2] = s.dev),
                  (Re[(r + 4) >> 2] = s.mode),
                  (Oe[(r + 8) >> 2] = s.nlink),
                  (Re[(r + 12) >> 2] = s.uid),
                  (Re[(r + 16) >> 2] = s.gid),
                  (Re[(r + 20) >> 2] = s.rdev),
                  (Ne[(r + 24) >> 3] = BigInt(s.size)),
                  (Re[(r + 32) >> 2] = 4096),
                  (Re[(r + 36) >> 2] = s.blocks));
                var n = s.atime.getTime(),
                  a = s.mtime.getTime(),
                  i = s.ctime.getTime();
                return (
                  (Ne[(r + 40) >> 3] = BigInt(o(n / 1e3))),
                  (Oe[(r + 48) >> 2] = 1e3 * (1e3 * (n % 1e3))),
                  (Ne[(r + 56) >> 3] = BigInt(o(a / 1e3))),
                  (Oe[(r + 64) >> 2] = 1e3 * (1e3 * (a % 1e3))),
                  (Ne[(r + 72) >> 3] = BigInt(o(i / 1e3))),
                  (Oe[(r + 80) >> 2] = 1e3 * (1e3 * (i % 1e3))),
                  (Ne[(r + 88) >> 3] = BigInt(s.ino)),
                  0
                );
              },
              doMsync(e, t, r, o, s) {
                if (!Ft.isFile(t.node.mode)) throw new Ft.ErrnoError(43);
                if (2 & o)
                  // MAP_PRIVATE calls need not to be synced back to underlying fs
                  return 0;
                var n = Ve.slice(e, e + r);
                Ft.msync(t, n, s, r, o);
              },
              getStreamFromFD(e) {
                var t = Ft.getStreamChecked(e);
                return t;
              },
              varargs: void 0,
              getStr(e) {
                var t = nt(e);
                return t;
              },
            },
            kt = (e) => {
              if (null === e) return "null";
              var r = typeof e;
              return "object" == r || "array" === r || "function" === r ? e.toString() : "" + e;
            },
            Dt = (e) => {
              for (var t = "", r = e; Ve[r];) t += so[Ve[r++]];
              return t;
            },
            Rt = {},
            Ot = {},
            Ut = {},
            Nt = (e) => {
              throw new no(e);
            },
            Lt = (e) => {
              throw new ao(e);
            },
            $t = (e, t, r) => {
              function o(t) {
                var o = r(t);
                o.length !== e.length && Lt("Mismatched type converter count");
                for (var s = 0; s < e.length; ++s) B(e[s], o[s]);
              }
              e.forEach((e) => (Ut[e] = t));
              var s = Array(t.length),
                n = [],
                a = 0;
              (t.forEach((e, t) => {
                Ot.hasOwnProperty(e)
                  ? (s[t] = Ot[e])
                  : (n.push(e),
                    !Rt.hasOwnProperty(e) && (Rt[e] = []),
                    Rt[e].push(() => {
                      ((s[t] = Ot[e]), ++a, a === n.length && o(s));
                    }));
              }),
                0 === n.length && o(s));
            },
            zt = (e, t, r) => {
              // integers are quite common, so generate very specialized functions
              switch (t) {
                case 1:
                  return r ? (e) => Fe[e] : (e) => Ve[e];
                case 2:
                  return r ? (e) => ke[e >> 1] : (e) => De[e >> 1];
                case 4:
                  return r ? (e) => Re[e >> 2] : (e) => Oe[e >> 2];
                case 8:
                  return r ? (e) => Ne[e >> 3] : (e) => Le[e >> 3];
                default:
                  throw new TypeError(`invalid integer width (${t}): ${e}`);
              }
            },
            Bt = 8,
            Wt = (e) => ({
              count: e.count,
              deleteScheduled: e.deleteScheduled,
              preservePointerOnDelete: e.preservePointerOnDelete,
              ptr: e.ptr,
              ptrType: e.ptrType,
              smartPtr: e.smartPtr,
              smartPtrType: e.smartPtrType,
            }),
            Ht = (e) => {
              function t(e) {
                return e.$$.ptrType.registeredClass.name;
              }
              Nt(t(e) + " instance already deleted");
            },
            Gt = !1,
            jt = (e) => {},
            Yt = (e) => {
              e.smartPtr
                ? e.smartPtrType.rawDestructor(e.smartPtr)
                : e.ptrType.registeredClass.rawDestructor(e.ptr);
            },
            Xt = (e) => {
              e.count.value -= 1;
              var t = 0 === e.count.value;
              t && Yt(e);
            },
            Qt = (e, t, r) => {
              if (t === r) return e;
              if (void 0 === r.baseClass) return null; // no conversion
              var o = Qt(e, t, r.baseClass);
              return null === o ? null : r.downcast(o);
            },
            Kt = {},
            qt = {},
            Jt = (e, t) => {
              for (void 0 === t && Nt("ptr should not be undefined"); e.baseClass;)
                ((t = e.upcast(t)), (e = e.baseClass));
              return t;
            },
            Zt = (e, t) => ((t = Jt(e, t)), qt[t]),
            er = (e, t) => {
              (t.ptrType && t.ptr) || Lt("makeClassHandle requires ptr and ptrType");
              var r = !!t.smartPtrType,
                o = !!t.smartPtr;
              return (
                r !== o && Lt("Both smartPtrType and smartPtr must be specified"),
                (t.count = { value: 1 }),
                tr(Object.create(e, { $$: { value: t, writable: !0 } }))
              );
            },
            tr = (e) =>
              "undefined" == typeof FinalizationRegistry
                ? ((tr = (e) => e), e)
                : ((Gt = new FinalizationRegistry((e) => {
                    (console.warn(e.leakWarning), Xt(e.$$));
                  })),
                  (tr = (e) => {
                    var t = e.$$,
                      r = !!t.smartPtr;
                    if (r) {
                      // We should not call the destructor on raw pointers in case other code expects the pointee to live
                      var o = { $$: t },
                        s = t.ptrType.registeredClass,
                        n = new Error(
                          `Embind found a leaked C++ instance ${s.name} <${tt(t.ptr)}>.\n` +
                            "We'll free it automatically in this case, but this functionality is not reliable across various environments.\nMake sure to invoke .delete() manually once you're done with the instance instead.\nOriginally allocated",
                        ); // Create a warning as an Error instance in advance so that we can store
                      // the current stacktrace and point to it when / if a leak is detected.
                      // This is more useful than the empty stacktrace of `FinalizationRegistry`
                      // callback.
                      ("captureStackTrace" in Error && Error.captureStackTrace(n, W),
                        (o.leakWarning = n.stack.replace(/^Error: /, "")),
                        Gt.register(e, o, e));
                    }
                    return e;
                  }),
                  (jt = (e) => Gt.unregister(e)),
                  tr(e)),
            rr = [],
            or = () => {
              for (; rr.length;) {
                var e = rr.pop();
                ((e.$$.deleteScheduled = !1), e["delete"]());
              }
            },
            sr = (e, t) => Object.defineProperty(t, "name", { value: e }),
            nr = (e, t, r) => {
              if (void 0 === e[t].overloadTable) {
                var o = e[t]; // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
                ((e[t] = function (...o) {
                  return (
                    e[t].overloadTable.hasOwnProperty(o.length) ||
                      Nt(
                        `Function '${r}' called with an invalid number of arguments (${o.length}) - expects one of (${e[t].overloadTable})!`,
                      ),
                    e[t].overloadTable[o.length].apply(this, o)
                  );
                }),
                  (e[t].overloadTable = []),
                  (e[t].overloadTable[o.argCount] = o));
              }
            },
            ar = (e, t, r) => {
              ae.hasOwnProperty(e)
                ? ((void 0 === r ||
                    (void 0 !== ae[e].overloadTable && void 0 !== ae[e].overloadTable[r])) &&
                    Nt(`Cannot register public name '${e}' twice`),
                  nr(ae, e, e),
                  ae.hasOwnProperty(r) &&
                    Nt(
                      `Cannot register multiple overloads of a function with the same number of arguments (${r})!`,
                    ),
                  (ae[e].overloadTable[r] = t))
                : ((ae[e] = t), void 0 !== r && (ae[e].numArguments = r));
            },
            ir = (e) => {
              (d("string" == typeof e), (e = e.replace(/[^a-zA-Z0-9_]/g, "$")));
              var t = e.charCodeAt(0);
              return t >= 48 && t <= 57 ? `_${e}` : e;
            },
            lr = (e, t, r) => {
              for (; t !== r;)
                (t.upcast ||
                  Nt(`Expected null or instance of ${r.name}, got an instance of ${t.name}`),
                  (e = t.upcast(e)),
                  (t = t.baseClass));
              return e;
            },
            pr = (e, t, r) => {
              (ae.hasOwnProperty(e) || Lt("Replacing nonexistent public symbol"),
                void 0 !== ae[e].overloadTable && void 0 !== r
                  ? (ae[e].overloadTable[r] = t)
                  : ((ae[e] = t), (ae[e].argCount = r)));
            },
            dr = [],
            cr = (e) => {
              var t = dr[e];
              return (
                t || (e >= dr.length && (dr.length = e + 1), (dr[e] = t = lo.get(e))),
                d(lo.get(e) == t, "JavaScript-side Wasm function table mirror is out of date!"),
                t
              );
            },
            mr = (e, t) => {
              function r() {
                return cr(t);
              }
              e = Dt(e);
              var o = r();
              return (
                "function" != typeof o && Nt(`unknown function pointer with signature ${e}: ${t}`),
                o
              );
            },
            ur = (e) => {
              var t = go(e),
                r = Dt(t);
              return (_o(t), r);
            },
            yr = (e, t) => {
              function r(e) {
                return s[e] || Ot[e]
                  ? void 0
                  : Ut[e]
                    ? void Ut[e].forEach(r)
                    : void (o.push(e), (s[e] = !0));
              }
              var o = [],
                s = {};
              throw (t.forEach(r), new po(`${e}: ` + o.map(ur).join([", "])));
            },
            gr = (e) => {
              for (; e.length;) {
                var t = e.pop(),
                  r = e.pop();
                r(t);
              }
            },
            _r = (e, t) => {
              for (var r = [], o = 0; o < e; o++)
                // TODO(https://github.com/emscripten-core/emscripten/issues/17310):
                // Find a way to hoist the `>> 2` or `>> 3` out of this loop.
                r.push(Oe[(t + 4 * o) >> 2]);
              return r;
            },
            fr = (e) => {
              e = e.trim();
              const t = e.indexOf("(");
              return -1 === t
                ? e
                : (d(")" == e[e.length - 1], "Parentheses for argument names should match."),
                  e.substr(0, t));
            },
            Pr = (e, t, r) => (
              e instanceof Object || Nt(`${r} with invalid "this": ${e}`),
              e instanceof t.registeredClass.constructor ||
                Nt(`${r} incompatible with "this" of type ${e.constructor.name}`),
              e.$$.ptr || Nt(`cannot call emscripten binding method ${r} on deleted object`),
              lr(e.$$.ptr, e.$$.ptrType.registeredClass, t.registeredClass)
            ),
            Tr = [],
            Cr = [],
            hr = (e) => {
              9 < e &&
                0 == --Cr[e + 1] &&
                (d(void 0 !== Cr[e], `Decref for unallocated handle.`),
                (Cr[e] = void 0),
                Tr.push(e));
            },
            br = () => Cr.length / 2 - 5 - Tr.length,
            Sr = {
              toValue: (e) => (
                e || Nt("Cannot use deleted val. handle = " + e),
                d(2 === e || (void 0 !== Cr[e] && 0 == e % 2), `invalid handle: ${e}`),
                Cr[e]
              ),
              toHandle: (e) => {
                switch (e) {
                  case void 0:
                    return 2;
                  case null:
                    return 4;
                  case !0:
                    return 6;
                  case !1:
                    return 8;
                  default: {
                    const t = Tr.pop() || Cr.length;
                    return ((Cr[t] = e), (Cr[t + 1] = 1), t);
                  }
                }
              },
            },
            Ar = {
              name: "emscripten::val",
              fromWireType: (e) => {
                var t = Sr.toValue(e);
                return (hr(e), t);
              },
              toWireType: (e, t) => Sr.toHandle(t),
              argPackAdvance: Bt,
              readValueFromPointer: Q,
              destructorFunction: null, // This type does not need a destructor
              // TODO: do we need a deleteObject here?  write a test where
              // emval is passed into JS via an interface
            },
            Er = (e, t) => {
              switch (t) {
                case 4:
                  return function (e) {
                    return this.fromWireType(Ue[e >> 2]);
                  };
                case 8:
                  return function (e) {
                    return this.fromWireType($e[e >> 3]);
                  };
                default:
                  throw new TypeError(`invalid float width (${t}): ${e}`);
              }
            },
            wr = Object.assign({ optional: !0 }, Ar),
            Mr = (e, t, r) => (
              d(
                "number" == typeof r,
                "stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!",
              ),
              _t(e, Ve, t, r)
            ),
            Ir = "undefined" == typeof TextDecoder ? void 0 : new TextDecoder("utf-16le"),
            xr = (e, t) => {
              d(0 == e % 2, "Pointer passed to UTF16ToString must be aligned to two bytes!"); // TextDecoder needs to know the byte length in advance, it doesn't stop on
              // null terminator by itself.
              // Also, use the length info to avoid running tiny strings through
              // TextDecoder, since .subarray() allocates garbage.
              // If maxBytesToRead is not passed explicitly, it will be undefined, and this
              // will always evaluate to true. This saves on code size.
              for (var r = e, o = r >> 1, s = o + t / 2; !(o >= s) && De[o];) ++o;
              if (((r = o << 1), 32 < r - e && Ir)) return Ir.decode(Ve.subarray(e, r)); // Fallback: decode without UTF16Decoder
              // If maxBytesToRead is not passed explicitly, it will be undefined, and the
              // for-loop's condition will always evaluate to true. The loop is then
              // terminated on the first null char.
              for (var n = "", a = 0, p; !(a >= t / 2) && ((p = ke[(e + 2 * a) >> 1]), 0 != p); ++a)
                // fromCharCode constructs a character from a UTF-16 code unit, so we can
                // pass the UTF16 string right through.
                n += l(p);
              return n;
            },
            vr = (e, t, r) => {
              if (
                (d(0 == t % 2, "Pointer passed to stringToUTF16 must be aligned to two bytes!"),
                d(
                  "number" == typeof r,
                  "stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!",
                ),
                (r ??= 2147483647),
                2 > r)
              )
                return 0;
              r -= 2;
              for (var o = t, s = r < 2 * e.length ? r / 2 : e.length, n = 0, a; n < s; ++n)
                // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
                // possibly a lead surrogate
                ((a = e.charCodeAt(n)), (ke[t >> 1] = a), (t += 2)); // Null-terminate the pointer to the HEAP.
              return ((ke[t >> 1] = 0), t - o);
            },
            Fr = (e) => 2 * e.length,
            Vr = (e, t) => {
              d(0 == e % 4, "Pointer passed to UTF32ToString must be aligned to four bytes!"); // If maxBytesToRead is not passed explicitly, it will be undefined, and this
              // will always evaluate to true. This saves on code size.
              for (var r = 0, o = "", s; !(r >= t / 4) && ((s = Re[(e + 4 * r) >> 2]), 0 != s);)
                // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
                // See http://unicode.org/faq/utf_bom.html#utf16-3
                if ((++r, 65536 <= s)) {
                  var n = s - 65536;
                  o += l(55296 | (n >> 10), 56320 | (1023 & n));
                } else o += l(s);
              return o;
            },
            kr = (e, t, r) => {
              if (
                (d(0 == t % 4, "Pointer passed to stringToUTF32 must be aligned to four bytes!"),
                d(
                  "number" == typeof r,
                  "stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!",
                ),
                (r ??= 2147483647),
                4 > r)
              )
                return 0;
              for (var o = t, s = o + r - 4, n = 0, a; n < e.length; ++n) {
                // possibly a lead surrogate
                if (((a = e.charCodeAt(n)), 55296 <= a && 57343 >= a)) {
                  var l = e.charCodeAt(++n);
                  a = (65536 + ((1023 & a) << 10)) | (1023 & l);
                }
                if (((Re[t >> 2] = a), (t += 4), t + 4 > s)) break;
              } // Null-terminate the pointer to the HEAP.
              return ((Re[t >> 2] = 0), t - o);
            },
            Dr = (e) => {
              for (var t = 0, r = 0, o; r < e.length; ++r)
                // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
                // See http://unicode.org/faq/utf_bom.html#utf16-3
                // possibly a lead surrogate, so skip over the tail surrogate.
                ((o = e.charCodeAt(r)), 55296 <= o && 57343 >= o && ++r, (t += 4));
              return t;
            },
            Rr = [],
            Or = (e) => {
              var t = Rr.length;
              return (Rr.push(e), t);
            },
            Ur = (e, t) => {
              var r = Ot[e];
              return (void 0 === r && Nt(`${t} has unknown type ${ur(e)}`), r);
            },
            Nr = (e, t) => {
              for (var r = Array(e), o = 0; o < e; ++o)
                r[o] = Ur(Oe[(t + 4 * o) >> 2], "parameter " + o);
              return r;
            },
            Lr = Reflect.construct,
            $r = (e, t, r) => {
              var o = [],
                s = e.toWireType(o, r);
              return (o.length && (Oe[t >> 2] = Sr.toHandle(o)), s);
            },
            zr = (e) => (e < -9007199254740992 || e > 9007199254740992 ? NaN : +e),
            Br = [],
            Wr = (e, t) => {
              (d(Array.isArray(Br)), d(0 == t % 16), (Br.length = 0)); // Most arguments are i32s, so shift the buffer pointer so it is a plain
              // index into HEAP32.
              for (var r; (r = Ve[e++]);) {
                var o = l(r),
                  s = ["d", "f", "i", "p"];
                (s.push("j"),
                  d(
                    s.includes(o),
                    `Invalid character ${r}("${o}") in readEmAsmArgs! Use only [${s}], and do not specify "v" for void return argument.`,
                  )); // Floats are always passed as doubles, so all types except for 'i'
                // are 8 bytes and require alignment.
                var n = 105 != r;
                ((n &= 112 != r),
                  (t += n && t % 8 ? 4 : 0),
                  Br.push(
                    // Special case for pointers under wasm64 or CAN_ADDRESS_2GB mode.
                    112 == r
                      ? Oe[t >> 2]
                      : 106 == r
                        ? Ne[t >> 3]
                        : 105 == r
                          ? Re[t >> 2]
                          : $e[t >> 3],
                  ),
                  (t += n ? 8 : 4));
              }
              return Br;
            },
            Hr = (e, t, r) => {
              var o = Wr(t, r);
              return (
                d(
                  Je.hasOwnProperty(e),
                  `No EM_ASM constant found at address ${e}.  The loaded WebAssembly file is likely out of sync with the generated JavaScript.`,
                ),
                Je[e](...o)
              );
            },
            Gr = () => Ve.length,
            jr = (e) => {
              S(
                `Cannot enlarge memory arrays to size ${e} bytes (OOM). Either (1) compile with -sINITIAL_MEMORY=X with X higher than the current value ${Fe.length}, (2) compile with -sALLOW_MEMORY_GROWTH which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with -sABORTING_MALLOC=0`,
              );
            },
            Yr = (e) => (
              S(
                "Cannot use convertFrameToPC (needed by __builtin_return_address) without -sUSE_OFFSET_CONVERTER",
              ),
              0
            ),
            Xr = {},
            Qr = (e) => {
              e.forEach((e) => {
                var t = Yr(e);
                t && (Xr[t] = e);
              });
            },
            Kr = {},
            qr = () => fe || "./this.program",
            Jr = () => {
              if (!Jr.strings) {
                // Default values.
                // Browser language detection #8751
                var e =
                    (
                      ("object" == typeof navigator &&
                        navigator.languages &&
                        navigator.languages[0]) ||
                      "C"
                    ).replace("-", "_") + ".UTF-8",
                  t = {
                    USER: "web_user",
                    LOGNAME: "web_user",
                    PATH: "/",
                    PWD: "/",
                    HOME: "/home/web_user",
                    LANG: e,
                    _: qr(),
                  }; // Apply the user-provided values, if any.
                for (var r in Kr)
                  // x is a key in ENV; if ENV[x] is undefined, that means it was
                  // explicitly set to be so. We allow user code to do that to
                  // force variables with default values to remain unset.
                  void 0 === Kr[r] ? delete t[r] : (t[r] = Kr[r]);
                var o = [];
                for (var r in t) o.push(`${r}=${t[r]}`);
                Jr.strings = o;
              }
              return Jr.strings;
            },
            Zr = (e, t) => {
              for (var r = 0; r < e.length; ++r)
                (d(e.charCodeAt(r) === (255 & e.charCodeAt(r))), (Fe[t++] = e.charCodeAt(r))); // Null-terminate the string
              Fe[t] = 0;
            },
            eo = (e, t) => {
              var r = Jr();
              Oe[e >> 2] = r.length;
              var o = 0;
              return (r.forEach((e) => (o += e.length + 1)), (Oe[t >> 2] = o), 0);
            },
            to = (e, t, r, o) => {
              for (var s = 0, n = 0; n < r; n++) {
                var a = Oe[t >> 2],
                  l = Oe[(t + 4) >> 2];
                t += 8;
                var p = Ft.read(e, Fe, a, l, o);
                if (0 > p) return -1;
                if (((s += p), p < l)) break; // nothing more to read
                "undefined" != typeof o && (o += p);
              }
              return s;
            },
            ro = (e, t, r, o) => {
              for (var s = 0, n = 0; n < r; n++) {
                var a = Oe[t >> 2],
                  l = Oe[(t + 4) >> 2];
                t += 8;
                var p = Ft.write(e, Fe, a, l, o);
                if (0 > p) return -1;
                if (((s += p), p < l))
                  // No more space to write.
                  break;
                "undefined" != typeof o && (o += p);
              }
              return s;
            },
            oo = () => et || 0 < 0,
            so,
            no,
            ao,
            io,
            lo,
            po;
          /** @param {boolean=} noRunDep */ /** @suppress {globalThis} */ /** @suppress {globalThis} */ /** @param {number=} numArguments */ /** @type {WebAssembly.Table} */ /** @suppress {globalThis} */ ((Ft.createPreloadedFile =
            (e, t, r, o, s, n, a, i, l, p) => {
              // might have several active requests for the same fullname
              function d(r) {
                function d(r) {
                  (p?.(), i || At(e, t, r, o, s, l), n?.(), b(m));
                }
                wt(r, c, d, () => {
                  (a?.(), b(m));
                }) || d(r);
              } // TODO we should allow people to just pass in a complete filename instead
              // of parent and name being that we just join them anyways
              var c = t ? ut.resolve(dt.join2(e, t)) : e,
                m = C(`cp ${c}`);
              (h(m), "string" == typeof r ? St(r, d, a) : d(r));
            }),
            Ft.staticInit(),
            (() => {
              for (var e = Array(256), t = 0; 256 > t; ++t) e[t] = l(t);
              so = e;
            })(),
            (no = ae.BindingError =
              class e extends Error {
                constructor(e) {
                  (super(e), (this.name = "BindingError"));
                }
              }),
            (ao = ae.InternalError =
              class e extends Error {
                constructor(e) {
                  (super(e), (this.name = "InternalError"));
                }
              }),
            (() => {
              Object.assign(H.prototype, {
                isAliasOf(e) {
                  if (!(this instanceof H)) return !1;
                  if (!(e instanceof H)) return !1;
                  var t = this.$$.ptrType.registeredClass,
                    r = this.$$.ptr;
                  e.$$ = /** @type {Object} */ e.$$;
                  for (var o = e.$$.ptrType.registeredClass, s = e.$$.ptr; t.baseClass;)
                    ((r = t.upcast(r)), (t = t.baseClass));
                  for (; o.baseClass;) ((s = o.upcast(s)), (o = o.baseClass));
                  return t === o && r === s;
                },
                clone() {
                  if ((this.$$.ptr || Ht(this), this.$$.preservePointerOnDelete))
                    return ((this.$$.count.value += 1), this);
                  var e = tr(
                    Object.create(Object.getPrototypeOf(this), { $$: { value: Wt(this.$$) } }),
                  );
                  return ((e.$$.count.value += 1), (e.$$.deleteScheduled = !1), e);
                },
                delete() {
                  (this.$$.ptr || Ht(this),
                    this.$$.deleteScheduled &&
                      !this.$$.preservePointerOnDelete &&
                      Nt("Object already scheduled for deletion"),
                    jt(this),
                    Xt(this.$$),
                    this.$$.preservePointerOnDelete ||
                      ((this.$$.smartPtr = void 0), (this.$$.ptr = void 0)));
                },
                isDeleted() {
                  return !this.$$.ptr;
                },
                deleteLater() {
                  return (
                    this.$$.ptr || Ht(this),
                    this.$$.deleteScheduled &&
                      !this.$$.preservePointerOnDelete &&
                      Nt("Object already scheduled for deletion"),
                    rr.push(this),
                    1 === rr.length && io && io(or),
                    (this.$$.deleteScheduled = !0),
                    this
                  );
                },
              });
            })(),
            (() => {
              Object.assign(K.prototype, {
                getPointee(e) {
                  return (this.rawGetPointee && (e = this.rawGetPointee(e)), e);
                },
                destructor(e) {
                  this.rawDestructor?.(e);
                },
                argPackAdvance: Bt,
                readValueFromPointer: Q,
                fromWireType: W,
              });
            })(),
            (po = ae.UnboundTypeError =
              ((e, t) => {
                var r = sr(t, function (e) {
                  ((this.name = t), (this.message = e));
                  var r = new Error(e).stack;
                  void 0 !== r &&
                    (this.stack = this.toString() + "\n" + r.replace(/^Error(:[^\n]*)?\n/, ""));
                });
                return (
                  (r.prototype = Object.create(e.prototype)),
                  (r.prototype.constructor = r),
                  (r.prototype.toString = function () {
                    return void 0 === this.message ? this.name : `${this.name}: ${this.message}`;
                  }),
                  r
                );
              })(Error, "UnboundTypeError")),
            (() => {
              (Cr.push(0, 1, void 0, 1, null, 1, !0, 1, !1, 1),
                d(10 === Cr.length),
                (ae.count_emval_handles = br));
            })());
          var co = {
              /** @export */ HaveOffsetConverter: function e() {
                return "undefined" != typeof wasmOffsetConverter;
              },
              /** @export */ __assert_fail: (e, t, r, o) => {
                S(
                  `Assertion failed: ${nt(e)}, at: ` +
                    [t ? nt(t) : "unknown filename", r, o ? nt(o) : "unknown function"],
                );
              },
              /** @export */ __cxa_throw: (e, t, r) => {
                var o = new at(e); // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
                (o.init(t, r),
                  (it = e),
                  lt++,
                  d(
                    !1,
                    "Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.",
                  ));
              },
              /** @export */ __syscall_fcntl64: function o(e, t, r) {
                Vt.varargs = r;
                try {
                  var s = Vt.getStreamFromFD(e);
                  switch (t) {
                    case 0: {
                      var n = L();
                      if (0 > n) return -28;
                      for (; Ft.streams[n];) n++;
                      var a;
                      return ((a = Ft.dupStream(s, n)), a.fd);
                    }
                    case 1:
                    case 2:
                      return 0; // FD_CLOEXEC makes no sense for a single process.
                    case 3:
                      return s.flags;
                    case 4: {
                      var n = L();
                      return ((s.flags |= n), 0);
                    }
                    case 12: {
                      var n = pt(),
                        i = 0; // We're always unlocked.
                      return ((ke[(n + i) >> 1] = 2), 0);
                    }
                    case 13:
                    case 14:
                      return 0; // Pretend that the locking is successful.
                  }
                  return -28;
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return -t.errno;
                }
              },
              /** @export */ __syscall_ioctl: function o(e, t, r) {
                Vt.varargs = r;
                try {
                  var s = Vt.getStreamFromFD(e);
                  switch (t) {
                    case 21509:
                      return s.tty ? 0 : -59;
                    case 21505: {
                      if (!s.tty) return -59;
                      if (s.tty.ops.ioctl_tcgets) {
                        var n = s.tty.ops.ioctl_tcgets(s),
                          a = pt();
                        ((Re[a >> 2] = n.c_iflag || 0),
                          (Re[(a + 4) >> 2] = n.c_oflag || 0),
                          (Re[(a + 8) >> 2] = n.c_cflag || 0),
                          (Re[(a + 12) >> 2] = n.c_lflag || 0));
                        for (var l = 0; 32 > l; l++) Fe[a + l + 17] = n.c_cc[l] || 0;
                        return 0;
                      }
                      return 0;
                    }
                    case 21510:
                    case 21511:
                    case 21512:
                      return s.tty ? 0 : -59; // no-op, not actually adjusting terminal settings
                    case 21506:
                    case 21507:
                    case 21508: {
                      if (!s.tty) return -59;
                      if (s.tty.ops.ioctl_tcsets) {
                        for (
                          var a = pt(),
                            p = Re[a >> 2],
                            d = Re[(a + 4) >> 2],
                            c = Re[(a + 8) >> 2],
                            m = Re[(a + 12) >> 2],
                            u = [],
                            l = 0;
                          32 > l;
                          l++
                        )
                          u.push(Fe[a + l + 17]);
                        return s.tty.ops.ioctl_tcsets(s.tty, t, {
                          c_iflag: p,
                          c_oflag: d,
                          c_cflag: c,
                          c_lflag: m,
                          c_cc: u,
                        });
                      }
                      return 0; // no-op, not actually adjusting terminal settings
                    }
                    case 21519: {
                      if (!s.tty) return -59;
                      var a = pt();
                      return ((Re[a >> 2] = 0), 0);
                    }
                    case 21520:
                      return s.tty ? -28 : -59; // not supported
                    case 21531: {
                      var a = pt();
                      return Ft.ioctl(s, t, a);
                    }
                    case 21523: {
                      // TODO: in theory we should write to the winsize struct that gets
                      // passed in, but for now musl doesn't read anything on it
                      if (!s.tty) return -59;
                      if (s.tty.ops.ioctl_tiocgwinsz) {
                        var y = s.tty.ops.ioctl_tiocgwinsz(s.tty),
                          a = pt();
                        ((ke[a >> 1] = y[0]), (ke[(a + 2) >> 1] = y[1]));
                      }
                      return 0;
                    }
                    case 21524: // TODO: technically, this ioctl call should change the window size.
                      // but, since emscripten doesn't have any concept of a terminal window
                      // yet, we'll just silently throw it away as we do TIOCGWINSZ
                      return s.tty ? 0 : -59;
                    case 21515:
                      return s.tty ? 0 : -59;
                    default:
                      return -28; // not supported
                  }
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return -t.errno;
                }
              },
              /** @export */ __syscall_openat: function s(e, t, r, o) {
                Vt.varargs = o;
                try {
                  ((t = Vt.getStr(t)), (t = Vt.calculateAt(e, t)));
                  var n = o ? L() : 0;
                  return Ft.open(t, r, n).fd;
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return -t.errno;
                }
              },
              /** @export */ _abort_js: () => {
                S("native code called abort()");
              },
              /** @export */ _embind_register_bigint: (e, t, r, o, s) => {
                t = Dt(t);
                var n = -1 != t.indexOf("u"); // maxRange comes through as -1 for uint64_t (see issue 13902). Work around that temporarily
                (n && (s = (1n << 64n) - 1n),
                  B(e, {
                    name: t,
                    fromWireType: (e) => e,
                    toWireType: function (e, r) {
                      if ("bigint" != typeof r && "number" != typeof r)
                        throw new TypeError(`Cannot convert "${kt(r)}" to ${this.name}`);
                      if (("number" == typeof r && (r = BigInt(r)), r < o || r > s))
                        throw new TypeError(
                          `Passing a number "${kt(r)}" from JS side to C/C++ side to an argument of type "${t}", which is outside the valid range [${o}, ${s}]!`,
                        );
                      return r;
                    },
                    argPackAdvance: Bt,
                    readValueFromPointer: zt(t, r, !n),
                    destructorFunction: null, // This type does not need a destructor
                  }));
              },
              /** @export */ _embind_register_bool: (e, t, r, s) => {
                ((t = Dt(t)),
                  B(e, {
                    name: t,
                    fromWireType: function (e) {
                      // ambiguous emscripten ABI: sometimes return values are
                      // true or false, and sometimes integers (0 or 1)
                      return !!e;
                    },
                    toWireType: function (e, t) {
                      return t ? r : s;
                    },
                    argPackAdvance: Bt,
                    readValueFromPointer: function (e) {
                      return this.fromWireType(Ve[e]);
                    },
                    destructorFunction: null, // This type does not need a destructor
                  }));
              },
              /** @export */ _embind_register_class: (e, t, r, o, s, n, a, i, l, p, d, c, m) => {
                ((d = Dt(d)), (n = mr(s, n)), (i &&= mr(a, i)), (p &&= mr(l, p)), (m = mr(c, m)));
                var u = ir(d);
                (ar(u, function () {
                  yr(`Cannot construct ${d} due to unbound types`, [o]);
                }),
                  $t([e, t, r], o ? [o] : [], (t) => {
                    t = t[0];
                    var r, s;
                    o ? ((r = t.registeredClass), (s = r.instancePrototype)) : (s = H.prototype);
                    var a = sr(d, function (...e) {
                        if (Object.getPrototypeOf(this) !== l)
                          throw new no("Use 'new' to construct " + d);
                        if (void 0 === c.constructor_body)
                          throw new no(d + " has no accessible constructor");
                        var t = c.constructor_body[e.length];
                        if (void 0 === t)
                          throw new no(
                            `Tried to invoke ctor of ${d} with invalid number of parameters (${e.length}) - expected (${Object.keys(c.constructor_body).toString()}) parameters instead!`,
                          );
                        return t.apply(this, e);
                      }),
                      l = Object.create(s, { constructor: { value: a } });
                    a.prototype = l;
                    var c = new G(d, a, l, m, r, n, i, p);
                    c.baseClass &&
                      ((c.baseClass.__derivedClasses ??= []), c.baseClass.__derivedClasses.push(c));
                    var y = new K(d, c, !0, !1, !1),
                      g = new K(d + "*", c, !1, !1, !1),
                      _ = new K(d + " const*", c, !1, !0, !1);
                    return ((Kt[e] = { pointerType: g, constPointerType: _ }), pr(u, a), [y, g, _]);
                  }));
              },
              /** @export */ _embind_register_class_class_function: (e, t, r, o, s, n, a, i, l) => {
                var p = _r(r, o);
                ((t = Dt(t)),
                  (t = fr(t)),
                  (n = mr(s, n)),
                  $t([], [e], (e) => {
                    function o() {
                      yr(`Cannot call ${s} due to unbound types`, p);
                    }
                    e = e[0];
                    var s = `${e.name}.${t}`;
                    t.startsWith("@@") && (t = Symbol[t.substring(2)]);
                    var l = e.registeredClass.constructor;
                    return (
                      void 0 === l[t]
                        ? ((o.argCount = r - 1), (l[t] = o))
                        : (nr(l, t, s), (l[t].overloadTable[r - 1] = o)),
                      $t([], p, (o) => {
                        // Replace the initial unbound-types-handler stub with the proper
                        // function. If multiple overloads are registered, the function handlers
                        // go into an overload table.
                        var p = [o[0] /* return value */, null /* no class 'this'*/].concat(
                            o.slice(1) /* actual params */,
                          ),
                          d = re(s, p, null /* no class 'this'*/, n, a, i);
                        if (
                          (void 0 === l[t].overloadTable
                            ? ((d.argCount = r - 1), (l[t] = d))
                            : (l[t].overloadTable[r - 1] = d),
                          e.registeredClass.__derivedClasses)
                        )
                          for (const r of e.registeredClass.__derivedClasses)
                            r.constructor.hasOwnProperty(t) || // TODO: Add support for overloads
                              (r.constructor[t] = d);
                        return [];
                      }),
                      []
                    );
                  }));
              },
              /** @export */ _embind_register_class_constructor: (e, t, r, o, s, n) => {
                d(0 < t);
                var a = _r(t, r);
                s = mr(o, s);
                var i = [n],
                  l = [];
                $t([], [e], (e) => {
                  e = e[0];
                  var r = `constructor ${e.name}`;
                  if (
                    (void 0 === e.registeredClass.constructor_body &&
                      (e.registeredClass.constructor_body = []),
                    void 0 !== e.registeredClass.constructor_body[t - 1])
                  )
                    throw new no(
                      `Cannot register multiple constructors with identical number of parameters (${t - 1}) for class '${e.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`,
                    );
                  return (
                    (e.registeredClass.constructor_body[t - 1] = () => {
                      yr(`Cannot construct ${e.name} due to unbound types`, a);
                    }),
                    $t(
                      [],
                      a,
                      (o) => (
                        o.splice(1, 0, null),
                        (e.registeredClass.constructor_body[t - 1] = re(r, o, null, s, n)),
                        []
                      ),
                    ),
                    []
                  );
                });
              },
              /** @export */ _embind_register_class_function: (
                e,
                t,
                r,
                o, // [ReturnType, ThisType, Args...]
                s,
                n,
                a,
                i,
                l,
                p,
              ) => {
                var d = _r(r, o);
                ((t = Dt(t)),
                  (t = fr(t)),
                  (n = mr(s, n)),
                  $t([], [e], (e) => {
                    function o() {
                      yr(`Cannot call ${s} due to unbound types`, d);
                    }
                    e = e[0];
                    var s = `${e.name}.${t}`;
                    (t.startsWith("@@") && (t = Symbol[t.substring(2)]),
                      i && e.registeredClass.pureVirtualFunctions.push(t));
                    var p = e.registeredClass.instancePrototype,
                      c = p[t];
                    return (
                      void 0 === c ||
                      (void 0 === c.overloadTable && c.className !== e.name && c.argCount === r - 2)
                        ? ((o.argCount = r - 2), (o.className = e.name), (p[t] = o))
                        : (nr(p, t, s), (p[t].overloadTable[r - 2] = o)),
                      $t([], d, (o) => {
                        var i = re(s, o, e, n, a, l); // Replace the initial unbound-handler-stub function with the
                        // appropriate member function, now that all types are resolved. If
                        // multiple overloads are registered for this function, the function
                        // goes into an overload table.
                        return (
                          void 0 === p[t].overloadTable
                            ? ((i.argCount = r - 2), (p[t] = i))
                            : (p[t].overloadTable[r - 2] = i),
                          []
                        );
                      }),
                      []
                    );
                  }));
              },
              /** @export */ _embind_register_class_property: (e, t, r, o, s, n, a, i, l, p) => {
                ((t = Dt(t)),
                  (s = mr(o, s)),
                  $t([], [e], (e) => {
                    e = e[0];
                    var o = `${e.name}.${t}`,
                      d = {
                        get() {
                          yr(`Cannot access ${o} due to unbound types`, [r, a]);
                        },
                        enumerable: !0,
                        configurable: !0,
                      };
                    return (
                      (d.set = l
                        ? () => yr(`Cannot access ${o} due to unbound types`, [r, a])
                        : (e) => Nt(o + " is a read-only property")),
                      Object.defineProperty(e.registeredClass.instancePrototype, t, d),
                      $t([], l ? [r, a] : [r], (r) => {
                        var a = r[0],
                          d = {
                            get() {
                              var t = Pr(this, e, o + " getter");
                              return a.fromWireType(s(n, t));
                            },
                            enumerable: !0,
                          };
                        if (l) {
                          l = mr(i, l);
                          var c = r[1];
                          d.set = function (t) {
                            var r = Pr(this, e, o + " setter"),
                              s = [];
                            (l(p, r, c.toWireType(s, t)), gr(s));
                          };
                        }
                        return (
                          Object.defineProperty(e.registeredClass.instancePrototype, t, d),
                          []
                        );
                      }),
                      []
                    );
                  }));
              },
              /** @export */ _embind_register_emval: (e) => B(e, Ar),
              /** @export */ _embind_register_float: (e, t, r) => {
                ((t = Dt(t)),
                  B(e, {
                    name: t,
                    fromWireType: (e) => e,
                    toWireType: (e, t) => {
                      if ("number" != typeof t && "boolean" != typeof t)
                        throw new TypeError(`Cannot convert ${kt(t)} to ${this.name}`); // The VM will perform JS to Wasm value conversion, according to the spec:
                      // https://www.w3.org/TR/wasm-js-api-1/#towebassemblyvalue
                      return t;
                    },
                    argPackAdvance: Bt,
                    readValueFromPointer: Er(t, r),
                    destructorFunction: null, // This type does not need a destructor
                  }));
              },
              /** @export */ _embind_register_integer: (e, t, r, o, s) => {
                ((t = Dt(t)), -1 === s && (s = 4294967295));
                var n = (e) => e;
                if (0 === o) {
                  var a = 32 - 8 * r;
                  n = (e) => (e << a) >>> a;
                }
                var i = t.includes("unsigned"),
                  l = (e, r) => {
                    if ("number" != typeof e && "boolean" != typeof e)
                      throw new TypeError(`Cannot convert "${kt(e)}" to ${r}`);
                    if (e < o || e > s)
                      throw new TypeError(
                        `Passing a number "${kt(e)}" from JS side to C/C++ side to an argument of type "${t}", which is outside the valid range [${o}, ${s}]!`,
                      );
                  },
                  p;
                ((p = i
                  ? function (e, t) {
                      return (l(t, this.name), t >>> 0);
                    }
                  : function (e, t) {
                      // The VM will perform JS to Wasm value conversion, according to the spec:
                      // https://www.w3.org/TR/wasm-js-api-1/#towebassemblyvalue
                      return (l(t, this.name), t);
                    }),
                  B(e, {
                    name: t,
                    fromWireType: n,
                    toWireType: p,
                    argPackAdvance: Bt,
                    readValueFromPointer: zt(t, r, 0 !== o),
                    destructorFunction: null, // This type does not need a destructor
                  }));
              },
              /** @export */ _embind_register_memory_view: (e, t, r) => {
                function o(e) {
                  var t = Oe[e >> 2],
                    r = Oe[(e + 4) >> 2];
                  return new n(Fe.buffer, r, t);
                }
                var s = [
                    Int8Array,
                    Uint8Array,
                    Int16Array,
                    Uint16Array,
                    Int32Array,
                    Uint32Array,
                    Float32Array,
                    Float64Array,
                    BigInt64Array,
                    BigUint64Array,
                  ],
                  n = s[t];
                ((r = Dt(r)),
                  B(
                    e,
                    { name: r, fromWireType: o, argPackAdvance: Bt, readValueFromPointer: o },
                    { ignoreDuplicateRegistrations: !0 },
                  ));
              },
              /** @export */ _embind_register_optional: (e, t) => {
                B(e, wr);
              },
              /** @export */ _embind_register_smart_ptr: (e, t, r, o, s, n, a, i, l, p, d, c) => {
                ((r = Dt(r)),
                  (n = mr(s, n)),
                  (i = mr(a, i)),
                  (p = mr(l, p)),
                  (c = mr(d, c)),
                  $t([e], [t], (e) => {
                    e = e[0];
                    var t = new K(r, e.registeredClass, !1, !1, !0, e, o, n, i, p, c);
                    return [t];
                  }));
              },
              /** @export */ _embind_register_std_string: (e, t) => {
                t = Dt(t);
                var r = "std::string" === t; //process only std::string bindings with UTF8 support, in contrast to e.g. std::basic_string<unsigned char>
                B(e, {
                  name: t, // For some method names we use string keys here since they are part of
                  // the public/external API and/or used by the runtime-generated code.
                  fromWireType(e) {
                    var t = Oe[e >> 2],
                      o = e + 4,
                      s;
                    if (r) {
                      // Looping here to support possible embedded '0' bytes
                      for (var n = o, p = 0, d; p <= t; ++p)
                        if (((d = o + p), p == t || 0 == Ve[d])) {
                          var c = d - n,
                            m = nt(n, c);
                          (void 0 === s ? (s = m) : ((s += l(0)), (s += m)), (n = d + 1));
                        }
                    } else {
                      for (var u = Array(t), p = 0; p < t; ++p) u[p] = l(Ve[o + p]);
                      s = u.join("");
                    }
                    return (_o(e), s);
                  },
                  toWireType(e, t) {
                    t instanceof ArrayBuffer && (t = new Uint8Array(t));
                    var o = "string" == typeof t,
                      s;
                    (o ||
                      t instanceof Uint8Array ||
                      t instanceof Uint8ClampedArray ||
                      t instanceof Int8Array ||
                      Nt("Cannot pass non-string to std::string"),
                      (s = r && o ? gt(t) : t.length)); // assumes POINTER_SIZE alignment
                    var n = yo(4 + s + 1),
                      a = n + 4;
                    if (((Oe[n >> 2] = s), r && o)) Mr(t, a, s + 1);
                    else if (o)
                      for (var l = 0, p; l < s; ++l)
                        ((p = t.charCodeAt(l)),
                          255 < p &&
                            (_o(a), Nt("String has UTF-16 code units that do not fit in 8 bits")),
                          (Ve[a + l] = p));
                    else for (var l = 0; l < s; ++l) Ve[a + l] = t[l];
                    return (null !== e && e.push(_o, n), n);
                  },
                  argPackAdvance: Bt,
                  readValueFromPointer: Q,
                  destructorFunction(e) {
                    _o(e);
                  },
                });
              },
              /** @export */ _embind_register_std_wstring: (e, t, r) => {
                r = Dt(r);
                var o, s, n, a;
                (2 === t
                  ? ((o = xr), (s = vr), (a = Fr), (n = (e) => De[e >> 1]))
                  : 4 == t && ((o = Vr), (s = kr), (a = Dr), (n = (e) => Oe[e >> 2])),
                  B(e, {
                    name: r,
                    fromWireType: (e) => {
                      // Code mostly taken from _embind_register_std_string fromWireType
                      // Looping here to support possible embedded '0' bytes
                      for (var r = Oe[e >> 2], s = e + 4, a = 0, p, d; a <= r; ++a)
                        if (((d = e + 4 + a * t), a == r || 0 == n(d))) {
                          var c = d - s,
                            m = o(s, c);
                          (void 0 === p ? (p = m) : ((p += l(0)), (p += m)), (s = d + t));
                        }
                      return (_o(e), p);
                    },
                    toWireType: (e, o) => {
                      "string" == typeof o || Nt(`Cannot pass non-string to C++ string type ${r}`); // assumes POINTER_SIZE alignment
                      var n = a(o),
                        i = yo(4 + n + t);
                      return (
                        (Oe[i >> 2] = n / t),
                        s(o, i + 4, n + t),
                        null !== e && e.push(_o, i),
                        i
                      );
                    },
                    argPackAdvance: Bt,
                    readValueFromPointer: Q,
                    destructorFunction(e) {
                      _o(e);
                    },
                  }));
              },
              /** @export */ _embind_register_void: (e, t) => {
                ((t = Dt(t)),
                  B(e, {
                    isVoid: !0, // void return values can be optimized out sometimes
                    name: t,
                    argPackAdvance: 0,
                    fromWireType: () => void 0, // TODO: assert if anything else is given?
                    toWireType: (e, t) => void 0,
                  }));
              },
              /** @export */ _emscripten_get_now_is_monotonic: () => 1,
              /** @export */ _emval_call: (e, t, r, o) => (
                (e = Rr[e]),
                (t = Sr.toValue(t)),
                e(null, t, r, o)
              ),
              /** @export */ _emval_decref: hr,
              /** @export */ _emval_get_method_caller: (e, t, r) => {
                var o = Nr(e, t),
                  s = o.shift();
                e--; // remove the shifted off return type
                var n = `return function (obj, func, destructorsRef, args) {\n`,
                  a = 0,
                  l = [];
                /* FUNCTION */ 0 === r && l.push("obj");
                for (var p = ["retType"], d = [s], c = 0; c < e; ++c)
                  (l.push("arg" + c),
                    p.push("argType" + c),
                    d.push(o[c]),
                    (n += `  var arg${c} = argType${c}.readValueFromPointer(args${a ? "+" + a : ""});\n`),
                    (a += o[c].argPackAdvance));
                var m = /* CONSTRUCTOR */ 1 === r ? "new func" : "func.call";
                ((n += `  var rv = ${m}(${l.join(", ")});\n`),
                  s.isVoid ||
                    (p.push("emval_returnValue"),
                    d.push($r),
                    (n += "  return emval_returnValue(retType, destructorsRef, rv);\n")),
                  (n += "};\n"),
                  p.push(n));
                var u = J(Function, p)(...d),
                  y = `methodCaller<(${o.map((e) => e.name).join(", ")}) => ${s.name}>`;
                return Or(sr(y, u));
              },
              /** @export */ _emval_incref: (e) => {
                9 < e && (Cr[e + 1] += 1);
              },
              /** @export */ _emval_run_destructors: (e) => {
                var t = Sr.toValue(e);
                (gr(t), hr(e));
              },
              /** @export */ _emval_take_value: (e, t) => {
                e = Ur(e, "_emval_take_value");
                var r = e.readValueFromPointer(t);
                return Sr.toHandle(r);
              },
              /** @export */ _mmap_js: function i(e, t, r, o, s, n, a) {
                s = zr(s);
                try {
                  if (isNaN(s)) return 61;
                  var l = Vt.getStreamFromFD(o),
                    p = Ft.mmap(l, e, s, t, r),
                    d = p.ptr;
                  return ((Re[n >> 2] = p.allocated), (Oe[a >> 2] = d), 0);
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return -t.errno;
                }
              },
              /** @export */ _munmap_js: function a(e, t, r, o, s, n) {
                n = zr(n);
                try {
                  var i = Vt.getStreamFromFD(s);
                  2 & r && Vt.doMsync(e, i, t, o, n);
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return -t.errno;
                }
              },
              /** @export */ _tzset_js: (e, t, r, n) => {
                // TODO: Use (malleable) environment variables instead of system settings.
                var a = new Date().getFullYear(),
                  i = new Date(a, 0, 1),
                  l = new Date(a, 6, 1),
                  p = i.getTimezoneOffset(),
                  c = l.getTimezoneOffset(),
                  m = s(p, c); // Local standard timezone offset. Local standard time is not adjusted for
                // daylight savings.  This code uses the fact that getTimezoneOffset returns
                // a greater value during Standard Time versus Daylight Saving Time (DST).
                // Thus it determines the expected output during Standard Time, and it
                // compares whether the output of the given date the same (Standard) or less
                // (DST).
                ((Oe[e >> 2] = 60 * m), (Re[t >> 2] = +(p != c)));
                var u = (e) => {
                    var t = Math.abs,
                      r = 0 <= e ? "-" : "+",
                      s = t(e),
                      n = (o(s / 60) + "").padStart(2, "0"),
                      a = ((s % 60) + "").padStart(2, "0"); // Why inverse sign?
                    // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
                    return `UTC${r}${n}${a}`;
                  },
                  y = u(p),
                  g = u(c);
                (d(y),
                  d(g),
                  d(16 >= gt(y), `timezone name truncated to fit in TZNAME_MAX (${y})`),
                  d(16 >= gt(g), `timezone name truncated to fit in TZNAME_MAX (${g})`),
                  c < p ? (Mr(y, r, 17), Mr(g, n, 17)) : (Mr(y, n, 17), Mr(g, r, 17)));
              },
              /** @export */ emscripten_asm_const_int: (e, t, r) => Hr(e, t, r),
              /** @export */ emscripten_asm_const_ptr: (e, t, r) => Hr(e, t, r),
              /** @export */ emscripten_date_now: () => Date.now(),
              /** @export */ emscripten_errn: (e, t) => we(nt(e, t)),
              /** @export */ emscripten_get_heap_max: () => Gr(),
              /** @export */ emscripten_get_now: () => performance.now(),
              /** @export */ emscripten_pc_get_function: (e) => (
                S("Cannot use emscripten_pc_get_function without -sUSE_OFFSET_CONVERTER"),
                0
              ),
              /** @export */ emscripten_resize_heap: (e) => {
                var t = Ve.length; // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
                ((e >>>= 0), jr(e));
              },
              /** @export */ emscripten_stack_snapshot: function e() {
                var t = oe().split("\n");
                return (
                  "Error" == t[0] && t.shift(),
                  Qr(t),
                  (Xr.last_addr = Yr(t[3])),
                  (Xr.last_stack = t),
                  Xr.last_addr
                );
              },
              /** @export */ emscripten_stack_unwind_buffer: (e, t, r) => {
                var o;
                Xr.last_addr == e
                  ? (o = Xr.last_stack)
                  : ((o = oe().split("\n")), "Error" == o[0] && o.shift(), Qr(o));
                for (var s = 3; o[s] && Yr(o[s]) != e;) ++s;
                for (var n = 0; n < r && o[n + s]; ++n) Re[(t + 4 * n) >> 2] = Yr(o[n + s]);
                return n;
              },
              /** @export */ environ_get: (e, t) => {
                var r = 0;
                return (
                  Jr().forEach((o, s) => {
                    var n = t + r;
                    ((Oe[(e + 4 * s) >> 2] = n), Zr(o, n), (r += o.length + 1));
                  }),
                  0
                );
              },
              /** @export */ environ_sizes_get: eo,
              /** @export */ fd_close: function t(e) {
                try {
                  var r = Vt.getStreamFromFD(e);
                  return (Ft.close(r), 0);
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return t.errno;
                }
              },
              /** @export */ fd_read: function s(e, t, r, o) {
                try {
                  var n = Vt.getStreamFromFD(e),
                    a = to(n, t, r);
                  return ((Oe[o >> 2] = a), 0);
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return t.errno;
                }
              },
              /** @export */ fd_seek: function s(e, t, r, o) {
                t = zr(t);
                try {
                  if (isNaN(t)) return 61;
                  var n = Vt.getStreamFromFD(e); // reset readdir state
                  return (
                    Ft.llseek(n, t, r),
                    (Ne[o >> 3] = BigInt(n.position)),
                    n.getdents && 0 === t && 0 === r && (n.getdents = null),
                    0
                  );
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return t.errno;
                }
              },
              /** @export */ fd_write: function s(e, t, r, o) {
                try {
                  var n = Vt.getStreamFromFD(e),
                    a = ro(n, t, r);
                  return ((Oe[o >> 2] = a), 0);
                } catch (t) {
                  if ("undefined" == typeof Ft || "ErrnoError" !== t.name) throw t;
                  return t.errno;
                }
              },
              /** @export */ proc_exit: (e) => {
                ((ve = e), oo() || (ae.onExit?.(e), (Ie = !0)), Pe(e, new N(e)));
              },
            },
            mo = F(),
            uo = A("__wasm_call_ctors", 0),
            yo = A("malloc", 1),
            go = A("__getTypeName", 1),
            _o = A("free", 1),
            fo = A("fflush", 1),
            Po = A("strerror", 1),
            To = A("emscripten_builtin_memalign", 2),
            Co = () => (Co = mo.emscripten_stack_init)(),
            ho = () => (ho = mo.emscripten_stack_get_free)(),
            bo = () => (bo = mo.emscripten_stack_get_base)(),
            So = () => (So = mo.emscripten_stack_get_end)(),
            Ao = (e) => (Ao = mo._emscripten_stack_restore)(e),
            Eo = (e) => (Eo = mo._emscripten_stack_alloc)(e),
            wo = () => (wo = mo.emscripten_stack_get_current)(); // include: postamble.js
          // === Auto-generated postamble setup entry stuff ===
          [
            "writeI53ToI64",
            "writeI53ToI64Clamped",
            "writeI53ToI64Signaling",
            "writeI53ToU64Clamped",
            "writeI53ToU64Signaling",
            "readI53FromI64",
            "readI53FromU64",
            "convertI32PairToI53",
            "convertI32PairToI53Checked",
            "convertU32PairToI53",
            "stackAlloc",
            "getTempRet0",
            "setTempRet0",
            "exitJS",
            "growMemory",
            "inetPton4",
            "inetNtop4",
            "inetPton6",
            "inetNtop6",
            "readSockaddr",
            "writeSockaddr",
            "emscriptenLog",
            "runMainThreadEmAsm",
            "jstoi_q",
            "listenOnce",
            "autoResumeAudioContext",
            "getDynCaller",
            "dynCall",
            "handleException",
            "runtimeKeepalivePush",
            "runtimeKeepalivePop",
            "callUserCallback",
            "maybeExit",
            "asmjsMangle",
            "HandleAllocator",
            "getNativeTypeSize",
            "STACK_SIZE",
            "STACK_ALIGN",
            "POINTER_SIZE",
            "ASSERTIONS",
            "getCFunc",
            "ccall",
            "cwrap",
            "uleb128Encode",
            "sigToWasmTypes",
            "generateFuncType",
            "convertJsFunctionToWasm",
            "getEmptyTableSlot",
            "updateTableMap",
            "getFunctionAddress",
            "addFunction",
            "removeFunction",
            "reallyNegative",
            "unSign",
            "strLen",
            "reSign",
            "formatString",
            "intArrayToString",
            "AsciiToString",
            "stringToNewUTF8",
            "stringToUTF8OnStack",
            "writeArrayToMemory",
            "registerKeyEventCallback",
            "maybeCStringToJsString",
            "findEventTarget",
            "getBoundingClientRect",
            "fillMouseEventData",
            "registerMouseEventCallback",
            "registerWheelEventCallback",
            "registerUiEventCallback",
            "registerFocusEventCallback",
            "fillDeviceOrientationEventData",
            "registerDeviceOrientationEventCallback",
            "fillDeviceMotionEventData",
            "registerDeviceMotionEventCallback",
            "screenOrientation",
            "fillOrientationChangeEventData",
            "registerOrientationChangeEventCallback",
            "fillFullscreenChangeEventData",
            "registerFullscreenChangeEventCallback",
            "JSEvents_requestFullscreen",
            "JSEvents_resizeCanvasForFullscreen",
            "registerRestoreOldStyle",
            "hideEverythingExceptGivenElement",
            "restoreHiddenElements",
            "setLetterbox",
            "softFullscreenResizeWebGLRenderTarget",
            "doRequestFullscreen",
            "fillPointerlockChangeEventData",
            "registerPointerlockChangeEventCallback",
            "registerPointerlockErrorEventCallback",
            "requestPointerLock",
            "fillVisibilityChangeEventData",
            "registerVisibilityChangeEventCallback",
            "registerTouchEventCallback",
            "fillGamepadEventData",
            "registerGamepadEventCallback",
            "registerBeforeUnloadEventCallback",
            "fillBatteryEventData",
            "battery",
            "registerBatteryEventCallback",
            "setCanvasElementSize",
            "getCanvasElementSize",
            "getCallstack",
            "convertPCtoSourceLocation",
            "checkWasiClock",
            "wasiRightsToMuslOFlags",
            "wasiOFlagsToMuslOFlags",
            "createDyncallWrapper",
            "safeSetTimeout",
            "setImmediateWrapped",
            "clearImmediateWrapped",
            "polyfillSetImmediate",
            "registerPostMainLoop",
            "registerPreMainLoop",
            "getPromise",
            "makePromise",
            "idsToPromises",
            "makePromiseCallback",
            "findMatchingCatch",
            "Browser_asyncPrepareDataCounter",
            "safeRequestAnimationFrame",
            "isLeapYear",
            "ydayFromDate",
            "arraySum",
            "addDays",
            "getSocketFromFD",
            "getSocketAddress",
            "FS_unlink",
            "FS_mkdirTree",
            "_setNetworkCallback",
            "heapObjectForWebGLType",
            "toTypedArrayIndex",
            "webgl_enable_ANGLE_instanced_arrays",
            "webgl_enable_OES_vertex_array_object",
            "webgl_enable_WEBGL_draw_buffers",
            "webgl_enable_WEBGL_multi_draw",
            "webgl_enable_EXT_polygon_offset_clamp",
            "webgl_enable_EXT_clip_control",
            "webgl_enable_WEBGL_polygon_mode",
            "emscriptenWebGLGet",
            "computeUnpackAlignedImageSize",
            "colorChannelsInGlTextureFormat",
            "emscriptenWebGLGetTexPixelData",
            "emscriptenWebGLGetUniform",
            "webglGetUniformLocation",
            "webglPrepareUniformLocationsBeforeFirstUse",
            "webglGetLeftBracePos",
            "emscriptenWebGLGetVertexAttrib",
            "__glGetActiveAttribOrUniform",
            "writeGLArray",
            "registerWebGlEventCallback",
            "runAndAbortIfError",
            "ALLOC_NORMAL",
            "ALLOC_STACK",
            "allocate",
            "writeStringToMemory",
            "writeAsciiToMemory",
            "setErrNo",
            "demangle",
            "stackTrace",
            "getFunctionArgsName",
            "createJsInvokerSignature",
            "registerInheritedInstance",
            "unregisterInheritedInstance",
            "getInheritedInstanceCount",
            "getLiveInheritedInstances",
            "enumReadValueFromPointer",
            "setDelayFunction",
            "getStringOrSymbol",
            "emval_get_global",
          ].forEach(function t(e) {
            (R(e, () => {
              // Can't `abort()` here because it would break code that does runtime
              // checks.  e.g. `if (typeof SDL === 'undefined')`.
              var t = `\`${e}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`,
                r = e; // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
              // library.js, which means $name for a JS name with no prefix, or name
              // for a JS name like _name.
              (r.startsWith("_") || (r = "$" + e),
                (t += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${r}')`),
                D(e) &&
                  (t +=
                    ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you"),
                rt(t));
            }),
              U(e));
          });
          [
            "run",
            "addOnPreRun",
            "addOnInit",
            "addOnPreMain",
            "addOnExit",
            "addOnPostRun",
            "addRunDependency",
            "removeRunDependency",
            "out",
            "err",
            "callMain",
            "abort",
            "wasmMemory",
            "wasmExports",
            "writeStackCookie",
            "checkStackCookie",
            "INT53_MAX",
            "INT53_MIN",
            "bigintToI53Checked",
            "stackSave",
            "stackRestore",
            "ptrToString",
            "zeroMemory",
            "getHeapMax",
            "abortOnCannotGrowMemory",
            "ENV",
            "ERRNO_CODES",
            "strError",
            "DNS",
            "Protocols",
            "Sockets",
            "initRandomFill",
            "randomFill",
            "timers",
            "warnOnce",
            "readEmAsmArgsArray",
            "readEmAsmArgs",
            "runEmAsmFunction",
            "jstoi_s",
            "getExecutableName",
            "keepRuntimeAlive",
            "asyncLoad",
            "alignMemory",
            "mmapAlloc",
            "wasmTable",
            "noExitRuntime",
            "freeTableIndexes",
            "functionsInTableMap",
            "setValue",
            "getValue",
            "PATH",
            "PATH_FS",
            "UTF8Decoder",
            "UTF8ArrayToString",
            "UTF8ToString",
            "stringToUTF8Array",
            "stringToUTF8",
            "lengthBytesUTF8",
            "intArrayFromString",
            "stringToAscii",
            "UTF16Decoder",
            "UTF16ToString",
            "stringToUTF16",
            "lengthBytesUTF16",
            "UTF32ToString",
            "stringToUTF32",
            "lengthBytesUTF32",
            "JSEvents",
            "specialHTMLTargets",
            "findCanvasEventTarget",
            "currentFullscreenStrategy",
            "restoreOldWindowedStyle",
            "jsStackTrace",
            "UNWIND_CACHE",
            "ExitStatus",
            "getEnvStrings",
            "doReadv",
            "doWritev",
            "promiseMap",
            "uncaughtExceptionCount",
            "exceptionLast",
            "exceptionCaught",
            "ExceptionInfo",
            "Browser",
            "getPreloadedImageData__data",
            "wget",
            "MONTH_DAYS_REGULAR",
            "MONTH_DAYS_LEAP",
            "MONTH_DAYS_REGULAR_CUMULATIVE",
            "MONTH_DAYS_LEAP_CUMULATIVE",
            "SYSCALLS",
            "preloadPlugins",
            "FS_createPreloadedFile",
            "FS_modeStringToFlags",
            "FS_getMode",
            "FS_stdin_getChar_buffer",
            "FS_stdin_getChar",
            "FS_createPath",
            "FS_createDevice",
            "FS_readFile",
            "FS",
            "FS_createDataFile",
            "FS_createLazyFile",
            "MEMFS",
            "TTY",
            "PIPEFS",
            "SOCKFS",
            "tempFixedLengthArray",
            "miniTempWebGLFloatBuffers",
            "miniTempWebGLIntBuffers",
            "GL",
            "AL",
            "GLUT",
            "EGL",
            "GLEW",
            "IDBStore",
            "SDL",
            "SDL_gfx",
            "allocateUTF8",
            "allocateUTF8OnStack",
            "print",
            "printErr",
            "InternalError",
            "BindingError",
            "throwInternalError",
            "throwBindingError",
            "registeredTypes",
            "awaitingDependencies",
            "typeDependencies",
            "tupleRegistrations",
            "structRegistrations",
            "sharedRegisterType",
            "whenDependentTypesAreResolved",
            "embind_charCodes",
            "embind_init_charCodes",
            "readLatin1String",
            "getTypeName",
            "getFunctionName",
            "heap32VectorToArray",
            "requireRegisteredType",
            "usesDestructorStack",
            "checkArgCount",
            "getRequiredArgCount",
            "createJsInvoker",
            "UnboundTypeError",
            "PureVirtualError",
            "GenericWireTypeSize",
            "EmValType",
            "EmValOptionalType",
            "throwUnboundTypeError",
            "ensureOverloadTable",
            "exposePublicSymbol",
            "replacePublicSymbol",
            "extendError",
            "createNamedFunction",
            "embindRepr",
            "registeredInstances",
            "getBasestPointer",
            "getInheritedInstance",
            "registeredPointers",
            "registerType",
            "integerReadValueFromPointer",
            "floatReadValueFromPointer",
            "readPointer",
            "runDestructors",
            "newFunc",
            "craftInvokerFunction",
            "embind__requireFunction",
            "genericPointerToWireType",
            "constNoSmartPtrRawPointerToWireType",
            "nonConstNoSmartPtrRawPointerToWireType",
            "init_RegisteredPointer",
            "RegisteredPointer",
            "RegisteredPointer_fromWireType",
            "runDestructor",
            "releaseClassHandle",
            "finalizationRegistry",
            "detachFinalizer_deps",
            "detachFinalizer",
            "attachFinalizer",
            "makeClassHandle",
            "init_ClassHandle",
            "ClassHandle",
            "throwInstanceAlreadyDeleted",
            "deletionQueue",
            "flushPendingDeletes",
            "delayFunction",
            "RegisteredClass",
            "shallowCopyInternalPointer",
            "downcastPointer",
            "upcastPointer",
            "validateThis",
            "char_0",
            "char_9",
            "makeLegalFunctionName",
            "emval_freelist",
            "emval_handles",
            "emval_symbols",
            "init_emval",
            "count_emval_handles",
            "Emval",
            "emval_returnValue",
            "emval_lookupTypes",
            "emval_methodCallers",
            "emval_addMethodCaller",
            "reflectConstruct",
          ].forEach(U);
          var Mo, Io;
          if (
            ((Ye = function e() {
              (Mo || ne(), Mo || (Ye = e));
            }),
            ae.preInit)
          )
            for (
              "function" == typeof ae.preInit && (ae.preInit = [ae.preInit]);
              0 < ae.preInit.length;
            )
              ae.preInit.pop()();
          (ne(), (le = ie)); // Assertion for attempting to access module properties on the incoming
          // moduleArg.  In the past we used this object as the prototype of the module
          // and assigned properties to it, but now we return a distinct object.  This
          // keeps the instance private until it is ready (i.e the promise has been
          // resolved).
          for (const e of Object.keys(ae))
            e in r ||
              Object.defineProperty(r, e, {
                configurable: !0,
                get() {
                  S(
                    `Access to module property ('${e}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`,
                  );
                },
              }); // end include: postamble_modularize.js
          return le;
        }
      );
    })();
    ("object" == typeof exports && "object" == typeof module) ||
      ("function" == typeof define && define.amd);
    var s = {
      builderFunctions: [
        function (e) {
          o.VectorBoolean = o.VectorUint8;
        },
      ],
      fromVectorInt8: function (e) {
        let t = e.size(),
          r = new Int8Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorInt8: function (e) {
        let t = new o.VectorInt8();
        try {
          if ((t.resize(e.length, 0), e instanceof Int8Array)) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (-128n <= o && 127n >= o) {
                  (t.set(r, +o), r++);
                  continue;
                }
              } else if ("number" == typeof o && -128 <= o && 127 >= o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not a signed 8-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorInt16: function (e) {
        let t = e.size(),
          r = new Int16Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorInt16: function (e) {
        let t = new o.VectorInt16();
        try {
          if (
            (t.resize(e.length, 0),
            e instanceof Int16Array || e instanceof Int8Array || e instanceof Uint8Array)
          ) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (-32768n <= o && 32767n >= o) {
                  (t.set(r, +o), r++);
                  continue;
                }
              } else if ("number" == typeof o && -32768 <= o && 32767 >= o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not a signed 16-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorInt32: function (e) {
        let t = e.size(),
          r = new Int32Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorInt32: function (e) {
        let t = new o.VectorInt32();
        try {
          if (
            (t.resize(e.length, 0),
            e instanceof Int32Array ||
              e instanceof Int16Array ||
              e instanceof Int8Array ||
              e instanceof Uint16Array ||
              e instanceof Uint8Array)
          ) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (-2147483648n <= o && 2147483647n >= o) {
                  (t.set(r, +o), r++);
                  continue;
                }
              } else if ("number" == typeof o && -2147483648 <= o && 2147483647 >= o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not a signed 32-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorInt64: function (e) {
        let t = e.size(),
          r = new BigInt64Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorInt64: function (e) {
        let t = new o.VectorInt64();
        try {
          if ((t.resize(e.length, 0n), e instanceof BigInt64Array)) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else if (
            e instanceof Int32Array ||
            e instanceof Int16Array ||
            e instanceof Int8Array ||
            e instanceof Uint32Array ||
            e instanceof Uint16Array ||
            e instanceof Uint8Array
          ) {
            let r = 0;
            for (let o of e) (t.set(r, BigInt(o)), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (-9223372036854775808n <= o && 9223372036854775807n >= o) {
                  (t.set(r, o), r++);
                  continue;
                }
              } else if ("number" == typeof o) {
                let e = BigInt(o);
                if (-9223372036854775808n <= e && 9223372036854775807n >= e) {
                  (t.set(r, e), r++);
                  continue;
                }
              }
              throw new Error(`Array item at index ${r} is not a signed 64-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorUint8: function (e) {
        let t = e.size(),
          r = new Uint8Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorUint8: function (e) {
        let t = new o.VectorUint8();
        try {
          if ((t.resize(e.length, 0), e instanceof Uint8Array)) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (0n <= o && 255n >= o) {
                  (t.set(r, +o), r++);
                  continue;
                }
              } else if ("number" == typeof o && 0 <= o && 255 >= o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not an unsigned 8-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorUint16: function (e) {
        let t = e.size(),
          r = new Uint16Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorUint16: function (e) {
        let t = new o.VectorUint16();
        try {
          if ((t.resize(e.length, 0), e instanceof Uint16Array || e instanceof Uint8Array)) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (0n <= o && 65535n >= o) {
                  (t.set(r, +o), r++);
                  continue;
                }
              } else if ("number" == typeof o && 0 <= o && 65535 >= o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not an unsigned 16-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorUint32: function (e) {
        let t = e.size(),
          r = new Uint32Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorUint32: function (e) {
        let t = new o.VectorUint32();
        try {
          if (
            (t.resize(e.length, 0),
            e instanceof Uint32Array || e instanceof Uint16Array || e instanceof Uint8Array)
          ) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (0n <= o && 4294967295n >= o) {
                  (t.set(r, +o), r++);
                  continue;
                }
              } else if ("number" == typeof o && 0 <= o && 4294967295 >= o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not an unsigned 32-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorUint64: function (e) {
        let t = e.size(),
          r = new BigUint64Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorUint64: function (e) {
        let t = new o.VectorUint64();
        try {
          if ((t.resize(e.length, 0n), e instanceof BigUint64Array)) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else if (
            e instanceof Uint32Array ||
            e instanceof Uint16Array ||
            e instanceof Uint8Array
          ) {
            let r = 0;
            for (let o of e) (t.set(r, BigInt(o)), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                if (0n <= o && 18446744073709551615n >= o) {
                  (t.set(r, o), r++);
                  continue;
                }
              } else if ("number" == typeof o) {
                let e = BigInt(o);
                if (0n <= e && 18446744073709551615n >= e) {
                  (t.set(r, e), r++);
                  continue;
                }
              }
              throw new Error(`Array item at index ${r} is not an unsigned 64-bit integer.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorFloat: function (e) {
        let t = e.size(),
          r = new Float32Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorFloat: function (e) {
        let t = new o.VectorFloat();
        try {
          if (
            (t.resize(e.length, 0),
            e instanceof Float32Array ||
              e instanceof Float64Array ||
              e instanceof Int32Array ||
              e instanceof Int16Array ||
              e instanceof Int8Array ||
              e instanceof Uint32Array ||
              e instanceof Uint16Array ||
              e instanceof Uint8Array)
          ) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                (t.set(r, +o), r++);
                continue;
              } else if ("number" == typeof o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not a number.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorDouble: function (e) {
        let t = e.size(),
          r = new Float64Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorDouble: function (e) {
        let t = new o.VectorDouble();
        try {
          if (
            (t.resize(e.length, 0),
            e instanceof Float64Array ||
              e instanceof Float32Array ||
              e instanceof Int32Array ||
              e instanceof Int16Array ||
              e instanceof Int8Array ||
              e instanceof Uint32Array ||
              e instanceof Uint16Array ||
              e instanceof Uint8Array)
          ) {
            let r = 0;
            for (let o of e) (t.set(r, o), r++);
          } else {
            let r = 0;
            for (let o of e) {
              if ("bigint" == typeof o) {
                (t.set(r, +o), r++);
                continue;
              } else if ("number" == typeof o) {
                (t.set(r, o), r++);
                continue;
              }
              throw new Error(`Array item at index ${r} is not a number.`);
            }
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorBoolean: function (e) {
        let t = e.size(),
          r = Array(t);
        for (let o = 0; o < t; ++o) r[o] = 0 !== e.get(o);
        return r;
      },
      toVectorBoolean: function (e) {
        let t = new o.VectorBoolean();
        try {
          t.resize(e.length, 0);
          let r = 0;
          for (let o of e) {
            if ("boolean" == typeof o) {
              (t.set(r, o ? 1 : 0), r++);
              continue;
            }
            throw new Error(`Array item at index ${r} is not a boolean.`);
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
      fromVectorString: function (e) {
        let t = e.size(),
          r = Array(t);
        for (let o = 0; o < t; ++o) r[o] = e.get(o);
        return r;
      },
      toVectorString: function (e) {
        let t = new o.VectorString();
        try {
          t.resize(e.length, "");
          let r = 0;
          for (let o of e) {
            if ("string" == typeof o) {
              (t.set(r, o), r++);
              continue;
            }
            throw new Error(`Array item at index ${r} is not a string.`);
          }
          return t;
        } catch (e) {
          throw (t.delete(), e);
        }
      },
    };
    /* This file is automatically generated. Do not modify it manually as it will be overwritten! */ return (
      (s.fromVectorCompileTestDummyClass = function (e, t = !0) {
        let r = e.size(),
          o = Array(r);
        try {
          for (let s = 0; s < r; ++s)
            if (((o[s] = e.get(s)), !o[s] && ((o[s] = null), !t)))
              throw new Error(`Array item at index ${s} is null.`);
          return o;
        } catch (e) {
          for (let e of o) e && e.delete();
          throw e;
        }
      }),
      (s.toVectorCompileTestDummyClass = function (e, t = !0) {
        let r = new o.VectorCompileTestDummyClass();
        try {
          r.resize(e.length, null);
          let s = 0;
          for (let n of e) {
            if ("undefined" == typeof n || null === n) {
              if (!t) throw new Error(`Array item at index ${s} is null.`);
              s++;
              continue;
            }
            if (n instanceof o.CompileTestDummyClass) {
              (r.set(s, n), s++);
              continue;
            }
            throw new Error(
              `Array item at index ${s} is not an instance of CompileTestDummyClass class.`,
            );
          }
          return r;
        } catch (e) {
          throw (r.delete(), e);
        }
      }),
      (s.fromVectorLandmark = function (e, t = !0) {
        let r = e.size(),
          o = Array(r);
        try {
          for (let s = 0; s < r; ++s)
            if (((o[s] = e.get(s)), !o[s] && ((o[s] = null), !t)))
              throw new Error(`Array item at index ${s} is null.`);
          return o;
        } catch (e) {
          for (let e of o) e && e.delete();
          throw e;
        }
      }),
      (s.toVectorLandmark = function (e, t = !0) {
        let r = new o.VectorLandmark();
        try {
          r.resize(e.length, null);
          let s = 0;
          for (let n of e) {
            if ("undefined" == typeof n || null === n) {
              if (!t) throw new Error(`Array item at index ${s} is null.`);
              s++;
              continue;
            }
            if (n instanceof o.Landmark) {
              (r.set(s, n), s++);
              continue;
            }
            throw new Error(`Array item at index ${s} is not an instance of Landmark class.`);
          }
          return r;
        } catch (e) {
          throw (r.delete(), e);
        }
      }),
      (s.fromVectorLandmarkObservation = function (e, t = !0) {
        let r = e.size(),
          o = Array(r);
        try {
          for (let s = 0; s < r; ++s)
            if (((o[s] = e.get(s)), !o[s] && ((o[s] = null), !t)))
              throw new Error(`Array item at index ${s} is null.`);
          return o;
        } catch (e) {
          for (let e of o) e && e.delete();
          throw e;
        }
      }),
      (s.toVectorLandmarkObservation = function (e, t = !0) {
        let r = new o.VectorLandmarkObservation();
        try {
          r.resize(e.length, null);
          let s = 0;
          for (let n of e) {
            if ("undefined" == typeof n || null === n) {
              if (!t) throw new Error(`Array item at index ${s} is null.`);
              s++;
              continue;
            }
            if (n instanceof o.LandmarkObservation) {
              (r.set(s, n), s++);
              continue;
            }
            throw new Error(
              `Array item at index ${s} is not an instance of LandmarkObservation class.`,
            );
          }
          return r;
        } catch (e) {
          throw (r.delete(), e);
        }
      }),
      (s.fromVectorVector2 = function (e, t = !0) {
        let r = e.size(),
          o = Array(r);
        try {
          for (let s = 0; s < r; ++s)
            if (((o[s] = e.get(s)), !o[s] && ((o[s] = null), !t)))
              throw new Error(`Array item at index ${s} is null.`);
          return o;
        } catch (e) {
          for (let e of o) e && e.delete();
          throw e;
        }
      }),
      (s.toVectorVector2 = function (e, t = !0) {
        let r = new o.VectorVector2();
        try {
          r.resize(e.length, null);
          let s = 0;
          for (let n of e) {
            if ("undefined" == typeof n || null === n) {
              if (!t) throw new Error(`Array item at index ${s} is null.`);
              s++;
              continue;
            }
            if (n instanceof o.Vector2) {
              (r.set(s, n), s++);
              continue;
            }
            throw new Error(`Array item at index ${s} is not an instance of Vector2 class.`);
          }
          return r;
        } catch (e) {
          throw (r.delete(), e);
        }
      }),
      (s.fromVectorVector3 = function (e, t = !0) {
        let r = e.size(),
          o = Array(r);
        try {
          for (let s = 0; s < r; ++s)
            if (((o[s] = e.get(s)), !o[s] && ((o[s] = null), !t)))
              throw new Error(`Array item at index ${s} is null.`);
          return o;
        } catch (e) {
          for (let e of o) e && e.delete();
          throw e;
        }
      }),
      (s.toVectorVector3 = function (e, t = !0) {
        let r = new o.VectorVector3();
        try {
          r.resize(e.length, null);
          let s = 0;
          for (let n of e) {
            if ("undefined" == typeof n || null === n) {
              if (!t) throw new Error(`Array item at index ${s} is null.`);
              s++;
              continue;
            }
            if (n instanceof o.Vector3) {
              (r.set(s, n), s++);
              continue;
            }
            throw new Error(`Array item at index ${s} is not an instance of Vector3 class.`);
          }
          return r;
        } catch (e) {
          throw (r.delete(), e);
        }
      }),
      (t.Config = null),
      s.builderFunctions.push(function (e) {
        ((o.Config.prototype.getBootstraps = function () {
          let e = this.__getBootstraps();
          try {
            return s.fromVectorString(e);
          } finally {
            e.delete();
          }
        }),
          (o.Config.prototype.setBootstraps = function (e) {
            let t = s.toVectorString(e);
            try {
              return this.__setBootstraps(t);
            } finally {
              t.delete();
            }
          }),
          Object.defineProperty(o.Config.prototype, "bootstraps", {
            get: o.Config.prototype.getBootstraps,
            set: function (e) {
              this.setBootstraps(e);
            },
            enumerable: !0,
            configurable: !1,
          }),
          (o.Config.prototype.getRelays = function () {
            let e = this.__getRelays();
            try {
              return s.fromVectorString(e);
            } finally {
              e.delete();
            }
          }),
          (o.Config.prototype.setRelays = function (e) {
            let t = s.toVectorString(e);
            try {
              return this.__setRelays(t);
            } finally {
              t.delete();
            }
          }),
          Object.defineProperty(o.Config.prototype, "relays", {
            get: o.Config.prototype.getRelays,
            set: function (e) {
              this.setRelays(e);
            },
            enumerable: !0,
            configurable: !1,
          }),
          (o.Config.prototype.getPrivateKey = function () {
            let e = this.__getPrivateKey();
            try {
              return s.fromVectorUint8(e);
            } finally {
              e.delete();
            }
          }),
          (o.Config.prototype.setPrivateKey = function (e) {
            let t = s.toVectorUint8(e);
            try {
              this.__setPrivateKey(t);
            } finally {
              t.delete();
            }
          }),
          Object.defineProperty(o.Config.prototype, "privateKey", {
            get: o.Config.prototype.getPrivateKey,
            set: o.Config.prototype.setPrivateKey,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Config.prototype, "name", {
            get: o.Config.prototype.getName,
            set: o.Config.prototype.setName,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Config = o.Config));
      }),
      (t.PoseEstimation = null),
      s.builderFunctions.push(function () {
        ((o.PoseEstimation.solvePnP = function (e, t, r, n) {
          let a, i;
          try {
            return (
              (a = s.toVectorLandmark(e, !1)),
              (i = s.toVectorLandmarkObservation(t, !1)),
              o.PoseEstimation.__solvePnP(a, i, r, n)
            );
          } finally {
            (i && i.delete(), a && a.delete());
          }
        }),
          (t.PoseEstimation = o.PoseEstimation));
      }),
      (t.QRDetection = null),
      s.builderFunctions.push(function () {
        ((o.QRDetection.detectQRFromLuminance = function (e, t, r, n, a) {
          let i, l, p;
          try {
            ((i = s.toVectorUint8(e)), (l = new o.VectorString()), (p = new o.VectorVector2()));
            let d = o.QRDetection.__detectQRFromLuminance(i, t, r, l, p);
            if (d) {
              n.length = 0;
              let e = l.size();
              for (let t = 0; t < e; t++) n.push(l.get(t));
              for (let e of a) e.delete();
              a.length = 0;
              let t = p.size();
              for (let e = 0; e < t; e++) a.push(p.get(e));
            }
            return d;
          } finally {
            (p && p.delete(), l && l.delete(), i && i.delete());
          }
        }),
          (o.QRDetection.detectQRFromLuminanceLandmarkObservations = function (e, t, r) {
            let n;
            try {
              n = s.toVectorUint8(e);
              let a = [],
                l = o.QRDetection.__detectQRFromLuminanceLandmarkObservations(n, t, r);
              for (let e = 0; e < l.size(); e++) a.push(l.get(e));
              return a;
            } finally {
              n && n.delete();
            }
          }),
          (t.QRDetection = o.QRDetection));
      }),
      (t.Posemesh = null),
      s.builderFunctions.push(function (r) {
        ((o.Posemesh.prototype.sendMessage = function (t, r, o) {
          return e.posemeshNetworkingContextSendMessage(this.__context, t, r, o, 0);
        }),
          (o.Posemesh.prototype.sendString = function (t, r, o, s) {
            let n = new TextEncoder("utf-8").encode(t);
            if (r) {
              let e = new Uint8Array(n.length + 1);
              (e.set(n, 0), e.set(0, n.length), (n = e));
            }
            return e.posemeshNetworkingContextSendMessage(this.__context, n, o, s, 0);
          }),
          (t.Posemesh = o.Posemesh));
      }),
      (t.ArucoDetection = null),
      s.builderFunctions.push(function () {
        ((o.ArucoDetection.detectArucoFromLuminance = function (e, t, r, n, a, l) {
          let p, d, c;
          try {
            ((p = s.toVectorUint8(e)), (d = new o.VectorString()), (c = new o.VectorVector2()));
            let i = o.ArucoDetection.__detectArucoFromLuminance(p, t, r, n, d, c);
            if (i) {
              a.length = 0;
              let e = d.size();
              for (let t = 0; t < e; t++) a.push(d.get(t));
              for (let e of l) e.delete();
              l.length = 0;
              let t = c.size();
              for (let e = 0; e < t; e++) l.push(c.get(e));
            }
            return i;
          } finally {
            (c && c.delete(), d && d.delete(), p && p.delete());
          }
        }),
          (o.ArucoDetection.detectArucoFromLuminanceLandmarkObservations = function (e, t, r, n) {
            let a;
            try {
              a = s.toVectorUint8(e);
              let l = [],
                p = o.ArucoDetection.__detectArucoFromLuminanceLandmarkObservations(a, t, r, n);
              for (let e = 0; e < p.size(); e++) l.push(p.get(e));
              return l;
            } finally {
              a && a.delete();
            }
          }),
          (t.ArucoDetection = o.ArucoDetection));
      }),
      (t.CalibrationHelpers = null),
      s.builderFunctions.push(function () {
        ((o.CalibrationHelpers.getCalibrationMatrix = function (e, t, r) {
          return o.CalibrationHelpers.__getCalibrationMatrix(e, t, r);
        }),
          (t.CalibrationHelpers = o.CalibrationHelpers));
      }),
      (t.ArucoMarkerFormat = null),
      s.builderFunctions.push(function () {
        t.ArucoMarkerFormat = Object.freeze({
          SET_4X4_CODES_50: 0,
          SET_4X4_CODES_100: 1,
          SET_4X4_CODES_250: 2,
          SET_4X4_CODES_1000: 3,
          SET_5X5_CODES_50: 4,
          SET_5X5_CODES_100: 5,
          SET_5X5_CODES_250: 6,
          SET_5X5_CODES_1000: 7,
          SET_6X6_CODES_50: 8,
          SET_6X6_CODES_100: 9,
          SET_6X6_CODES_250: 10,
          SET_6X6_CODES_1000: 11,
          SET_7X7_CODES_50: 12,
          SET_7X7_CODES_100: 13,
          SET_7X7_CODES_250: 14,
          SET_7X7_CODES_1000: 15,
          SET_ARUCO_ORIGINAL: 16,
          SET_APRILTAG_CODES_16H5: 17,
          SET_APRILTAG_CODES_25H9: 18,
          SET_APRILTAG_CODES_36H10: 19,
          SET_APRILTAG_CODES_36H11: 20,
          SET_ARUCO_MIP_CODES_36H12: 21,
        });
      }),
      (t.CompileTestClassShowcaseAllMemberPropTypes = null),
      (t.CompileTestClassShowcaseAllMemberPropTypesAlias = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.CompileTestClassShowcaseAllMemberPropTypes.prototype, "int8Prop", {
          get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getInt8Prop,
          set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setInt8Prop,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "int16Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getInt16Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setInt16Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "int32Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getInt32Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setInt32Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "int64Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getInt64Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setInt64Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "unsignedInt8Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getUnsignedInt8Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setUnsignedInt8Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "unsignedInt16Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getUnsignedInt16Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setUnsignedInt16Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "unsignedInt32Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getUnsignedInt32Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setUnsignedInt32Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "unsignedInt64Prop",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getUnsignedInt64Prop,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setUnsignedInt64Prop,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "floatProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getFloatProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setFloatProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "doubleProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getDoubleProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setDoubleProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "boolProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getBoolProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setBoolProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "stringProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getStringProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setStringProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "stringRefProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getStringRefProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setStringRefProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "stringMixProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getStringMixProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setStringMixProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "enumProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getEnumProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setEnumProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "classProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getClassProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setClassProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "classRefProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getClassRefProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setClassRefProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "classMixProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getClassMixProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setClassMixProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "classPtrProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getClassPtrProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setClassPtrProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "classPtrRefProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getClassPtrRefProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setClassPtrRefProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "classPtrMixProp",
            {
              get: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__getClassPtrMixProp,
              set: o.CompileTestClassShowcaseAllMemberPropTypes.prototype.__setClassPtrMixProp,
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayInt8Prop",
            {
              get: function () {
                return s.fromVectorInt8(this.__getArrayInt8Prop());
              },
              set: function (e) {
                this.__setArrayInt8Prop(s.toVectorInt8(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayInt16Prop",
            {
              get: function () {
                return s.fromVectorInt16(this.__getArrayInt16Prop());
              },
              set: function (e) {
                this.__setArrayInt16Prop(s.toVectorInt16(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayInt32Prop",
            {
              get: function () {
                return s.fromVectorInt32(this.__getArrayInt32Prop());
              },
              set: function (e) {
                this.__setArrayInt32Prop(s.toVectorInt32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayInt64Prop",
            {
              get: function () {
                return s.fromVectorInt64(this.__getArrayInt64Prop());
              },
              set: function (e) {
                this.__setArrayInt64Prop(s.toVectorInt64(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayUnsignedInt8Prop",
            {
              get: function () {
                return s.fromVectorUint8(this.__getArrayUnsignedInt8Prop());
              },
              set: function (e) {
                this.__setArrayUnsignedInt8Prop(s.toVectorUint8(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayUnsignedInt16Prop",
            {
              get: function () {
                return s.fromVectorUint16(this.__getArrayUnsignedInt16Prop());
              },
              set: function (e) {
                this.__setArrayUnsignedInt16Prop(s.toVectorUint16(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayUnsignedInt32Prop",
            {
              get: function () {
                return s.fromVectorUint32(this.__getArrayUnsignedInt32Prop());
              },
              set: function (e) {
                this.__setArrayUnsignedInt32Prop(s.toVectorUint32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayUnsignedInt64Prop",
            {
              get: function () {
                return s.fromVectorUint64(this.__getArrayUnsignedInt64Prop());
              },
              set: function (e) {
                this.__setArrayUnsignedInt64Prop(s.toVectorUint64(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayFloatProp",
            {
              get: function () {
                return s.fromVectorFloat(this.__getArrayFloatProp());
              },
              set: function (e) {
                this.__setArrayFloatProp(s.toVectorFloat(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayDoubleProp",
            {
              get: function () {
                return s.fromVectorDouble(this.__getArrayDoubleProp());
              },
              set: function (e) {
                this.__setArrayDoubleProp(s.toVectorDouble(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayStringProp",
            {
              get: function () {
                return s.fromVectorString(this.__getArrayStringProp());
              },
              set: function (e) {
                this.__setArrayStringProp(s.toVectorString(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayEnumProp",
            {
              get: function () {
                return s.fromVectorInt32(this.__getArrayEnumProp());
              },
              set: function (e) {
                this.__setArrayEnumProp(s.toVectorInt32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(this.__getArrayClassProp(), !1);
              },
              set: function (e) {
                this.__setArrayClassProp(s.toVectorCompileTestDummyClass(e, !1));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefInt8Prop",
            {
              get: function () {
                return s.fromVectorInt8(this.__getArrayRefInt8Prop());
              },
              set: function (e) {
                this.__setArrayRefInt8Prop(s.toVectorInt8(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefInt16Prop",
            {
              get: function () {
                return s.fromVectorInt16(this.__getArrayRefInt16Prop());
              },
              set: function (e) {
                this.__setArrayRefInt16Prop(s.toVectorInt16(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefInt32Prop",
            {
              get: function () {
                return s.fromVectorInt32(this.__getArrayRefInt32Prop());
              },
              set: function (e) {
                this.__setArrayRefInt32Prop(s.toVectorInt32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefInt64Prop",
            {
              get: function () {
                return s.fromVectorInt64(this.__getArrayRefInt64Prop());
              },
              set: function (e) {
                this.__setArrayRefInt64Prop(s.toVectorInt64(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefUnsignedInt8Prop",
            {
              get: function () {
                return s.fromVectorUint8(this.__getArrayRefUnsignedInt8Prop());
              },
              set: function (e) {
                this.__setArrayRefUnsignedInt8Prop(s.toVectorUint8(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefUnsignedInt16Prop",
            {
              get: function () {
                return s.fromVectorUint16(this.__getArrayRefUnsignedInt16Prop());
              },
              set: function (e) {
                this.__setArrayRefUnsignedInt16Prop(s.toVectorUint16(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefUnsignedInt32Prop",
            {
              get: function () {
                return s.fromVectorUint32(this.__getArrayRefUnsignedInt32Prop());
              },
              set: function (e) {
                this.__setArrayRefUnsignedInt32Prop(s.toVectorUint32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefUnsignedInt64Prop",
            {
              get: function () {
                return s.fromVectorUint64(this.__getArrayRefUnsignedInt64Prop());
              },
              set: function (e) {
                this.__setArrayRefUnsignedInt64Prop(s.toVectorUint64(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefFloatProp",
            {
              get: function () {
                return s.fromVectorFloat(this.__getArrayRefFloatProp());
              },
              set: function (e) {
                this.__setArrayRefFloatProp(s.toVectorFloat(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefDoubleProp",
            {
              get: function () {
                return s.fromVectorDouble(this.__getArrayRefDoubleProp());
              },
              set: function (e) {
                this.__setArrayRefDoubleProp(s.toVectorDouble(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefStringProp",
            {
              get: function () {
                return s.fromVectorString(this.__getArrayRefStringProp());
              },
              set: function (e) {
                this.__setArrayRefStringProp(s.toVectorString(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefEnumProp",
            {
              get: function () {
                return s.fromVectorInt32(this.__getArrayRefEnumProp());
              },
              set: function (e) {
                this.__setArrayRefEnumProp(s.toVectorInt32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayRefClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(this.__getArrayRefClassProp(), !1);
              },
              set: function (e) {
                this.__setArrayRefClassProp(s.toVectorCompileTestDummyClass(e, !1));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixInt8Prop",
            {
              get: function () {
                return s.fromVectorInt8(this.__getArrayMixInt8Prop());
              },
              set: function (e) {
                this.__setArrayMixInt8Prop(s.toVectorInt8(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixInt16Prop",
            {
              get: function () {
                return s.fromVectorInt16(this.__getArrayMixInt16Prop());
              },
              set: function (e) {
                this.__setArrayMixInt16Prop(s.toVectorInt16(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixInt32Prop",
            {
              get: function () {
                return s.fromVectorInt32(this.__getArrayMixInt32Prop());
              },
              set: function (e) {
                this.__setArrayMixInt32Prop(s.toVectorInt32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixInt64Prop",
            {
              get: function () {
                return s.fromVectorInt64(this.__getArrayMixInt64Prop());
              },
              set: function (e) {
                this.__setArrayMixInt64Prop(s.toVectorInt64(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixUnsignedInt8Prop",
            {
              get: function () {
                return s.fromVectorUint8(this.__getArrayMixUnsignedInt8Prop());
              },
              set: function (e) {
                this.__setArrayMixUnsignedInt8Prop(s.toVectorUint8(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixUnsignedInt16Prop",
            {
              get: function () {
                return s.fromVectorUint16(this.__getArrayMixUnsignedInt16Prop());
              },
              set: function (e) {
                this.__setArrayMixUnsignedInt16Prop(s.toVectorUint16(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixUnsignedInt32Prop",
            {
              get: function () {
                return s.fromVectorUint32(this.__getArrayMixUnsignedInt32Prop());
              },
              set: function (e) {
                this.__setArrayMixUnsignedInt32Prop(s.toVectorUint32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixUnsignedInt64Prop",
            {
              get: function () {
                return s.fromVectorUint64(this.__getArrayMixUnsignedInt64Prop());
              },
              set: function (e) {
                this.__setArrayMixUnsignedInt64Prop(s.toVectorUint64(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixFloatProp",
            {
              get: function () {
                return s.fromVectorFloat(this.__getArrayMixFloatProp());
              },
              set: function (e) {
                this.__setArrayMixFloatProp(s.toVectorFloat(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixDoubleProp",
            {
              get: function () {
                return s.fromVectorDouble(this.__getArrayMixDoubleProp());
              },
              set: function (e) {
                this.__setArrayMixDoubleProp(s.toVectorDouble(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixStringProp",
            {
              get: function () {
                return s.fromVectorString(this.__getArrayMixStringProp());
              },
              set: function (e) {
                this.__setArrayMixStringProp(s.toVectorString(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixEnumProp",
            {
              get: function () {
                return s.fromVectorInt32(this.__getArrayMixEnumProp());
              },
              set: function (e) {
                this.__setArrayMixEnumProp(s.toVectorInt32(e));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayMixClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(this.__getArrayMixClassProp(), !1);
              },
              set: function (e) {
                this.__setArrayMixClassProp(s.toVectorCompileTestDummyClass(e, !1));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayPtrClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(this.__getArrayPtrClassProp(), !0);
              },
              set: function (e) {
                this.__setArrayPtrClassProp(s.toVectorCompileTestDummyClass(e, !0));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayPtrRefClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(this.__getArrayPtrRefClassProp(), !0);
              },
              set: function (e) {
                this.__setArrayPtrRefClassProp(s.toVectorCompileTestDummyClass(e, !0));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "arrayPtrMixClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(this.__getArrayPtrMixClassProp(), !0);
              },
              set: function (e) {
                this.__setArrayPtrMixClassProp(s.toVectorCompileTestDummyClass(e, !0));
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllMemberPropTypes.prototype,
            "dataProp",
            {
              get: function () {
                const e = this.__getDataProp(),
                  t = this.__getDataPropSize();
                return HEAPU8.subarray(e, e + t);
              },
              set: function (e) {
                if (!(e instanceof Uint8Array)) throw new Error("Invalid data type.");
                if (e.buffer !== HEAPU8.buffer) {
                  let t = null;
                  try {
                    ((t = _malloc(e.byteLength)),
                      new Uint8Array(HEAPU8.buffer, t, e.byteLength).set(e),
                      this.__setDataProp(t, e.byteLength));
                  } finally {
                    t && _free(t);
                  }
                  return;
                }
                this.__setDataProp(e.byteOffset, e.byteLength);
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          (t.CompileTestClassShowcaseAllMemberPropTypes =
            o.CompileTestClassShowcaseAllMemberPropTypes),
          (t.CompileTestClassShowcaseAllMemberPropTypesAlias =
            o.CompileTestClassShowcaseAllMemberPropTypes));
      }),
      (t.CompileTestClassShowcaseAllStaticPropTypes = null),
      (t.CompileTestClassShowcaseAllStaticPropTypesAlias = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "int8Prop", {
          get: o.CompileTestClassShowcaseAllStaticPropTypes.__getInt8Prop,
          set: o.CompileTestClassShowcaseAllStaticPropTypes.__setInt8Prop,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "int16Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getInt16Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setInt16Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "int32Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getInt32Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setInt32Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "int64Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getInt64Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setInt64Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "unsignedInt8Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getUnsignedInt8Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setUnsignedInt8Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "unsignedInt16Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getUnsignedInt16Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setUnsignedInt16Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "unsignedInt32Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getUnsignedInt32Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setUnsignedInt32Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "unsignedInt64Prop", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getUnsignedInt64Prop,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setUnsignedInt64Prop,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "floatProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getFloatProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setFloatProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "doubleProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getDoubleProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setDoubleProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "boolProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getBoolProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setBoolProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "stringProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getStringProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setStringProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "stringRefProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getStringRefProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setStringRefProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "stringMixProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getStringMixProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setStringMixProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "enumProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getEnumProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setEnumProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "classProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getClassProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setClassProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "classRefProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getClassRefProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setClassRefProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "classMixProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getClassMixProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setClassMixProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "classPtrProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getClassPtrProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setClassPtrProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "classPtrRefProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getClassPtrRefProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setClassPtrRefProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "classPtrMixProp", {
            get: o.CompileTestClassShowcaseAllStaticPropTypes.__getClassPtrMixProp,
            set: o.CompileTestClassShowcaseAllStaticPropTypes.__setClassPtrMixProp,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayInt8Prop", {
            get: function () {
              return s.fromVectorInt8(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayInt8Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayInt8Prop(s.toVectorInt8(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayInt16Prop", {
            get: function () {
              return s.fromVectorInt16(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayInt16Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayInt16Prop(s.toVectorInt16(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayInt32Prop", {
            get: function () {
              return s.fromVectorInt32(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayInt32Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayInt32Prop(s.toVectorInt32(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayInt64Prop", {
            get: function () {
              return s.fromVectorInt64(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayInt64Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayInt64Prop(s.toVectorInt64(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayUnsignedInt8Prop",
            {
              get: function () {
                return s.fromVectorUint8(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayUnsignedInt8Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayUnsignedInt8Prop(
                  s.toVectorUint8(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayUnsignedInt16Prop",
            {
              get: function () {
                return s.fromVectorUint16(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayUnsignedInt16Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayUnsignedInt16Prop(
                  s.toVectorUint16(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayUnsignedInt32Prop",
            {
              get: function () {
                return s.fromVectorUint32(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayUnsignedInt32Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayUnsignedInt32Prop(
                  s.toVectorUint32(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayUnsignedInt64Prop",
            {
              get: function () {
                return s.fromVectorUint64(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayUnsignedInt64Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayUnsignedInt64Prop(
                  s.toVectorUint64(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayFloatProp", {
            get: function () {
              return s.fromVectorFloat(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayFloatProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayFloatProp(s.toVectorFloat(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayDoubleProp", {
            get: function () {
              return s.fromVectorDouble(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayDoubleProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayDoubleProp(
                s.toVectorDouble(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayStringProp", {
            get: function () {
              return s.fromVectorString(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayStringProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayStringProp(
                s.toVectorString(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayEnumProp", {
            get: function () {
              return s.fromVectorInt32(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayEnumProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayEnumProp(s.toVectorInt32(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayClassProp", {
            get: function () {
              return s.fromVectorCompileTestDummyClass(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayClassProp(),
                !1,
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayClassProp(
                s.toVectorCompileTestDummyClass(e, !1),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefInt8Prop", {
            get: function () {
              return s.fromVectorInt8(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefInt8Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefInt8Prop(s.toVectorInt8(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefInt16Prop", {
            get: function () {
              return s.fromVectorInt16(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefInt16Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefInt16Prop(
                s.toVectorInt16(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefInt32Prop", {
            get: function () {
              return s.fromVectorInt32(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefInt32Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefInt32Prop(
                s.toVectorInt32(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefInt64Prop", {
            get: function () {
              return s.fromVectorInt64(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefInt64Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefInt64Prop(
                s.toVectorInt64(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayRefUnsignedInt8Prop",
            {
              get: function () {
                return s.fromVectorUint8(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefUnsignedInt8Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefUnsignedInt8Prop(
                  s.toVectorUint8(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayRefUnsignedInt16Prop",
            {
              get: function () {
                return s.fromVectorUint16(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefUnsignedInt16Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefUnsignedInt16Prop(
                  s.toVectorUint16(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayRefUnsignedInt32Prop",
            {
              get: function () {
                return s.fromVectorUint32(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefUnsignedInt32Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefUnsignedInt32Prop(
                  s.toVectorUint32(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayRefUnsignedInt64Prop",
            {
              get: function () {
                return s.fromVectorUint64(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefUnsignedInt64Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefUnsignedInt64Prop(
                  s.toVectorUint64(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefFloatProp", {
            get: function () {
              return s.fromVectorFloat(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefFloatProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefFloatProp(
                s.toVectorFloat(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayRefDoubleProp",
            {
              get: function () {
                return s.fromVectorDouble(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefDoubleProp(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefDoubleProp(
                  s.toVectorDouble(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayRefStringProp",
            {
              get: function () {
                return s.fromVectorString(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefStringProp(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefStringProp(
                  s.toVectorString(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefEnumProp", {
            get: function () {
              return s.fromVectorInt32(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefEnumProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefEnumProp(
                s.toVectorInt32(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayRefClassProp", {
            get: function () {
              return s.fromVectorCompileTestDummyClass(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayRefClassProp(),
                !1,
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayRefClassProp(
                s.toVectorCompileTestDummyClass(e, !1),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixInt8Prop", {
            get: function () {
              return s.fromVectorInt8(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixInt8Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixInt8Prop(s.toVectorInt8(e));
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixInt16Prop", {
            get: function () {
              return s.fromVectorInt16(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixInt16Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixInt16Prop(
                s.toVectorInt16(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixInt32Prop", {
            get: function () {
              return s.fromVectorInt32(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixInt32Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixInt32Prop(
                s.toVectorInt32(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixInt64Prop", {
            get: function () {
              return s.fromVectorInt64(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixInt64Prop(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixInt64Prop(
                s.toVectorInt64(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayMixUnsignedInt8Prop",
            {
              get: function () {
                return s.fromVectorUint8(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixUnsignedInt8Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixUnsignedInt8Prop(
                  s.toVectorUint8(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayMixUnsignedInt16Prop",
            {
              get: function () {
                return s.fromVectorUint16(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixUnsignedInt16Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixUnsignedInt16Prop(
                  s.toVectorUint16(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayMixUnsignedInt32Prop",
            {
              get: function () {
                return s.fromVectorUint32(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixUnsignedInt32Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixUnsignedInt32Prop(
                  s.toVectorUint32(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayMixUnsignedInt64Prop",
            {
              get: function () {
                return s.fromVectorUint64(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixUnsignedInt64Prop(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixUnsignedInt64Prop(
                  s.toVectorUint64(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixFloatProp", {
            get: function () {
              return s.fromVectorFloat(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixFloatProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixFloatProp(
                s.toVectorFloat(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayMixDoubleProp",
            {
              get: function () {
                return s.fromVectorDouble(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixDoubleProp(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixDoubleProp(
                  s.toVectorDouble(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayMixStringProp",
            {
              get: function () {
                return s.fromVectorString(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixStringProp(),
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixStringProp(
                  s.toVectorString(e),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixEnumProp", {
            get: function () {
              return s.fromVectorInt32(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixEnumProp(),
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixEnumProp(
                s.toVectorInt32(e),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayMixClassProp", {
            get: function () {
              return s.fromVectorCompileTestDummyClass(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayMixClassProp(),
                !1,
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayMixClassProp(
                s.toVectorCompileTestDummyClass(e, !1),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "arrayPtrClassProp", {
            get: function () {
              return s.fromVectorCompileTestDummyClass(
                o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayPtrClassProp(),
                !0,
              );
            },
            set: function (e) {
              o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayPtrClassProp(
                s.toVectorCompileTestDummyClass(e, !0),
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayPtrRefClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayPtrRefClassProp(),
                  !0,
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayPtrRefClassProp(
                  s.toVectorCompileTestDummyClass(e, !0),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(
            o.CompileTestClassShowcaseAllStaticPropTypes,
            "arrayPtrMixClassProp",
            {
              get: function () {
                return s.fromVectorCompileTestDummyClass(
                  o.CompileTestClassShowcaseAllStaticPropTypes.__getArrayPtrMixClassProp(),
                  !0,
                );
              },
              set: function (e) {
                o.CompileTestClassShowcaseAllStaticPropTypes.__setArrayPtrMixClassProp(
                  s.toVectorCompileTestDummyClass(e, !0),
                );
              },
              enumerable: !0,
              configurable: !1,
            },
          ),
          Object.defineProperty(o.CompileTestClassShowcaseAllStaticPropTypes, "dataProp", {
            get: function () {
              const e = o.CompileTestClassShowcaseAllStaticPropTypes.__getDataProp(),
                t = o.CompileTestClassShowcaseAllStaticPropTypes.__getDataPropSize();
              return HEAPU8.subarray(e, e + t);
            },
            set: function (e) {
              if (!(e instanceof Uint8Array)) throw new Error("Invalid data type.");
              if (e.buffer !== HEAPU8.buffer) {
                let t = null;
                try {
                  ((t = _malloc(e.byteLength)),
                    new Uint8Array(HEAPU8.buffer, t, e.byteLength).set(e),
                    o.CompileTestClassShowcaseAllStaticPropTypes.__setDataProp(t, e.byteLength));
                } finally {
                  t && _free(t);
                }
                return;
              }
              o.CompileTestClassShowcaseAllStaticPropTypes.__setDataProp(
                e.byteOffset,
                e.byteLength,
              );
            },
            enumerable: !0,
            configurable: !1,
          }),
          (t.CompileTestClassShowcaseAllStaticPropTypes =
            o.CompileTestClassShowcaseAllStaticPropTypes),
          (t.CompileTestClassShowcaseAllStaticPropTypesAlias =
            o.CompileTestClassShowcaseAllStaticPropTypes));
      }),
      (t.CompileTestDummyClass = null),
      (t.CompileTestDummyClassAlias = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.CompileTestDummyClass.prototype, "dummyMemberProperty", {
          get: o.CompileTestDummyClass.prototype.__getDummyMemberProperty,
          set: o.CompileTestDummyClass.prototype.__setDummyMemberProperty,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.CompileTestDummyClass, "dummyStaticProperty", {
            get: o.CompileTestDummyClass.__getDummyStaticProperty,
            set: o.CompileTestDummyClass.__setDummyStaticProperty,
            enumerable: !0,
            configurable: !1,
          }),
          (t.CompileTestDummyClass = o.CompileTestDummyClass),
          (t.CompileTestDummyClassAlias = o.CompileTestDummyClass));
      }),
      (t.CompileTestExampleEnum = null),
      (t.CompileTestExampleEnumAlias = null),
      s.builderFunctions.push(function () {
        ((t.CompileTestExampleEnum = Object.freeze({
          FIRST_CONSTANT: 0,
          SECOND_CONSTANT: 1,
          THIRD_CONSTANT: 25,
          FOURTH_CONSTANT: 40,
          FIFTH_CONSTANT: 41,
        })),
          (t.CompileTestExampleEnumAlias = t.CompileTestExampleEnum));
      }),
      (t.CompileTestExampleFlags = null),
      (t.CompileTestExampleFlagsAlias = null),
      s.builderFunctions.push(function () {
        ((t.CompileTestExampleFlags = Object.freeze({
          FIRST_FLAG: 1,
          SECOND_FLAG: 2,
          THIRD_FLAG: 4,
          FOURTH_FLAG: 8,
          FIFTH_FLAG: 16,
        })),
          (t.CompileTestExampleFlagsAlias = t.CompileTestExampleFlags));
      }),
      (t.CompileTestExampleFlags2 = null),
      (t.CompileTestExampleFlags2Alias = null),
      s.builderFunctions.push(function () {
        ((t.CompileTestExampleFlags2 = Object.freeze({
          FIRST_FLAG: 8,
          SECOND_FLAG: 12,
          THIRD_FLAG: 99,
          FOURTH_FLAG: 135,
          FIFTH_FLAG: 8888,
        })),
          (t.CompileTestExampleFlags2Alias = t.CompileTestExampleFlags2));
      }),
      (t.CompileTestFunctions = null),
      (t.CompileTestFunctionsAlias = null),
      s.builderFunctions.push(function () {
        ((t.CompileTestFunctions = o.CompileTestFunctions),
          (t.CompileTestFunctionsAlias = o.CompileTestFunctions));
      }),
      (t.CompileTestMethods = null),
      (t.CompileTestMethodsAlias = null),
      s.builderFunctions.push(function () {
        ((t.CompileTestMethods = o.CompileTestMethods),
          (t.CompileTestMethodsAlias = o.CompileTestMethods));
      }),
      (t.Landmark = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Landmark.prototype, "type", {
          get: o.Landmark.prototype.__getType,
          set: o.Landmark.prototype.__setType,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Landmark.prototype, "id", {
            get: o.Landmark.prototype.__getId,
            set: o.Landmark.prototype.__setId,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Landmark.prototype, "position", {
            get: o.Landmark.prototype.__getPosition,
            set: o.Landmark.prototype.__setPosition,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Landmark = o.Landmark));
      }),
      (t.LandmarkObservation = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.LandmarkObservation.prototype, "type", {
          get: o.LandmarkObservation.prototype.__getType,
          set: o.LandmarkObservation.prototype.__setType,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.LandmarkObservation.prototype, "id", {
            get: o.LandmarkObservation.prototype.__getId,
            set: o.LandmarkObservation.prototype.__setId,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.LandmarkObservation.prototype, "position", {
            get: o.LandmarkObservation.prototype.__getPosition,
            set: o.LandmarkObservation.prototype.__setPosition,
            enumerable: !0,
            configurable: !1,
          }),
          (t.LandmarkObservation = o.LandmarkObservation));
      }),
      (t.Matrix2x2 = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Matrix2x2.prototype, "m00", {
          get: o.Matrix2x2.prototype.__getM00,
          set: o.Matrix2x2.prototype.__setM00,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Matrix2x2.prototype, "m01", {
            get: o.Matrix2x2.prototype.__getM01,
            set: o.Matrix2x2.prototype.__setM01,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix2x2.prototype, "m10", {
            get: o.Matrix2x2.prototype.__getM10,
            set: o.Matrix2x2.prototype.__setM10,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix2x2.prototype, "m11", {
            get: o.Matrix2x2.prototype.__getM11,
            set: o.Matrix2x2.prototype.__setM11,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Matrix2x2 = o.Matrix2x2));
      }),
      (t.Matrix3x3 = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Matrix3x3.prototype, "m00", {
          get: o.Matrix3x3.prototype.__getM00,
          set: o.Matrix3x3.prototype.__setM00,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Matrix3x3.prototype, "m01", {
            get: o.Matrix3x3.prototype.__getM01,
            set: o.Matrix3x3.prototype.__setM01,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m02", {
            get: o.Matrix3x3.prototype.__getM02,
            set: o.Matrix3x3.prototype.__setM02,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m10", {
            get: o.Matrix3x3.prototype.__getM10,
            set: o.Matrix3x3.prototype.__setM10,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m11", {
            get: o.Matrix3x3.prototype.__getM11,
            set: o.Matrix3x3.prototype.__setM11,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m12", {
            get: o.Matrix3x3.prototype.__getM12,
            set: o.Matrix3x3.prototype.__setM12,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m20", {
            get: o.Matrix3x3.prototype.__getM20,
            set: o.Matrix3x3.prototype.__setM20,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m21", {
            get: o.Matrix3x3.prototype.__getM21,
            set: o.Matrix3x3.prototype.__setM21,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix3x3.prototype, "m22", {
            get: o.Matrix3x3.prototype.__getM22,
            set: o.Matrix3x3.prototype.__setM22,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Matrix3x3 = o.Matrix3x3));
      }),
      (t.Matrix4x4 = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Matrix4x4.prototype, "m00", {
          get: o.Matrix4x4.prototype.__getM00,
          set: o.Matrix4x4.prototype.__setM00,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Matrix4x4.prototype, "m01", {
            get: o.Matrix4x4.prototype.__getM01,
            set: o.Matrix4x4.prototype.__setM01,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m02", {
            get: o.Matrix4x4.prototype.__getM02,
            set: o.Matrix4x4.prototype.__setM02,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m03", {
            get: o.Matrix4x4.prototype.__getM03,
            set: o.Matrix4x4.prototype.__setM03,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m10", {
            get: o.Matrix4x4.prototype.__getM10,
            set: o.Matrix4x4.prototype.__setM10,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m11", {
            get: o.Matrix4x4.prototype.__getM11,
            set: o.Matrix4x4.prototype.__setM11,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m12", {
            get: o.Matrix4x4.prototype.__getM12,
            set: o.Matrix4x4.prototype.__setM12,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m13", {
            get: o.Matrix4x4.prototype.__getM13,
            set: o.Matrix4x4.prototype.__setM13,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m20", {
            get: o.Matrix4x4.prototype.__getM20,
            set: o.Matrix4x4.prototype.__setM20,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m21", {
            get: o.Matrix4x4.prototype.__getM21,
            set: o.Matrix4x4.prototype.__setM21,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m22", {
            get: o.Matrix4x4.prototype.__getM22,
            set: o.Matrix4x4.prototype.__setM22,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m23", {
            get: o.Matrix4x4.prototype.__getM23,
            set: o.Matrix4x4.prototype.__setM23,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m30", {
            get: o.Matrix4x4.prototype.__getM30,
            set: o.Matrix4x4.prototype.__setM30,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m31", {
            get: o.Matrix4x4.prototype.__getM31,
            set: o.Matrix4x4.prototype.__setM31,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m32", {
            get: o.Matrix4x4.prototype.__getM32,
            set: o.Matrix4x4.prototype.__setM32,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Matrix4x4.prototype, "m33", {
            get: o.Matrix4x4.prototype.__getM33,
            set: o.Matrix4x4.prototype.__setM33,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Matrix4x4 = o.Matrix4x4));
      }),
      (t.Pose = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Pose.prototype, "position", {
          get: o.Pose.prototype.__getPosition,
          set: o.Pose.prototype.__setPosition,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Pose.prototype, "rotation", {
            get: o.Pose.prototype.__getRotation,
            set: o.Pose.prototype.__setRotation,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Pose = o.Pose));
      }),
      (t.Quaternion = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Quaternion.prototype, "x", {
          get: o.Quaternion.prototype.__getX,
          set: o.Quaternion.prototype.__setX,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Quaternion.prototype, "y", {
            get: o.Quaternion.prototype.__getY,
            set: o.Quaternion.prototype.__setY,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Quaternion.prototype, "z", {
            get: o.Quaternion.prototype.__getZ,
            set: o.Quaternion.prototype.__setZ,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Quaternion.prototype, "w", {
            get: o.Quaternion.prototype.__getW,
            set: o.Quaternion.prototype.__setW,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Quaternion = o.Quaternion));
      }),
      (t.SolvePnpMethod = null),
      s.builderFunctions.push(function () {
        t.SolvePnpMethod = Object.freeze({
          SOLVE_PNP_ITERATIVE: 0,
          SOLVE_PNP_EPNP: 1,
          SOLVE_PNP_P3P: 2,
          SOLVE_PNP_DLS: 3,
          SOLVE_PNP_UPNP: 4,
          SOLVE_PNP_AP3P: 5,
          SOLVE_PNP_IPPE: 6,
          SOLVE_PNP_IPPE_SQUARE: 7,
          SOLVE_PNP_SQPNP: 8,
        });
      }),
      (t.Vector2 = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Vector2.prototype, "x", {
          get: o.Vector2.prototype.__getX,
          set: o.Vector2.prototype.__setX,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Vector2.prototype, "y", {
            get: o.Vector2.prototype.__getY,
            set: o.Vector2.prototype.__setY,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Vector2.prototype, "length", {
            get: o.Vector2.prototype.__getLength,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Vector2 = o.Vector2));
      }),
      (t.Vector3 = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Vector3.prototype, "x", {
          get: o.Vector3.prototype.__getX,
          set: o.Vector3.prototype.__setX,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Vector3.prototype, "y", {
            get: o.Vector3.prototype.__getY,
            set: o.Vector3.prototype.__setY,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Vector3.prototype, "z", {
            get: o.Vector3.prototype.__getZ,
            set: o.Vector3.prototype.__setZ,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Vector3.prototype, "length", {
            get: o.Vector3.prototype.__getLength,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Vector3 = o.Vector3));
      }),
      (t.Vector4 = null),
      s.builderFunctions.push(function () {
        (Object.defineProperty(o.Vector4.prototype, "x", {
          get: o.Vector4.prototype.__getX,
          set: o.Vector4.prototype.__setX,
          enumerable: !0,
          configurable: !1,
        }),
          Object.defineProperty(o.Vector4.prototype, "y", {
            get: o.Vector4.prototype.__getY,
            set: o.Vector4.prototype.__setY,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Vector4.prototype, "z", {
            get: o.Vector4.prototype.__getZ,
            set: o.Vector4.prototype.__setZ,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Vector4.prototype, "w", {
            get: o.Vector4.prototype.__getW,
            set: o.Vector4.prototype.__setW,
            enumerable: !0,
            configurable: !1,
          }),
          Object.defineProperty(o.Vector4.prototype, "length", {
            get: o.Vector4.prototype.__getLength,
            enumerable: !0,
            configurable: !1,
          }),
          (t.Vector4 = o.Vector4));
      }),
      (s.verifyBaseCommitId = function () {
        return "1c577bc700a3d972fcfdd88b21c5680b9af61327" === e.posemeshNetworkingGetCommitId();
      }),
      (s.verifyMainCommitId = function () {
        return "1c577bc700a3d972fcfdd88b21c5680b9af61327" === o.Posemesh.getCommitId();
      }),
      (t.initializePosemesh = async function (t = void 0, n = void 0) {
        if (
          ("undefined" == typeof t && (t = "./PosemeshBase.wasm"),
          "undefined" == typeof n && (n = "./Posemesh.wasm"),
          !r)
        )
          throw new Error("Cannot initialize Posemesh module.");
        r = !1;
        try {
          e = await e(t);
        } catch (e) {
          throw (
            (r = !0),
            "string" != typeof e && (e = e.toString()),
            new Error("Failed to initialize Posemesh Base WebAssembly: " + e)
          );
        }
        if (!s.verifyBaseCommitId())
          throw new Error(
            "Posemesh Base WebAssembly file version does not match the Posemesh JavaScript file version.",
          );
        try {
          let e = n;
          if ((e instanceof URL && (e = e.href), "string" == typeof e))
            if ("undefined" == typeof window) {
              let t;
              try {
                t = require("fs/promises");
              } catch {
                t = require("fs").promises;
              }
              e = await t.readFile(e);
            } else {
              if ("function" != typeof fetch) throw new Error("Unavailable 'fetch()' function.");
              e = fetch(e);
            }
          let t = new Promise(function (e) {
              s = e;
            }),
            r = o({
              instantiateWasm: function (t, r) {
                return (
                  (async function () {
                    if ("object" == typeof e && "function" == typeof e.then) {
                      if ("instantiateStreaming" in WebAssembly)
                        return (await WebAssembly.instantiateStreaming(e, t)).instance;
                      e = await e;
                    }
                    if (
                      (e instanceof Response && (e = await e.arrayBuffer()),
                      !(
                        e instanceof ArrayBuffer ||
                        e instanceof Uint8Array ||
                        ("undefined" != typeof Buffer && Buffer.isBuffer(e))
                      ))
                    )
                      throw new Error("Invalid 'source' buffer type.");
                    return (await WebAssembly.instantiate(e, t)).instance;
                  })()
                    .then(function (e) {
                      (r(e), s());
                    })
                    .catch(function (e) {
                      ((a = e), s());
                    }),
                  {}
                );
              },
            }),
            s,
            a;
          if ((await t, "undefined" != typeof a)) throw a;
          o = await r;
        } catch (e) {
          throw (
            "string" != typeof e && (e = e.toString()),
            new Error("Failed to initialize Posemesh WebAssembly: " + e)
          );
        }
        if (!s.verifyMainCommitId())
          throw new Error(
            "Posemesh WebAssembly file version does not match the Posemesh JavaScript file version.",
          );
        for (let e of s.builderFunctions) e({});
      }),
      t
    );
  },
);
