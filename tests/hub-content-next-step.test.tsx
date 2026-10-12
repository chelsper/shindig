import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HubContentNextStep } from "../components/admin/hub-content-next-step";
import { HostEventProvider } from "../components/admin/host-event-context";
import { eventId, eventSlug } from "./fixtures/publication";

describe("contextual next step after saving content", () => {
  it("points back to the adjacent switch when content is saved in an off section", () => {
    const html = renderToStaticMarkup(<HostEventProvider slug={eventSlug} timeZone="America/New_York" contentLive={false} contentSetup={{ id: eventId, enabled: false }}><HubContentNextStep /></HostEventProvider>);
    expect(html).toContain("not on the live Hub"); expect(html).toContain('href="#hub-section-visibility"');
    expect(html).toContain("Enable this section"); expect(html).not.toContain('href="/admin/events');
  });
  it("offers review, never publication, when a section is enabled but private", () => {
    const html = renderToStaticMarkup(<HostEventProvider slug={eventSlug} timeZone="America/New_York" contentLive={false} contentSetup={{ id: eventId, enabled: true }}><HubContentNextStep /></HostEventProvider>);
    expect(html).toContain("stays private"); expect(html).toContain(`href="/admin/events/${eventId}/publish"`);
    expect(html).not.toContain("<form"); expect(html).not.toContain("<button");
  });
  it.each([true, false])("does not describe currently-live content as private even with saved enabled=%s", enabled => {
    expect(renderToStaticMarkup(<HostEventProvider slug={eventSlug} timeZone="America/New_York" contentLive contentSetup={{ id: eventId, enabled }}><HubContentNextStep /></HostEventProvider>)).toBe("");
  });
  it("leaves the legacy and response-dashboard workflows alone", () => {
    expect(renderToStaticMarkup(<HubContentNextStep />)).toBe("");
  });
});
