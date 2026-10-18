import { useState } from "react";
import { api, errorMessage } from "../../api/client";
import { useSession } from "../../auth/session";

/** Two steps: ask for a code by email, then enter the code and a new password. */
export function useForgotPassword(initialEmail = "") {
  const { adopt } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    if (!/\S+@\S+\.\S+/.test(email.trim())) return setError("Enter the email you signed up with");
    setBusy(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setInfo(res.message);
      setStep("code");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from the email");
    if (password.length < 8) return setError("New password must be at least 8 characters");
    setBusy(true);
    try {
      // Signs straight in; the auth layout then takes the user to their home screen.
      await adopt(await api.resetPassword({ email: email.trim(), code: code.trim(), password }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return { step, setStep, email, setEmail, code, setCode, password, setPassword, busy, error, info, sendCode, reset };
}
