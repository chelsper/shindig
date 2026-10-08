import type { Metadata } from "next";
import { DesignStudio } from "../../components/design-studio/design-studio";

export const metadata: Metadata = { title: "Design Studio | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function DesignStudioPage() {
  // A public, fictional preview only: no event data, credentials or writes.
  return <DesignStudio />;
}
