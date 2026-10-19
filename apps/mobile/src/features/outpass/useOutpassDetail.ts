import type { Decision, OutpassDto } from "@outpassed/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "../../api/client";
import { readJson, safeKey, writeJson } from "../../lib/store";
import { useSession } from "../../auth/session";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

/**
 * Pass detail for every role. Students get the live QR while the pass is
 * usable; parents and wardens get the decision actions.
 */
export function useOutpassDetail(id: string) {
  const { user, token } = useSession();
  const ribbon = useRibbon();
  const q = useQuery((t) => api.getOutpass(t, id), [id]);
  const pass = q.data;
  const role = user?.role;

  const decide = useAction((t, decision: Decision, reason?: string) => api.decideOutpass(t, id, decision, reason));
  const cancel = useAction((t) => api.cancelOutpass(t, id));
  const extend = useAction((t, until: string, reason: string) => api.requestExtension(t, id, until, reason));
  const decideExt = useAction((t, d: Decision) => api.decideExtension(t, id, d));

  const apply = (updated: OutpassDto | undefined) => {
    if (updated) q.setData(updated);
    return updated;
  };

  // --- Live QR (student, approved or out) ---
  const wantsQr = role === "STUDENT" && !!pass && (pass.status === "APPROVED" || pass.status === "OUT");
  const [qr, setQr] = useState<{ token: string; lifetime: number; offline?: boolean } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQr = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.outpassQr(token, id);
      // Refresh a little before the server stops accepting it.
      const lifetime = Math.max(10, res.expiresIn - 15);
      setQr({ token: res.token, lifetime });
      setQrError(null);
      // Keep a copy that works at the gate even if this phone loses internet.
      if (res.offlineToken) void writeJson(safeKey(`outpass.offlinePass.${id}`), { token: res.offlineToken, until: res.offlineExpiresAt });
      timer.current = setTimeout(fetchQr, lifetime * 1000);
    } catch (err) {
      const saved = err instanceof ApiError && err.status === 0 ? await readJson<{ token: string; until: string | null }>(safeKey(`outpass.offlinePass.${id}`)) : null;
      if (saved && (!saved.until || new Date(saved.until) > new Date())) {
        setQr({ token: saved.token, lifetime: 30, offline: true });
        setQrError(null);
      } else {
        setQrError(errorMessage(err, "Couldn't load your code"));
      }
      timer.current = setTimeout(fetchQr, 8000);
    }
  }, [token, id]);

  useEffect(() => {
    if (!wantsQr) return;
    void fetchQr();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [wantsQr, fetchQr]);

  // While a pass is in motion, poll so the student sees approvals and gate scans land.
  useEffect(() => {
    if (!pass || ["RETURNED", "REJECTED", "CANCELLED"].includes(pass.status)) return;
    const t = setInterval(() => void q.reload(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass?.status]);

  const canDecide =
    !!pass &&
    ((role === "PARENT" && pass.status === "PENDING_PARENT") ||
      ((role === "WARDEN" || role === "ADMIN") && (pass.status === "PENDING_WARDEN" || pass.status === "PENDING_PARENT")));
  const needsOverrideReason = (role === "WARDEN" || role === "ADMIN") && pass?.status === "PENDING_PARENT";
  const canCancel = role === "STUDENT" && !!pass && ["PENDING_PARENT", "PENDING_WARDEN", "APPROVED"].includes(pass.status);
  const extensionPending = pass?.extension?.status === "PENDING";
  const canAskExtension = role === "STUDENT" && !!pass && (pass.status === "OUT" || pass.status === "APPROVED") && !extensionPending;
  const canDecideExtension = (role === "WARDEN" || role === "ADMIN") && extensionPending;

  return {
    ...q,
    pass,
    role,
    qr,
    qrError,
    showQr: wantsQr,
    canDecide,
    needsOverrideReason,
    canCancel,
    decide: async (d: Decision, reason?: string) => {
      const updated = apply(await decide.run(d, reason));
      if (!updated) return updated;
      if (d === "REJECT") ribbon.show({ tone: "info", title: "Request rejected", body: `${updated.student.name} has been told.` });
      else if (updated.status === "APPROVED") ribbon.show({ tone: "success", title: "Outpass approved", body: `${updated.student.name} can show the gate pass now.`, celebrate: true });
      else ribbon.show({ tone: "success", title: "Approved", body: "Sent to the warden for the final OK." });
      return updated;
    },
    deciding: decide.busy,
    decideError: decide.error,
    cancel: async () => {
      const updated = apply(await cancel.run());
      if (updated) ribbon.show({ tone: "info", title: "Request cancelled" });
      return updated;
    },
    cancelling: cancel.busy,
    cancelError: cancel.error,
    canAskExtension,
    canDecideExtension,
    requestExtension: async (until: Date, reason: string) => {
      const updated = apply(await extend.run(until.toISOString(), reason));
      if (updated) ribbon.show({ tone: "success", title: "Asked for more time", body: "The warden will reply. Your parent has been told." });
      return updated;
    },
    extending: extend.busy,
    extendError: extend.error,
    decideExtension: async (d: Decision) => {
      const updated = apply(await decideExt.run(d));
      if (updated) {
        ribbon.show(
          d === "APPROVE"
            ? { tone: "success", title: "More time approved", body: `${updated.student.name} and their parent have been told.` }
            : { tone: "info", title: "Extra time declined", body: `${updated.student.name} has been told to return on time.` },
        );
      }
      return updated;
    },
    decidingExtension: decideExt.busy,
    decideExtensionError: decideExt.error,
  };
}
