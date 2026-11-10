// What the sign-up and login screens say for each Supabase Auth error code.
// Codes: https://supabase.com/docs/guides/auth/debugging/error-codes

export const AUTH_MESSAGES = {
  signupFailed: "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  emailRateLimit: "인증 메일을 너무 많이 보냈어요. 잠시 후(최대 1시간) 다시 시도해 주세요.",
  emailNotDeliverable: "지금은 이 이메일로 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도하거나 관리자에게 알려 주세요.",
  loginFailed: "이메일 또는 비밀번호가 올바르지 않습니다.",
  emailNotConfirmed: "아직 이메일 인증을 하지 않았어요. 가입할 때 받은 메일의 링크를 눌러 주세요.",
  resendFailed: "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  resent: "인증 메일을 다시 보냈어요. 메일함과 스팸함을 확인해 주세요.",
} as const;

export function signupErrorMessage(code: string | undefined): string {
  if (code === "over_email_send_rate_limit") return AUTH_MESSAGES.emailRateLimit;
  if (code === "email_address_not_authorized") return AUTH_MESSAGES.emailNotDeliverable;
  return AUTH_MESSAGES.signupFailed;
}

/**
 * Only an unconfirmed account gets its own message: Supabase reports it only after the password
 * matched. Wrong password and unknown email share one message so accounts cannot be probed.
 */
export function loginErrorMessage(code: string | undefined): { error: string; needsConfirmation: boolean } {
  if (code === "email_not_confirmed") return { error: AUTH_MESSAGES.emailNotConfirmed, needsConfirmation: true };
  return { error: AUTH_MESSAGES.loginFailed, needsConfirmation: false };
}

export function resendErrorMessage(code: string | undefined): string {
  return code === "over_email_send_rate_limit" ? AUTH_MESSAGES.emailRateLimit : AUTH_MESSAGES.resendFailed;
}
