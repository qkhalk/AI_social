import { SignupForm } from "@/components/auth/signup-form";

/**
 * /signup — public page wrapped in the (auth) route group.
 * Server component that renders the client-side SignupForm.
 * Middleware redirects authenticated users away from here.
 */
export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <SignupForm />
    </div>
  );
}
