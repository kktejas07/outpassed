import type { Decision, OutpassDto } from "@outpassed/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { useSession } from "../../auth/session";
import { useAction, useQuery } from "../../lib/useQuery";

/**
 * Pass detail for every role. Students get the live QR while the pass is
 * usable; parents and wardens get the decision actions.
 */
export function useOutpassDetail(id: string) {
  const { user, token } = useSession();
  const q = useQuery((t) => api.getOutpass(t, id), [id]);
  const pass = q.data;
  const role = user?.role;

  const decide = useAction((t, decision: Decision, reason?: string) => api.decideOutpass(t, id, decision, reason));
  const cancel = useAction((t) => api.cancelOutpass(t, id));

  const apply = (updated: OutpassDto | undefined) => {
    if (updated) q.setData(updated);
    return updated;
  };

  // --- Live QR (student, approved or out) ---
  const wantsQr = role === "STUDENT" && !!pass && (pass.status === "APPROVED" || pass.status === "OUT");
  const [qr, setQr] = useState<{ token: string; lifetime: number } | null>(null);
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
      timer.current = setTimeout(fetchQr, lifetime * 1000);
    } catch (err) {
      setQrError(errorMessage(err, "Couldn't load your code"));
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
    decide: async (d: Decision, reason?: string) => apply(await decide.run(d, reason)),
    deciding: decide.busy,
    decideError: decide.error,
    cancel: async () => apply(await cancel.run()),
    cancelling: cancel.busy,
    cancelError: cancel.error,
  };
}
