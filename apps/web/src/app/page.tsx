import { Home } from "@/components/home";

// docs/01 §1: public pages are cached and refreshed every 15 minutes, sooner when the engine
// calls /api/revalidate.
export const revalidate = 900;

export default function HomePage() {
  return <Home />;
}
