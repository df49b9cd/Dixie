import events from "events";
import Module from "module";

type AbortListener = () => void;
type AbortEventListener = (event: Event) => void;
type AbortCallback = AbortListener | AbortEventListener;
type AbortTeardown = (() => void) | Disposable;

type EventsModule = typeof events & {
  addAbortListener?: (signal: AbortSignal, listener: AbortCallback) => AbortTeardown;
};

function ensureAbortListener(target: EventsModule): void {
  if (typeof target.addAbortListener === "function") {
    return;
  }

  target.addAbortListener = (signal, listener) => {
    if (signal.aborted) {
      queueMicrotask(() => {
        (listener as AbortEventListener)(new Event("abort"));
      });
      return {
        dispose: () => {},
        [Symbol.dispose]: () => {}
      };
    }

    const abortHandler = () => {
      (listener as AbortEventListener)(new Event("abort"));
    };

    signal.addEventListener("abort", abortHandler, { once: true });
    return {
      dispose: () => signal.removeEventListener("abort", abortHandler),
      [Symbol.dispose]: () => signal.removeEventListener("abort", abortHandler)
    };
  };
}

ensureAbortListener(events as EventsModule);

const moduleAny = Module as unknown as {
  _load: (
    request: string,
    parent: NodeModule | null,
    isMain: boolean
  ) => unknown;
};
const originalLoad = moduleAny._load;

moduleAny._load = function patchedModuleLoad(
  request: string,
  parent: NodeModule | null,
  isMain: boolean
) {
  if (request === "node:events") {
    const loaded = originalLoad.call(this, "events", parent, isMain) as EventsModule;
    ensureAbortListener(loaded);
    return loaded;
  }

  return originalLoad.call(this, request, parent, isMain);
};
