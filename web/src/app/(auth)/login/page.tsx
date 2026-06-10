import { LoginForm } from "@/components/auth/login-form";

/**
 * /login — public page wrapped in the (auth) route group.
 * Server component that renders the client-side LoginForm.
 * Middleware redirects authenticated users away from here.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <LoginForm />
    </div>
  );
}
