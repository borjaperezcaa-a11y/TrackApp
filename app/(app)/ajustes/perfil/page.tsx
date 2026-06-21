import { redirect } from "next/navigation";

// La antigua pantalla "Mi Perfil" (un único formulario largo) se ha dividido en
// subsecciones bajo /ajustes. Redirigimos para no romper enlaces/marcadores.
export default function PerfilPage() {
  redirect("/ajustes");
}
