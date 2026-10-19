import type { AuthResponse, RegisterInput, UserDto } from "@outpassed/shared";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setTokenRenewer } from "../api/client";
import { registerForPush, unregisterPush } from "../notifications/push";
import {
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from "./tokenStore";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionValue = {
  status: SessionStatus;
  user: UserDto | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  /** Starts a session from an auth response (sign-in, sign-up, OTP, setup, password reset). */
  adopt: (res: AuthResponse) => Promise<void>;
  /** Re-fetches the current user (e.g. after a profile change). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

// --- Token renewal, shared by every request (outside React so it works from any call) ---

let currentToken: string | null = null;
let renewing: Promise<string | null> | null = null;
const listeners = new Set<(res: AuthResponse | null) => void>();

async function saveSession(res: AuthResponse) {
  currentToken = res.accessToken;
  await setToken(res.accessToken);
  await setRefreshToken(res.refreshToken);
}

async function wipeSession() {
  currentToken = null;
  await clearToken();
  await clearRefreshToken();
}

/**
 * Swaps the refresh token for a new pair. Several requests failing at once
 * share one renewal, and a request that failed with an already-replaced
 * token just retries with the new one.
 */
async function renew(failedToken: string): Promise<string | null> {
  if (currentToken && currentToken !== failedToken) return currentToken;
  renewing ??= (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;
      const res = await api.refresh(refreshToken);
      await saveSession(res);
      listeners.forEach((l) => l(res));
      return res.accessToken;
    } catch (err) {
      // Only a rejected refresh token ends the session; a network blip doesn't.
      if (err instanceof ApiError && err.status === 401) {
        await wipeSession();
        listeners.forEach((l) => l(null));
      }
      return null;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

setTokenRenewer(renew);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // Follow renewals (and sessions that ended) made by any request.
  useEffect(() => {
    const onChange = (res: AuthResponse | null) => {
      if (res) {
        setTokenState(res.accessToken);
        setUser(res.user);
      } else {
        setTokenState(null);
        setUser(null);
        setStatus("unauthenticated");
      }
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  // Restore an existing session on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = await getToken();
      if (!stored) {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }
      currentToken = stored;
      try {
        // An expired access token is renewed inside the request.
        const { user } = await api.me(stored);
        if (!cancelled) {
          const active = currentToken ?? stored;
          setTokenState(active);
          setUser(user);
          setStatus("authenticated");
          void registerForPush(active);
        }
      } catch (err) {
        // Keep the stored session when offline, so it works again next launch.
        if (!(err instanceof ApiError && err.code === "NETWORK")) await wipeSession();
        if (!cancelled) setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(() => {
    async function adopt(res: AuthResponse) {
      await saveSession(res);
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
        await adopt(await api.login(email, password));
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
        if (token) await unregisterPush(token).catch(() => undefined);
        const refreshToken = await getRefreshToken();
        if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
        await wipeSession();
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
