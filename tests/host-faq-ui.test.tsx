import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../app/admin/questions/actions", () => ({ saveHostFaq: vi.fn(), answerGuestQuestion: vi.fn(), deleteGuestQuestion: vi.fn() }));
import { HostQuestionsManager } from "../components/admin/host-questions-manager";
import { HostFaqEditor } from "../components/admin/host-faqs-manager";
import { HostEventProvider } from "../components/admin/host-event-context";
import type { AdminQuestion } from "../lib/server/questions";
const faq: AdminQuestion = { id: "private-id", question: "<b>Parking?</b>", answer: "Use the driveway.", guestName: null, createdAt: "2026-10-01T20:00:00Z", isPublished: false, source: "host", revision: 1 };
describe("host FAQs presentation", () => {
  it("offers FAQ creation even with no guest questions", () => {
    const html = renderToStaticMarkup(<HostQuestionsManager questions={[]} />);
    for (const copy of ["+ Add a FAQ", "parking", "kids", "food options", "Questions from guests", "No questions yet"]) expect(html).toContain(copy);
  });
  it("separates host-written FAQs from incoming private guest questions", () => {
    const html = renderToStaticMarkup(<HostQuestionsManager questions={[faq, { ...faq, id: "guest-id", source: "guest", question: "Chairs?", guestName: "Private name", answer: null }]} />);
    expect(html).toContain('aria-label="Prepared FAQs"'); expect(html).toContain('aria-label="Guest questions"');
    expect(html).toContain("Host-written FAQ"); expect(html).toContain("Edit FAQ"); expect(html).toContain("Name visible only to you"); expect(html).not.toContain("No name provided");
    expect(html).toContain("&lt;b&gt;Parking?&lt;/b&gt;"); expect(html).not.toContain("<b>Parking?</b>");
  });
  it("defaults new FAQs to private with bounded required fields", () => {
    const html = renderToStaticMarkup(<HostFaqEditor onSaved={() => {}} onCancel={() => {}} />);
    expect(html).not.toContain('checked=""'); expect(html.match(/required=""/g)).toHaveLength(2);
    expect(html).toContain('maxLength="1000"'); expect(html).toContain('maxLength="2000"'); expect(html).toContain("appear as soon as you save");
  });
  it("distinguishes approval in a private section from public posting", () => {
    const html = renderToStaticMarkup(<HostEventProvider slug="event-private" timeZone="America/New_York" contentLive={false}><HostFaqEditor faq={{ ...faq, isPublished: true }} onSaved={() => {}} onCancel={() => {}} /></HostEventProvider>);
    expect(html).toContain("Approve this FAQ for when the section is live"); expect(html).toContain("stay private until Ask the Host"); expect(html).not.toContain("appear as soon as you save");
  });
});
