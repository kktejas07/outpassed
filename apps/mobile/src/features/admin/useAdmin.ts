import type { HostelDto, ImportResult, Role } from "@outpassed/shared";
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

/** Bulk import: load a CSV, preview what would happen, then import. */
export function useImport() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const ribbon = useRibbon();
  const action = useAction((t, dryRun: boolean) => api.importStudents(t, csv, dryRun, sendWelcome));
  return {
    csv,
    setCsv: (v: string) => {
      setCsv(v);
      setPreview(null);
      setDone(null);
    },
    fileName,
    setFileName,
    sendWelcome,
    setSendWelcome,
    preview,
    done,
    busy: action.busy,
    error: action.error,
    check: async () => {
      setDone(null);
      const r = await action.run(true);
      if (r) setPreview(r);
    },
    commit: async () => {
      const r = await action.run(false);
      if (r) {
        setDone(r);
        setPreview(null);
        ribbon.show({
          tone: "success",
          celebrate: r.summary.created > 0,
          title: `${r.summary.created} student${r.summary.created === 1 ? "" : "s"} added`,
          body: [
            r.summary.updated ? `${r.summary.updated} updated` : null,
            r.summary.parentsCreated ? `${r.summary.parentsCreated} parents added` : null,
            r.summary.errors ? `${r.summary.errors} rows skipped` : null,
          ].filter(Boolean).join(" · ") || undefined,
        });
      }
    },
  };
}

/** Hostels and which wardens look after each one. */
export function useHostels() {
  const q = useQuery(async (t) => {
    const [hostels, wardens] = await Promise.all([api.adminHostels(t), api.listUsers(t, "WARDEN")]);
    return { hostels, wardens };
  });
  const ribbon = useRibbon();
  const replace = (h: HostelDto) =>
    q.setData((d) => (d ? { ...d, hostels: d.hostels.some((x) => x.id === h.id) ? d.hostels.map((x) => (x.id === h.id ? h : x)) : [...d.hostels, h].sort((a, b) => a.name.localeCompare(b.name)) } : d));
  const create = useAction((t, name: string) => api.createHostel(t, name));
  const rename = useAction((t, id: string, name: string) => api.renameHostel(t, id, name));
  const assign = useAction((t, id: string, userId: string) => api.assignWarden(t, id, userId));
  const unassign = useAction((t, id: string, userId: string) => api.unassignWarden(t, id, userId));
  return {
    ...q,
    hostels: q.data?.hostels ?? [],
    wardens: q.data?.wardens ?? [],
    busy: create.busy || rename.busy || assign.busy || unassign.busy,
    actionError: create.error ?? rename.error ?? assign.error ?? unassign.error,
    create: async (name: string) => {
      const h = await create.run(name.trim());
      if (h) {
        replace(h);
        ribbon.show({ tone: "success", title: `${h.name} added` });
      }
      return !!h;
    },
    rename: async (id: string, name: string) => {
      const h = await rename.run(id, name.trim());
      if (h) replace(h);
      return !!h;
    },
    toggleWarden: async (id: string, userId: string, on: boolean) => {
      const h = on ? await assign.run(id, userId) : await unassign.run(id, userId);
      if (h) replace(h);
    },
  };
}
