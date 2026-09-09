var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// probe.ts
import { DurableObject } from "cloudflare:workers";
var siteOrigin = "https://noobius-compute-crew.rivd609.chatgpt.site";
var json = /* @__PURE__ */ __name((body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } }), "json");
function permittedOrigin(request) {
  const url = new URL(request.url);
  const expected = ["localhost", "127.0.0.1"].includes(url.hostname) ? url.origin : siteOrigin;
  return request.headers.get("Origin") === expected;
}
__name(permittedOrigin, "permittedOrigin");
function singleExchange(receipt) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  const timer = setTimeout(() => server.close(1e3, "Probe expired"), 5e3);
  server.addEventListener("close", () => clearTimeout(timer));
  server.addEventListener("message", (event) => {
    if (event.data === "ping")
      server.send(JSON.stringify({ pong: true, receipt }));
    server.close(event.data === "ping" ? 1e3 : 1008, "Probe complete");
    clearTimeout(timer);
  });
  return new Response(null, { status: 101, webSocket: client });
}
__name(singleExchange, "singleExchange");
async function transportProbe(request, env) {
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  const mode = new URL(request.url).searchParams.get("mode");
  if (!mode) return json({ probe: 1, roomBinding: !!env.TRANSPORT_PROBE });
  if (!permittedOrigin(request))
    return json({ error: "Origin not allowed" }, 403);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
    return json({ error: "WebSocket required" }, 426);
  if (mode === "socket") return singleExchange(0);
  if (mode === "room") {
    if (!env.TRANSPORT_PROBE)
      return json({ error: "Room binding unavailable" }, 503);
    return env.TRANSPORT_PROBE.getByName("hosting-proof-v1").fetch(request);
  }
  return json({ error: "Unknown probe" }, 404);
}
__name(transportProbe, "transportProbe");
var TransportProbe = class extends DurableObject {
  static {
    __name(this, "TransportProbe");
  }
  async fetch(request) {
    if (!permittedOrigin(request) || request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return json({ error: "WebSocket required" }, 400);
    const receipt = await this.ctx.storage.transaction(async (txn) => {
      const next = (await txn.get("receipt") ?? 0) + 1;
      await txn.put("receipt", next);
      return next;
    });
    return singleExchange(receipt);
  }
};

// entry.ts
var worker = {
  fetch(request, env) {
    if (new URL(request.url).pathname === "/api/noobius/transport-probe")
      return transportProbe(request, env);
    return new Response("Transport proof only", { status: 404 });
  }
};
var entry_default = worker;

// ../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-1EtHeV/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = entry_default;

// ../../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-1EtHeV/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker2) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker2;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker2.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker2.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker2,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker2.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker2.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  TransportProbe,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=entry.js.map
