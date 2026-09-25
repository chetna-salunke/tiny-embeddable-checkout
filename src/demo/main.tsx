import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { DodoCheckout } from "../sdk/DodoCheckout";
import "./demo.css";

function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const log = (...l: string[]) => setLogs((p) => [...p, ...l]);
  const buy = () => {
    setOpen(true); log("Checkout opened");
    DodoCheckout.open({
      productId: "prod_123",
      onEvent: ({ type }) => type === "processing" && log("Payment processing"),
      onSuccess: ({ sessionId }) => log("Payment successful", `Session ID: ${sessionId}`),
      onError: ({ code, message }) => log("Payment failed", `Code: ${code}`, `Message: ${message}`),
      onClose: ({ reason }) => { setOpen(false); log(`Checkout closed (reason: ${reason})`); },
    });
  };
  return (
    <div className="page">
      <section className="store">
        <div className="hero" aria-hidden>N</div>
        <h1>Northwind Pro – Annual</h1>
        <p className="price">$49</p>
        <p>Unlimited projects, priority support and offline sync for one year.</p>
        <button onClick={buy} disabled={open}>Buy Now</button>
        <p className="hint">Test cards: <code>4242 4242 4242 4242</code> success · <code>4000 0000 0000 0002</code> declined · <code>4000 0000 0000 0341</code> fails once, then succeeds. Any future expiry, any CVV.</p>
      </section>
      <aside className="logs" aria-live="polite">
        <h2>Callback Logs <button onClick={() => setLogs([])}>Clear</button></h2>
        {logs.length === 0 ? <p className="empty">Nothing yet – click Buy Now.</p> : <ol>{logs.map((l, i) => <li key={i}>{l}</li>)}</ol>}
      </aside>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
