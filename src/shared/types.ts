/** Shared message contract between the SDK (host) and the checkout iframe. */
export const MSG_SOURCE = "dodo-checkout" as const;

export type CheckoutErrorCode =
  | "PAYMENT_DECLINED"
  | "PAYMENT_FAILED"
  | "INVALID_FORM"
  | "PRODUCT_NOT_FOUND"
  | "CHECKOUT_LOAD_FAILED";
export const ERROR_CODES: CheckoutErrorCode[] = ["PAYMENT_DECLINED", "PAYMENT_FAILED", "INVALID_FORM", "PRODUCT_NOT_FOUND", "CHECKOUT_LOAD_FAILED"];

export type CloseReason = "user" | "load_failed" | "host";

/** host -> checkout */
export type HostMessage = { source: typeof MSG_SOURCE; type: "OPEN_CHECKOUT"; productId: string };

/** checkout -> host. Deliberately contains no card data or internal state. */
export type CheckoutMessage = { source: typeof MSG_SOURCE } & (
  | { type: "CHECKOUT_READY" }
  | { type: "PAYMENT_PROCESSING" }
  | { type: "PAYMENT_SUCCESS"; sessionId: string }
  | { type: "PAYMENT_ERROR"; code: CheckoutErrorCode; message: string }
  | { type: "CHECKOUT_CLOSE" }
);

export const isObj = (d: unknown): d is Record<string, unknown> => typeof d === "object" && d !== null;
