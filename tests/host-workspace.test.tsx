import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentShell } from "../components/admin/content-shell";
import { EventGuestsNavigation } from "../components/admin/event-guests-navigation";
import { eventId } from "./fixtures/publication";

const base = `/admin/events/${eventId}`;
describe("host workspace guest tools", () => {
  it.each(["invitations", "rsvps", "contacts"] as const)("groups %s without changing the independent event-scoped routes", current => {
    const html = renderToStaticMarkup(<EventGuestsNavigation id={eventId} current={current} publishedBefore />);
    expect([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual([`${base}/invitations`, `${base}/guests`, `${base}/guests?view=contacts`]);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain("These lists stay separate");
    expect(html).toContain("min-h-11"); expect(html).toContain("flex-wrap");
  });
  it("lets draft hosts plan invitations without linking to unavailable response pages", () => {
    const html = renderToStaticMarkup(<EventGuestsNavigation id={eventId} current="invitations" publishedBefore={false} />);
    expect([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual([`${base}/invitations`]);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).toContain("after first publication");
  });
  it("keeps access to retained response tools for previously published events", () => {
    // Publication existence, not current visibility, enables the response links.
    const html = renderToStaticMarkup(<EventGuestsNavigation id={eventId} current="other" publishedBefore />);
    expect(html).toContain(`${base}/guests?view=contacts`);
    expect(html).not.toContain("aria-current"); expect(html).not.toContain("aria-disabled");
  });
  it("returns host-created event shells to their workspace, not the legacy Oyster Roast dashboard", () => {
    const html = renderToStaticMarkup(<ContentShell title="Guest responses" description="Private" dashboardHref={`${base}/setup`} contextLabel="Garden Supper">Content</ContentShell>);
    expect(html).toContain('href="/admin/events"'); expect(html).toContain(`href="${base}/setup"`);
    expect(html).toContain("Event overview"); expect(html).not.toContain('href="/admin"');
  });
  it("leaves the legacy admin shell unchanged", () => {
    const html = renderToStaticMarkup(<ContentShell title="Legacy" description="Private">Content</ContentShell>);
    expect(html.match(/href="\/admin"/g)).toHaveLength(2);
    expect(html).toContain("Back to dashboard"); expect(html).not.toContain("Event workspace");
  });
});
