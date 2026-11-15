import { StudentShell } from "@/components/student/shell";

export default function NomineeLayout({ children }: { children: React.ReactNode }) {
  return <StudentShell nomineeOnly>{children}</StudentShell>;
}
