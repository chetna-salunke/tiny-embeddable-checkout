import { CheckoutMessage, CheckoutErrorCode, CloseReason, ERROR_CODES, HostMessage, MSG_SOURCE, isObj } from "../shared/types";

export interface OpenOptions {
  productId: string;
  onSuccess?: (r: { sessionId: string }) => void;
  onClose?: (r: { reason: CloseReason }) => void;
  onError?: (e: { code: CheckoutErrorCode; message: string }) => void;
  /** Optional lifecycle hints ("ready" | "processing") – handy for logging. */
  onEvent?: (e: { type: "ready" | "processing" }) => void;
}
export interface CheckoutHandle { close: () => void }

const CHECKOUT_URL: string = (import.meta.env.VITE_CHECKOUT_URL as string | undefined) ?? new URL("/checkout.html", location.origin).href;
const LOAD_TIMEOUT_MS = 8000;

let active: CheckoutHandle | null = null;

const safe = <A>(fn: ((a: A) => void) | undefined, arg: A) => {
  try { fn?.(arg); } catch (e) { console.error("[DodoCheckout] merchant callback threw", e); }
};

function open(opts: OpenOptions): CheckoutHandle {
  if (active) { console.warn("[DodoCheckout] a checkout is already open; ignoring duplicate open()"); return active; }

  const url = new URL(CHECKOUT_URL);
  const checkoutOrigin = url.origin;
  url.searchParams.set("parent", location.origin);

  const prevFocus = document.activeElement as HTMLElement | null;
  const prevOverflow = document.body.style.overflow;
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "Checkout");
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(15,17,26,.55);backdrop-filter:blur(2px);padding:16px";
  const iframe = document.createElement("iframe");
  iframe.title = "Secure checkout";
  iframe.src = url.href;
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  iframe.style.cssText = "width:min(440px,100%);height:min(680px,100%);border:0;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.35)";
  overlay.appendChild(iframe);
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);

  let closed = false, ready = false;

  const teardown = (reason: CloseReason) => {
    if (closed) return; closed = true;
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("keydown", onKey);
    overlay.remove();
    document.body.style.overflow = prevOverflow;
    active = null;
    prevFocus?.focus?.();
    safe(opts.onClose, { reason });
  };

  const loadFailed = () => {
    if (closed || ready) return;
    window.removeEventListener("message", onMessage);
    overlay.innerHTML = "";
    const card = document.createElement("div");
    card.style.cssText = "background:#fff;border-radius:16px;padding:28px;max-width:360px;font:15px/1.5 system-ui,sans-serif;text-align:center;color:#111";
    card.innerHTML = "<h2 style='margin:0 0 8px;font-size:18px'>Checkout unavailable</h2><p style='margin:0 0 20px;color:#555'>We couldn't load the secure checkout. Check your connection and try again.</p>";
    const btn = document.createElement("button");
    btn.textContent = "Close";
    btn.style.cssText = "padding:10px 20px;border-radius:10px;border:0;background:#111;color:#fff;font:inherit;cursor:pointer";
    btn.onclick = () => teardown("load_failed");
    card.appendChild(btn); overlay.appendChild(card); btn.focus();
    safe(opts.onError, { code: "CHECKOUT_LOAD_FAILED" as const, message: "The checkout failed to load." });
  };
  const timer = setTimeout(loadFailed, LOAD_TIMEOUT_MS);
  iframe.addEventListener("error", loadFailed);

  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") teardown("user"); };
  window.addEventListener("keydown", onKey);

  function onMessage(e: MessageEvent) {
    // Trust only our own iframe at the known checkout origin.
    if (e.origin !== checkoutOrigin || e.source !== iframe.contentWindow) return;
    const d = e.data;
    if (!isObj(d) || d.source !== MSG_SOURCE || typeof d.type !== "string") return;
    const m = d as unknown as CheckoutMessage;
    switch (m.type) {
      case "CHECKOUT_READY": {
        ready = true; clearTimeout(timer);
        const msg: HostMessage = { source: MSG_SOURCE, type: "OPEN_CHECKOUT", productId: opts.productId };
        iframe.contentWindow?.postMessage(msg, checkoutOrigin);
        safe(opts.onEvent, { type: "ready" as const }); break;
      }
      case "PAYMENT_PROCESSING": safe(opts.onEvent, { type: "processing" as const }); break;
      case "PAYMENT_SUCCESS":
        if (typeof m.sessionId === "string") safe(opts.onSuccess, { sessionId: m.sessionId }); break;
      case "PAYMENT_ERROR": {
        const code = ERROR_CODES.includes(m.code) ? m.code : "PAYMENT_FAILED";
        safe(opts.onError, { code, message: typeof m.message === "string" ? m.message : "Payment failed." }); break;
      }
      case "CHECKOUT_CLOSE": teardown("user"); break;
      default: console.warn("[DodoCheckout] ignored unknown message", m);
    }
  }
  window.addEventListener("message", onMessage);

  active = { close: () => teardown("host") };
  return active;
}

export const DodoCheckout = { open, close: () => active?.close(), isOpen: () => active !== null };
