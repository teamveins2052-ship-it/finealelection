import { Suspense } from "react";
import { LoginFlow } from "@/components/public/login-flow";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginFlow />
    </Suspense>
  );
}
