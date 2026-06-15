import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/ui/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defensa en profundidad: además del middleware, el server valida la sesión.
  if (!user) redirect("/login");

  return (
    <>
      <main className="shell">{children}</main>
      <BottomNav />
    </>
  );
}
