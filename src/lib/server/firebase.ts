import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { OAuth2Client } from "google-auth-library";
import { Firestore, getFirestore } from "firebase-admin/firestore";

let localDatabase: Firestore | undefined;
const localAuth = new OAuth2Client();
localAuth.refreshHandler = async () => {
  if (process.env.NODE_ENV !== "development" || process.env.FIREBASE_USE_GCLOUD_CREDENTIALS !== "1") throw new Error("Local credentials are disabled");
  const {stdout} = await promisify(execFile)(process.env.GCLOUD_BIN || "gcloud", ["auth", "print-access-token", "--project", "tsugidoko-prod-hajime-f"], {timeout:15_000});
  return {access_token:stdout.trim(),expiry_date:Date.now()+300_000};
};
export function adminServices() {
  const emulator = process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_EMULATOR === "1";
  if (emulator) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9199";
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
  } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Unexpected emulator configuration");
  }
  const local = !emulator && process.env.NODE_ENV === "development" && process.env.FIREBASE_USE_GCLOUD_CREDENTIALS === "1";
  // User credentials need a quota project for Auth's revocation/user lookup API.
  // Admin SDK reads this variable when adding the x-goog-user-project header.
  if (local && !process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = "tsugidoko-prod-hajime-f";
  }
  const name = emulator ? "server-emulator" : "server";
  const app = getApps().find(app => app.name === name) ?? initializeApp(emulator ? { projectId: "demo-tsugidoko" } : { projectId: "tsugidoko-prod-hajime-f", credential: local ? {
      async getAccessToken() {
        const {token} = await localAuth.getAccessToken();
        if (!token) throw new Error("Local credentials unavailable");
        return {access_token:token,expires_in:300};
      },
    } : applicationDefault() }, name);
  // Admin SDK accepts custom tokens for Auth, but Firestore requires its own auth client.
  if(local && !localDatabase) localDatabase = new Firestore({projectId:"tsugidoko-prod-hajime-f",authClient:localAuth});
  return { auth: getAuth(app), db: local ? localDatabase! : getFirestore(app) };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const invalidSessionCodes = new Set([
  "auth/argument-error", "auth/invalid-argument", "auth/invalid-id-token",
  "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found",
  "auth/tenant-id-mismatch", "auth/mismatching-tenant-id",
]);
export async function verifyAuthToken(token: string, checkRevoked = true) {
  try { return await adminServices().auth.verifyIdToken(token, checkRevoked); }
  catch (error) {
    const code = (error as { code?: unknown })?.code;
    // Admin SDK also wraps certificate-fetch failures as auth/invalid-argument.
    const message = error instanceof Error ? error.message : "";
    const keyFetchFailed = code === "auth/invalid-argument" && /Error fetching public keys|Error while making request/i.test(message);
    if (!keyFetchFailed && typeof code === "string" && invalidSessionCodes.has(code)) {
      throw new HttpError(401, "ログインし直してください。");
    }
    // Never log tokens, user identifiers, credential contents, or raw SDK messages.
    console.error("Firebase authentication verification failed", {
      code: typeof code === "string" && /^(auth|app)\/[a-z-]+$/.test(code) ? code : "unknown",
    });
    throw new HttpError(503, "サーバーで認証を確認できませんでした。時間をおいてお試しください。");
  }
}
export async function authenticated(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, "ログインし直してください。");
  return verifyAuthToken(token);
}
export function failure(error: unknown) {
  return Response.json({ error: error instanceof HttpError ? error.message : "処理を完了できませんでした。時間をおいてお試しください。" }, { status: error instanceof HttpError ? error.status : 500 });
}
export async function smallJson(request: Request, maxBytes = 8192) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "入力を確認してください。");
  let value = ""; let size = 0; const decoder = new TextDecoder();
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) throw new HttpError(413, "入力が長すぎます。");
      value += decoder.decode(result.value, { stream: true });
    }
    return JSON.parse(value + decoder.decode()) as unknown;
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "入力を確認してください。"); }
  finally { await reader.cancel(); }
}
