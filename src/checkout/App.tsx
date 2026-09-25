import { FormEvent, useEffect, useRef, useState } from "react";
import { CheckoutErrorCode, CheckoutMessage, MSG_SOURCE, isObj } from "../shared/types";

type Status = "loading" | "idle" | "processing" | "success" | "error";
const PRODUCTS: Record<string, { name: string; price: number }> = { prod_123: { name: "Northwind Pro – Annual", price: 49 } };

// Parent origin is passed by the SDK; we only talk to that origin.
const parentOrigin = (() => { try { return new URL(new URLSearchParams(location.search).get("parent") ?? "").origin; } catch { return null; } })();
const send = (m: CheckoutMessage extends infer T ? (T extends { source: unknown } ? Omit<T, "source"> : never) : never) => parentOrigin && window.parent.postMessage({ source: MSG_SOURCE, ...m }, parentOrigin);

const luhn = (n: string) => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; };
type Form = { email: string; card: string; exp: string; cvv: string };
function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  const card = f.card.replace(/\s/g, "");
  if (!f.email.trim()) e.email = "Enter your email."; else if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email address.";
  if (!card) e.card = "Enter your card number."; else if (!/^\d{13,19}$/.test(card) || !luhn(card)) e.card = "This card number isn't valid.";
  const m = /^(\d{2})\/(\d{2})$/.exec(f.exp);
  if (!f.exp) e.exp = "Enter expiry."; else if (!m || +m[1] < 1 || +m[1] > 12) e.exp = "Use MM/YY.";
  else { const now = new Date(); if (2000 + +m[2] < now.getFullYear() || (2000 + +m[2] === now.getFullYear() && +m[1] < now.getMonth() + 1)) e.exp = "This card has expired."; }
  if (!f.cvv) e.cvv = "Enter CVV."; else if (!/^\d{3,4}$/.test(f.cvv)) e.cvv = "CVV is 3–4 digits.";
  return e;
}

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [productId, setProductId] = useState<string | null>(null);
  const [f, setF] = useState<Form>({ email: "", card: "", exp: "", cvv: "" });
  const [errs, setErrs] = useState<ReturnType<typeof validate>>({});
  const [err, setErr] = useState<{ code: CheckoutErrorCode; message: string } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const busy = useRef(false);          // synchronous guard against double-submit
  const flaky = useRef(0);             // attempts on the "fail once" card
  const panel = useRef<HTMLHeadingElement>(null);
  const product = productId ? PRODUCTS[productId] : null;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== parentOrigin || e.source !== window.parent) return;
      const d = e.data;
      if (isObj(d) && d.source === MSG_SOURCE && d.type === "OPEN_CHECKOUT" && typeof d.productId === "string") {
        setProductId(d.productId);
        if (PRODUCTS[d.productId]) setStatus("idle");
        else { const x = { code: "PRODUCT_NOT_FOUND" as const, message: "This product isn't available." }; setErr(x); setStatus("error"); send({ type: "PAYMENT_ERROR", ...x }); }
      }
    };
    window.addEventListener("message", onMsg);
    send({ type: "CHECKOUT_READY" });
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => { if (status === "success" || status === "error") panel.current?.focus(); }, [status]);
  const close = () => { if (!busy.current) send({ type: "CHECKOUT_CLOSE" }); };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  async function pay(ev: FormEvent) {
    ev.preventDefault();
    if (busy.current) return;
    const v = validate(f); setErrs(v);
    if (Object.keys(v).length) { document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); return; }
    busy.current = true; setStatus("processing"); send({ type: "PAYMENT_PROCESSING" });
    await new Promise((r) => setTimeout(r, 1600));
    const card = f.card.replace(/\s/g, "");
    let fail: { code: CheckoutErrorCode; message: string } | null = null;
    if (card === "4000000000000002") fail = { code: "PAYMENT_DECLINED", message: "Your card was declined." };
    else if (card === "4000000000000341" && flaky.current++ === 0) fail = { code: "PAYMENT_FAILED", message: "We couldn't complete your payment. Please try again." };
    busy.current = false;
    if (fail) { setErr(fail); setStatus("error"); send({ type: "PAYMENT_ERROR", ...fail }); }
    else { const id = "sess_" + Math.random().toString(36).slice(2, 10); setSessionId(id); setStatus("success"); send({ type: "PAYMENT_SUCCESS", sessionId: id }); }
  }

  const card = (s: string) => s.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const exp = (s: string) => { const d = s.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; };
  const digits = (s: string) => s.replace(/\D/g, "").slice(0, 4);

  const field = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, fmt: (s: string) => string) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: fmt(e.target.value) })} aria-invalid={!!errs[k]} aria-describedby={errs[k] ? k + "-e" : undefined} disabled={status === "processing"} {...props} />
      {errs[k] && <p className="err" id={k + "-e"}>{errs[k]}</p>}
    </div>
  );

  return (
    <main className="shell">
      <header className="top">
        <span aria-hidden>🔒</span><span>Secure checkout</span>
        <button className="x" onClick={close} disabled={status === "processing"} aria-label="Close checkout">✕</button>
      </header>

      {status === "loading" && <div className="skeleton" role="status" aria-label="Loading checkout"><i /><i /><i /><i /></div>}

      {status === "success" && (
        <section className="panel ok fade" role="status">
          <div className="badge">✓</div>
          <h1 tabIndex={-1} ref={panel}>Payment successful</h1>
          <p>Your payment has been completed.</p>
          <p>Session ID: <code>{sessionId}</code></p>
          <button className="btn" onClick={close}>Close</button>
        </section>
      )}

      {status === "error" && err && (
        <section className="panel bad fade" role="alert">
          <div className="badge">!</div>
          <h1 tabIndex={-1} ref={panel}>{err.code === "PRODUCT_NOT_FOUND" ? "Product unavailable" : "Payment failed"}</h1>
          <p>{err.message}</p>
          {err.code !== "PRODUCT_NOT_FOUND" && <button className="btn" onClick={() => setStatus("idle")}>Try again</button>}
          <button className="btn ghost" onClick={close}>Close</button>
        </section>
      )}

      {(status === "idle" || status === "processing") && product && (
        <form onSubmit={pay} noValidate className="fade">
          <div className="summary"><div><small>You're paying</small><strong>{product.name}</strong></div><span className="price">${product.price}</span></div>
          <fieldset><legend>Customer</legend>{field("email", "Email", { type: "email", autoComplete: "email", placeholder: "you@example.com", autoFocus: true }, (s) => s)}</fieldset>
          <fieldset><legend>Payment</legend>
            {field("card", "Card number", { inputMode: "numeric", autoComplete: "cc-number", placeholder: "4242 4242 4242 4242" }, card)}
            <div className="row">
              {field("exp", "Expiry", { inputMode: "numeric", autoComplete: "cc-exp", placeholder: "MM/YY" }, exp)}
              {field("cvv", "CVV", { inputMode: "numeric", autoComplete: "cc-csc", placeholder: "123", type: "password" }, digits)}
            </div>
          </fieldset>
          <button className="btn" type="submit" disabled={status === "processing"} aria-busy={status === "processing"}>
            {status === "processing" ? <><span className="spin" />Processing...</> : `Pay $${product.price}`}
          </button>
          <p className="fine">Test mode · card details never leave this frame.</p>
        </form>
      )}
    </main>
  );
}
