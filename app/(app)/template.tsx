/**
 * Template (no layout): se remonta en cada navegación, así cada pantalla del
 * área privada entra deslizando desde la derecha, como en el mockup.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-anim">{children}</div>;
}
