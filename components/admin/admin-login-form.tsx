"use client";

import { useActionState } from "react";

import {
  loginAdmin,
  type AdminLoginState,
} from "../../app/admin/actions";

const initialState: AdminLoginState = { error: null };

export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(loginAdmin, initialState);

  return (
    <form action={formAction} className="mt-8 grid gap-5">
      <label className="field-label">
        Host password
        <input
          autoComplete="current-password"
          autoFocus
          className="field-input"
          disabled={isPending}
          name="password"
          placeholder="Enter password"
          required
          type="password"
        />
      </label>

      {state.error ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-red-900/15 bg-red-50/75 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <button className="primary-button w-full" disabled={isPending} type="submit">
        {isPending ? "Checking…" : "Open dashboard"}
      </button>
    </form>
  );
}
