import type { AuthResponse, RegisterInput, UserDto } from "@outpassed/shared";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";
import { registerForPush, unregisterPush } from "../notifications/push";
import { clearToken, getToken, setToken } from "./tokenStore";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionValue = {
  status: SessionStatus;
  user: UserDto | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  /** Starts a session from an auth response (sign-in, sign-up, password reset). */
  adopt: (res: AuthResponse) => Promise<void>;
  /** Re-fetches the current user (e.g. after a profile change). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // Restore an existing session on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = await getToken();
      if (!stored) {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }
      try {
        const { user } = await api.me(stored);
        if (!cancelled) {
          setTokenState(stored);
          setUser(user);
          setStatus("authenticated");
          void registerForPush(stored);
        }
      } catch {
        await clearToken();
        if (!cancelled) setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(() => {
    async function adopt(res: AuthResponse) {
      await setToken(res.accessToken);
      setTokenState(res.accessToken);
      setUser(res.user);
      setStatus("authenticated");
      void registerForPush(res.accessToken);
    }
    return {
      status,
      user,
      token,
      async signIn(email, password) {
        const res = await api.login(email, password);
        await adopt(res);
      },
      async signUp(input) {
        await adopt(await api.register(input));
      },
      async refresh() {
        if (!token) return;
        const { user } = await api.me(token);
        setUser(user);
      },
      adopt,
      async signOut() {
        if (token) await unregisterPush(token);
        await clearToken();
        setTokenState(null);
        setUser(null);
        setStatus("unauthenticated");
      },
    };
  }, [status, user, token]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
