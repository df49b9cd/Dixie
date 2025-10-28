import events from "events";

type AbortCallback = (event: Event) => void;

const base = events as typeof events & {
  addAbortListener?: (signal: AbortSignal, listener: AbortCallback) => Disposable;
};

const createDisposable = (teardown: () => void): Disposable & { dispose: () => void } => {
  const dispose = () => teardown();
  return {
    dispose,
    [Symbol.dispose]: dispose
  };
};

const addAbortListener =
  base.addAbortListener ??
  ((signal: AbortSignal, listener: AbortCallback): Disposable => {
    const invoke = () => {
      listener(new Event("abort"));
    };

    if (signal.aborted) {
      queueMicrotask(invoke);
      return createDisposable(() => {});
    }

    const abortHandler = () => {
      invoke();
    };

    signal.addEventListener("abort", abortHandler, { once: true });
    return createDisposable(() => signal.removeEventListener("abort", abortHandler));
  });

const EventEmitter = base.EventEmitter;
const EventEmitterAsyncResource = base.EventEmitterAsyncResource;
const captureRejectionSymbol = base.captureRejectionSymbol;
const captureRejections = base.captureRejections;
const defaultMaxListeners = base.defaultMaxListeners;
const errorMonitor = base.errorMonitor;

const getEventListeners = (...args: Parameters<typeof base.getEventListeners>) =>
  base.getEventListeners(...args);
const listenerCount = (...args: Parameters<typeof base.listenerCount>) =>
  base.listenerCount(...args);
const on = (...args: Parameters<typeof base.on>) => base.on(...args);
const once = (...args: Parameters<typeof base.once>) => base.once(...args);
const setMaxListeners = (...args: Parameters<typeof base.setMaxListeners>) =>
  base.setMaxListeners(...args);

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
