import "server-only";

import {
  createHash,
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "shindig_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const SESSION_VERSION = 1;
const SIGNING_SALT = "shindig-admin-session-v1";

type SessionPayload = {
  v: number;
  exp: number;
};

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function signingKey(password: string) {
  return scryptSync(password, SIGNING_SALT, 32);
}

function sign(payload: string, password: string) {
  return createHmac("sha256", signingKey(password))
    .update(payload)
    .digest("base64url");
}

export function isAdminConfigured() {
  return Boolean(getAdminPassword());
}

export function verifyAdminPassword(candidate: string) {
  const password = getAdminPassword();
  const expected = hash(password ?? "admin-password-not-configured");
  const actual = hash(candidate);

  return Boolean(password) && timingSafeEqual(actual, expected);
}

export function createAdminSessionToken(now = Date.now()) {
  const password = getAdminPassword();

  if (!password) {
    return null;
  }

  const payload: SessionPayload = {
    v: SESSION_VERSION,
    exp: Math.floor(now / 1000) + SESSION_DURATION_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload, password)}`;
}

export function verifyAdminSessionToken(token: string, now = Date.now()) {
  const password = getAdminPassword();

  if (!password) {
    return false;
  }

  const [encodedPayload, receivedSignature, extra] = token.split(".");

  if (!encodedPayload || !receivedSignature || extra) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, password);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    return (
      payload.v === SESSION_VERSION &&
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated() {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;

  return token ? verifyAdminSessionToken(token) : false;
}

export async function createAdminSession() {
  const token = createAdminSessionToken();

  if (!token) {
    throw new Error("Admin access is not configured.");
  }

  (await cookies()).set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearAdminSession() {
  (await cookies()).set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });
}
