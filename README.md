# Tiny Embeddable Checkout

This is a small checkout that any website can add with one script call. It opens in an iframe, 
lets the user "pay" with a fake card, and tells the website what happened. There's no backend 
and no real payment — everything is faked on the frontend.

## How to run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173 — that's the demo store.

`npm run build` will type-check everything and build it for production.

## How the pieces talk to each other

It's basically four layers:

Demo site → SDK → iframe → Checkout app

- The demo site calls `DodoCheckout.open()`.
- The SDK creates an iframe and loads the checkout inside it.
- The checkout app is a full React app running inside that iframe.
- They talk to each other using `postMessage`, not by directly touching each other's code or DOM.

The conversation goes like this:
1. The checkout iframe loads and sends a "I'm ready" message.
2. The SDK replies with the product ID.
3. As the user pays, the checkout sends messages back: "processing", then either "success" (with a session ID) or "error" (with a reason).
4. If the user closes the checkout, it sends a "closed" message too.

All these messages are typed, so nothing is just random strings floating around — they're 
defined once in `shared/types.ts` and used everywhere.

## Why I built it this way (security)

The biggest rule I followed: the website embedding this checkout should never see the card 
number, CVV, or email. Those only ever exist inside the iframe.

To make sure random messages can't be faked or spoofed, both sides check where a message is 
actually coming from before trusting it — the SDK only listens to its own iframe, and the 
checkout only listens to its parent window. Nothing gets sent to "anyone" — every message 
has a specific destination.

The only things that ever leave the iframe are: a session ID on success, or an error code and 
message on failure. That's it.

## Fake test cards

| Card number | What happens |
|---|---|
| 4242 4242 4242 4242 | Payment succeeds |
| 4000 0000 0000 0002 | Payment is declined |
| 4000 0000 0000 0341 | Fails the first time, succeeds if you try again |

Any future expiry date and any 3–4 digit CVV works.

## Two decisions I went back and forth on

**1. Iframe vs just rendering the checkout directly on the page**
An iframe is more work — you have to build a messaging system instead of just passing props. 
But it's the only real way to guarantee the merchant's website (or any third-party script on 
it) literally cannot read what the user types into the card fields. I decided that trade-off 
was worth it for something handling payment info.

**2. What happens if someone clicks Buy twice**
I didn't want a second click to throw an error or open a second checkout on top of the first. 
So clicking Buy again while one is already open just does nothing new — it reuses the same 
checkout that's already there. Same idea for the Pay button: once a payment is processing, 
it's disabled so it can't be double-submitted.

## What I'd do next if I kept working on this

- Connect it to a real payment processor instead of faking it
- Generate the session ID on a server instead of in the browser, so it can be trusted
- Add automated tests instead of just testing manually
- Add stricter security headers (like limiting which sites are even allowed to embed this)
- Test it properly with a screen reader and on mobile keyboards
- Package the SDK as a single script file a site can just drop in