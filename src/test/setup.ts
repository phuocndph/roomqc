import '@testing-library/jest-dom'

// React Router creates Request objects with jsdom's AbortSignal. Node's native
// Request rejects that signal when the two globals come from different realms.
// Use one AbortController implementation for both test realms.
if (typeof globalThis.AbortController === 'function') {
  Object.defineProperty(window, 'AbortController', {
    configurable: true,
    value: globalThis.AbortController,
  })
}
if (typeof globalThis.AbortSignal === 'function') {
  Object.defineProperty(window, 'AbortSignal', {
    configurable: true,
    value: globalThis.AbortSignal,
  })
}

// Node's undici Request performs a strict AbortSignal realm check. The data
// router only needs a Request during redirect bookkeeping in these tests, so
// omit the signal to keep jsdom and Node compatible.
const NativeRequest = globalThis.Request
if (typeof NativeRequest === 'function') {
  globalThis.Request = class CompatibleRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: undefined } : undefined)
    }
  } as typeof Request
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// ResizeObserver stub (Radix UI)
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO

// scrollIntoView stub for jsdom
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
