"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";

function errorMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  switch (code) {
    case "auth/popup-blocked": return "ログイン画面を開けませんでした。ポップアップを許可して、もう一度お試しください。アプリ内のブラウザでは、SafariやChromeで開き直してください。";
    case "auth/network-request-failed": return "通信できませんでした。接続を確認して、もう一度お試しください。";
    case "auth/user-disabled": return "このアカウントは現在利用できません。";
    case "auth/too-many-requests": return "少し時間をおいて、もう一度お試しください。";
    case "auth/unauthorized-domain":
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found": return "現在ログインを利用できません。時間をおいて、もう一度お試しください。";
    default: return "操作を完了できませんでした。時間をおいて、もう一度お試しください。";
  }
}

type AuthState = {
  user: User | null; loading: boolean; busy: boolean; error: string;
  login: () => Promise<boolean>; logout: () => Promise<boolean>; clearError: () => void;
};
const Context = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inProgress = useRef<"login" | "logout" | null>(null);
  const operation = useRef(0);

  useEffect(() => {
    try {
      return onAuthStateChanged(getClientAuth(), current => {
        setUser(current);
        setLoading(false);
      }, cause => {
        setUser(null);
        setError(errorMessage(cause));
        setLoading(false);
      });
    } catch (cause) {
      setError(errorMessage(cause));
      setLoading(false);
    }
  }, []);

  async function perform(action: () => Promise<unknown>, kind: "login" | "logout") {
    if (loading || (inProgress.current && !(kind === "login" && inProgress.current === "login"))) return false;
    const currentOperation = ++operation.current;
    inProgress.current = kind;
    setBusy(true);
    setError("");
    try { await action(); return currentOperation === operation.current; }
    catch (cause) {
      if (currentOperation !== operation.current) return false;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request" && code !== "auth/user-cancelled") setError(errorMessage(cause));
      return false;
    }
    finally {
      // An older popup must not clear the state of a newer login attempt.
      if (currentOperation === operation.current) { inProgress.current = null; setBusy(false); }
    }
  }

  return <Context.Provider value={{
    user, loading, busy, error, clearError: () => setError(""),
    login: () => perform(() => signInWithPopup(getClientAuth(), new GoogleAuthProvider().setCustomParameters({ prompt: "select_account" })), "login"),
    logout: () => perform(() => signOut(getClientAuth()), "logout"),
  }}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider is required.");
  return value;
}
