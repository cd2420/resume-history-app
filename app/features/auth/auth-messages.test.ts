import { expect, test } from "vitest";

import { AUTH_MESSAGES, loginErrorMessage, resendErrorMessage, signupErrorMessage } from "./auth-messages";

test("sign-up explains the email send limit and keeps everything else generic", () => {
  expect(signupErrorMessage("over_email_send_rate_limit")).toBe(AUTH_MESSAGES.emailRateLimit);
  expect(signupErrorMessage("email_address_not_authorized")).toBe(AUTH_MESSAGES.emailNotDeliverable);
  expect(signupErrorMessage("weak_password")).toBe(AUTH_MESSAGES.signupFailed);
  expect(signupErrorMessage(undefined)).toBe(AUTH_MESSAGES.signupFailed);
});

test("login tells an unconfirmed account apart; every other failure stays the same message", () => {
  expect(loginErrorMessage("email_not_confirmed")).toEqual({ error: AUTH_MESSAGES.emailNotConfirmed, needsConfirmation: true });
  // Wrong password and unknown email must read the same, so accounts cannot be probed.
  expect(loginErrorMessage("invalid_credentials")).toEqual({ error: AUTH_MESSAGES.loginFailed, needsConfirmation: false });
  expect(loginErrorMessage("user_not_found")).toEqual({ error: AUTH_MESSAGES.loginFailed, needsConfirmation: false });
  expect(loginErrorMessage(undefined)).toEqual({ error: AUTH_MESSAGES.loginFailed, needsConfirmation: false });
});

test("resend explains the send limit and is otherwise generic", () => {
  expect(resendErrorMessage("over_email_send_rate_limit")).toBe(AUTH_MESSAGES.emailRateLimit);
  expect(resendErrorMessage("anything_else")).toBe(AUTH_MESSAGES.resendFailed);
});
