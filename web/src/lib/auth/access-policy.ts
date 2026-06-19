const ADMIN_ONLY_MODE = "admin_only";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAdminOnlyAuthMode() {
  return process.env.AUTH_MODE === ADMIN_ONLY_MODE;
}

export function getAllowedAdminEmails() {
  return (process.env.ADMIN_ALLOWED_EMAILS || process.env.ADMIN_ALLOWED_EMAIL || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

export function isAllowedAdminEmail(email: string) {
  const allowedEmails = getAllowedAdminEmails();
  if (allowedEmails.length === 0) return false;
  return allowedEmails.includes(normalizeEmail(email));
}

export function adminOnlyLoginError() {
  return "This account is not allowed to sign in.";
}

export function adminOnlySignupError() {
  return "Registration is closed. Only the current admin account can sign in.";
}
