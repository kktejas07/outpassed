import { env } from "../env";

/**
 * Online fee payment through Razorpay payment links: the server creates a
 * link, the app opens it, and Razorpay calls our webhook when it's paid.
 * Tests replace the gateway with a fake.
 */
export type PaymentLink = { id: string; url: string };
export type PaymentGateway = {
  createLink(input: { amountPaise: number; feeId: string; description: string; name: string; phone: string | null; email: string; callbackUrl: string }): Promise<PaymentLink>;
  /** "paid" | "created" | "expired" | "cancelled", plus the payment id once paid. */
  linkStatus(linkId: string): Promise<{ status: string; paymentId: string | null }>;
};

const razorpay: PaymentGateway = {
  async createLink(input) {
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth() },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        accept_partial: false,
        description: input.description.slice(0, 2048),
        reference_id: input.feeId.slice(0, 40),
        customer: { name: input.name, email: input.email.endsWith(".local") ? undefined : input.email, contact: input.phone ?? undefined },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { feeId: input.feeId },
        callback_url: input.callbackUrl,
        callback_method: "get",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { id?: string; short_url?: string; error?: { description?: string } } | null;
    if (!res.ok || !json?.id || !json.short_url) throw new Error(`Razorpay: ${json?.error?.description ?? res.status}`);
    return { id: json.id, url: json.short_url };
  },
  async linkStatus(linkId) {
    const res = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(linkId)}`, { headers: { authorization: auth() }, signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as { status?: string; payments?: { payment_id: string; status: string }[] } | null;
    if (!res.ok || !json?.status) throw new Error(`Razorpay status check failed: ${res.status}`);
    const paid = json.payments?.find((p) => p.status === "captured");
    return { status: json.status, paymentId: paid?.payment_id ?? null };
  },
};

function auth() {
  return `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

let gateway: PaymentGateway | null = null;

export function onlinePaymentsEnabled(): boolean {
  return gateway !== null || Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function paymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  if (!onlinePaymentsEnabled()) throw new Error("Online payment isn't set up");
  return razorpay;
}

/** Tests install a fake gateway (null restores Razorpay). */
export function setPaymentGateway(next: PaymentGateway | null) {
  gateway = next;
}
