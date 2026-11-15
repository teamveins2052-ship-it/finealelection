import { Suspense } from "react";
import { CorrectionForm } from "@/components/public/correction-form";

export default function CorrectionPage() {
  return (
    <Suspense>
      <CorrectionForm />
    </Suspense>
  );
}
