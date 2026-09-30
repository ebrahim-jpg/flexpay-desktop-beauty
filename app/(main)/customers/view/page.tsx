import { Suspense } from "react";
import { CustomerProfileView } from "@/components/customers/CustomerProfileView";

// مسار ثابت يقرأ id من الـ query (?id=) — متوافق مع output: export.
// useSearchParams لازم يكون داخل Suspense boundary.
export default function CustomerProfilePage() {
  return (
    <Suspense fallback={null}>
      <CustomerProfileView />
    </Suspense>
  );
}
