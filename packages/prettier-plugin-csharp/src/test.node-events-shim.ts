import events from "events";

type AbortCallback = ((event: Event) => void) | (() => void);

const base = events as typeof events & {
  addAbortListener?: (signal: AbortSignal, listener: AbortCallback) => Disposable;
};

const addAbortListener =
  base.addAbortListener ??
  ((signal: AbortSignal, listener: AbortCallback): Disposable => {
    const invoke = () => {
      (listener as (event: Event) => void)(new Event("abort"));
    };

    if (signal.aborted) {
      queueMicrotask(invoke);
      const disposable = {
        [Symbol.dispose]: () => {}
      } as Disposable & { dispose?: () => void };
      disposable.dispose = disposable[Symbol.dispose];
      return disposable;
    }

    const abortHandler = () => {
      invoke();
    };

    signal.addEventListener("abort", abortHandler, { once: true });
    const disposable = {
      [Symbol.dispose]: () => signal.removeEventListener("abort", abortHandler)
    } as Disposable & { dispose?: () => void };
    disposable.dispose = disposable[Symbol.dispose];
    return disposable;
  });

const {
  EventEmitter,
  EventEmitterAsyncResource,
  captureRejectionSymbol,
  captureRejections,
  defaultMaxListeners,
  errorMonitor,
  getEventListeners,
  listenerCount,
  on,
  once,
  setMaxListeners
} = base;

export {
  EventEmitter,
  EventEmitterAsyncResource,
  captureRejectionSymbol,
  captureRejections,
  defaultMaxListeners,
  errorMonitor,
  getEventListeners,
  listenerCount,
  on,
  once,
  setMaxListeners,
  addAbortListener
};

export default events;
