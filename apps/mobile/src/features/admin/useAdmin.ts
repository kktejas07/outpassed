import type { Role } from "@outpassed/shared";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

/** Live campus numbers for wardens and admins. Polls every 30 s while open. */
export function useDashboard() {
  const q = useQuery((t) => api.dashboard(t));
  useEffect(() => {
    const t = setInterval(() => void q.reload(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ...q, summary: q.data };
}

export function usePeople() {
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const q = useQuery((t) => api.listUsers(t, role === "ALL" ? undefined : role), [role]);
  return { ...q, role, setRole, users: q.data ?? [] };
}

export function useAddStaff(onDone: () => void) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"WARDEN" | "GUARD" | "ADMIN">("GUARD");
  const ribbon = useRibbon();
  const action = useAction((t) => api.createStaff(t, { name: name.trim(), email: email.trim(), password, role }));
  const valid = name.trim() && /\S+@\S+\.\S+/.test(email) && password.length >= 8;
  return {
    name, setName, email, setEmail, password, setPassword, role, setRole,
    valid: !!valid,
    submit: async () => {
      if (!valid) return;
      const u = await action.run();
      if (u) {
        ribbon.show({ tone: "success", title: "Staff account created", body: `${u.name} can sign in with the temporary password.` });
        setName("");
        setEmail("");
        setPassword("");
        onDone();
      }
    },
    submitting: action.busy,
    error: action.error,
  };
}

export function useLinkGuardian(studentId: string | null, onDone: () => void) {
  const [parentEmail, setParentEmail] = useState("");
  const [relation, setRelation] = useState("Parent");
  const ribbon = useRibbon();
  const action = useAction((t) => api.linkGuardian(t, { studentId: studentId!, parentEmail: parentEmail.trim(), relation }));
  return {
    parentEmail, setParentEmail, relation, setRelation,
    submit: async () => {
      if (!studentId || !parentEmail.trim()) return;
      const r = await action.run();
      if (r) {
        ribbon.show({ tone: "success", title: "Parent linked", body: "They'll be asked to approve this student's outpasses." });
        setParentEmail("");
        onDone();
      }
    },
    submitting: action.busy,
    error: action.error,
  };
}
