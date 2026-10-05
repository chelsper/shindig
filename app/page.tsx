import { headers } from "next/headers";
import { ShindigHome } from "../components/shindig-home";
import { getInvitationMetadata, renderInvitation } from "../components/invitation-route";
import { isOysterRoastHost, SHINDIG_SITE } from "../lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  if (isOysterRoastHost((await headers()).get("host"))) return getInvitationMetadata();
  return { title: SHINDIG_SITE.title, description: SHINDIG_SITE.description, alternates: { canonical: SHINDIG_SITE.url } };
}

export default async function Home() {
  if (isOysterRoastHost((await headers()).get("host"))) return renderInvitation();
  return <ShindigHome />;
}
