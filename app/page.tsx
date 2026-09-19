import { InvitationPage } from "../components/invitation-page";

export default function Home() {
  const persistenceDisabled =
    process.env.NODE_ENV === "development" && !process.env.DATABASE_URL?.trim();

  return <InvitationPage persistenceDisabled={persistenceDisabled} />;
}
