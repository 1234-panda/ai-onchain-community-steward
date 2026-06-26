import { Suspense } from "react";
import { BindClient } from "./ui/bind-client";

export default function BindPage() {
  return (
    <Suspense fallback={<main className="shell narrow"><section className="card">正在加载钱包绑定页...</section></main>}>
      <BindClient />
    </Suspense>
  );
}
