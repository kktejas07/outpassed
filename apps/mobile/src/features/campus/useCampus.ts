import { useState } from "react";
import { campus, type EventDto, type FeeDto, type MarketItemDto, type OfferDto } from "../../api/client";
import { useSession } from "../../auth/session";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

/** Everything on the Campus tab, loaded together. Each part fails on its own without breaking the rest. */
export function useCampusHub() {
  const { user } = useSession();
  const paysFees = user?.role === "STUDENT" || user?.role === "PARENT";
  const q = useQuery(async (t) => {
    const settled = await Promise.allSettled([
      paysFees ? campus.fees(t) : Promise.resolve(null),
      campus.events(t, "upcoming"),
      campus.market(t, { scope: "browse" }),
      user?.showOffers ? campus.offers(t) : Promise.resolve(null),
    ]);
    const val = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
    return {
      fees: val(settled[0]),
      events: val(settled[1]) ?? ([] as EventDto[]),
      market: val(settled[2])?.items ?? ([] as MarketItemDto[]),
      marketAvailable: settled[2].status === "fulfilled",
      offers: val(settled[3])?.offers ?? ([] as OfferDto[]),
    };
  }, [user?.id, user?.showOffers]);
  return { ...q, hub: q.data, paysFees, showOffers: !!user?.showOffers };
}

export function useFees() {
  const q = useQuery((t) => campus.fees(t));
  const ribbon = useRibbon();
  const pay = useAction((t, id: string) => campus.payOnline(t, id));
  const check = useAction((t, id: string) => campus.checkPayment(t, id));
  const proof = useAction((t, id: string, image: string, reference: string) => campus.uploadProof(t, id, image, reference));
  return {
    ...q,
    fees: q.data?.fees ?? ([] as FeeDto[]),
    totals: q.data?.totals,
    online: !!q.data?.onlinePayment,
    actionError: pay.error ?? check.error ?? proof.error,
    busy: pay.busy || check.busy || proof.busy,
    payLink: (id: string) => pay.run(id),
    check: async (id: string) => {
      const f = await check.run(id);
      if (f) {
        void q.reload();
        ribbon.show(f.status === "PAID" ? { tone: "success", title: "Payment received", body: `${f.title} is paid.`, celebrate: true } : { tone: "info", title: "Not received yet", body: "If you just paid, give it a minute and check again." });
      }
    },
    sendProof: async (id: string, image: string, reference: string) => {
      const f = await proof.run(id, image, reference);
      if (f) {
        void q.reload();
        ribbon.show({ tone: "success", title: "Proof sent to the office", body: "You'll get a message once they've checked it." });
      }
      return !!f;
    },
  };
}

export function useEvents() {
  const [scope, setScope] = useState<"upcoming" | "mine" | "past">("upcoming");
  const q = useQuery((t) => campus.events(t, scope), [scope]);
  return { ...q, scope, setScope, events: q.data ?? [] };
}

export function useEventDetail(id: string) {
  const q = useQuery((t) => campus.event(t, id), [id]);
  const ribbon = useRibbon();
  const reg = useAction((t) => campus.register(t, id));
  const unreg = useAction((t) => campus.unregister(t, id));
  return {
    ...q,
    event: q.data,
    busy: reg.busy || unreg.busy,
    actionError: reg.error ?? unreg.error,
    register: async () => {
      const e = await reg.run();
      if (e) {
        q.setData(e);
        ribbon.show({ tone: "success", title: "You're registered", body: `${e.title}. We'll see you there.`, celebrate: true });
      }
    },
    unregister: async () => {
      const e = await unreg.run();
      if (e) {
        q.setData(e);
        ribbon.show({ tone: "info", title: "Registration cancelled" });
      }
    },
  };
}

export function useMarket() {
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<"browse" | "mine">("browse");
  const q = useQuery((t) => campus.market(t, { scope, category: category || undefined }), [scope, category]);
  return { ...q, items: q.data?.items ?? [], categories: q.data?.categories ?? [], category, setCategory, scope, setScope };
}
