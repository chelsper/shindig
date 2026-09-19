import type { PublicGuestList } from "../../lib/server/rsvps";

type GuestListModuleProps = {
  guestList: PublicGuestList | null;
  unavailable?: boolean;
};

export function GuestListModule({
  guestList,
  unavailable = false,
}: GuestListModuleProps) {
  const totalGuestCount = guestList?.totalGuestCount ?? 0;
  const guests = guestList?.guests ?? [];

  return (
    <section
      aria-labelledby="guest-list-heading"
      className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7"
    >
      <div className="flex items-end justify-between gap-4 border-b border-[#202523]/10 pb-5">
        <div>
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">Guest list</p>
          <h2 id="guest-list-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
            Who’s Coming
          </h2>
        </div>
        {!unavailable ? (
          <p className="shrink-0 text-right font-serif text-2xl text-[#355f9e]">
            {totalGuestCount}
            <span className="ml-1.5 text-sm text-[#202523]/55">
              {totalGuestCount === 1 ? "guest" : "guests"}
            </span>
          </p>
        ) : null}
      </div>

      {unavailable ? (
        <p className="py-10 text-center text-sm leading-6 text-[#202523]/58">
          The guest list is taking a quick break. Please check back soon.
        </p>
      ) : guests.length > 0 ? (
        <ul className="divide-y divide-[#202523]/8" role="list">
          {guests.map((guest, index) => (
            <li
              className="flex items-center justify-between gap-4 py-4"
              key={`${guest.guestName}-${guest.partySize}-${index}`}
            >
              <span className="font-serif text-xl leading-tight sm:text-2xl">{guest.guestName}</span>
              {guest.partySize > 1 ? (
                <span className="shrink-0 rounded-full border border-[#355f9e]/15 bg-[#e9f2f8]/65 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#214e91]">
                  Party of {guest.partySize}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-10 text-center">
          <p className="font-serif text-2xl">
            {totalGuestCount > 0
              ? "Guests are coming!"
              : "The guest list is ready for its first name."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#202523]/55">
            {totalGuestCount > 0
              ? "No one has chosen to appear publicly just yet."
              : "RSVP from the invitation when you know you can join us."}
          </p>
        </div>
      )}

      {!unavailable ? (
        <p className="border-t border-[#202523]/8 pt-4 text-xs leading-5 text-[#202523]/45">
          The total includes attending guests who chose to keep their names private.
        </p>
      ) : null}
    </section>
  );
}
