import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ARTWORK_FILE_LIMIT, ARTWORK_TYPES, artworkAspect, artworkImageStyle, artworkPlacement, defaultArtworkCrop, defaultArtworkCrops, dragArtworkCrop, normalizeArtworkCrop, replaceArtworkCrop, validateArtworkDimensions, validateArtworkFile, validArtworkSignature } from "../lib/design-artwork";
import { loadLocalArtwork } from "../lib/local-design-artwork";
import { DesignPreview } from "../components/design-studio/design-preview";
import { ArtworkControls } from "../components/design-studio/artwork-controls";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const artwork = { url: "blob:local-test-only", name: "sample.png", width: 1600, height: 1200 };

describe("local artwork validation", () => {
  it.each(ARTWORK_TYPES)("accepts a bounded %s file", (type) => expect(() => validateArtworkFile({ type, size: 1024 })).not.toThrow());
  it.each(["image/svg+xml", "image/gif", "image/heic", "text/html", ""])("rejects unsupported format %s", (type) => expect(() => validateArtworkFile({ type, size: 100 })).toThrow("Choose a JPG"));
  it.each([0, -1, ARTWORK_FILE_LIMIT + 1])("rejects an invalid file size %s", (size) => expect(() => validateArtworkFile({ type: "image/png", size })).toThrow("10 MB"));
  it("checks signatures rather than trusting an extension/MIME", () => {
    expect(validArtworkSignature("image/png", png)).toBe(true);
    expect(validArtworkSignature("image/jpeg", new Uint8Array([255, 216, 255]))).toBe(true);
    expect(validArtworkSignature("image/webp", new TextEncoder().encode("RIFF1234WEBP"))).toBe(true);
    for (const type of ARTWORK_TYPES) expect(validArtworkSignature(type, new TextEncoder().encode("<svg></svg>"))).toBe(false);
    expect(validArtworkSignature("image/jpeg", png)).toBe(false);
    expect(validArtworkSignature("image/png", new Uint8Array())).toBe(false);
  });
  it.each([[0, 10], [10, 0], [16001, 1], [1, 16001], [10000, 10000], [NaN, 5], [2.5, 5]])("rejects unsafe dimensions %s × %s", (width, height) => expect(() => validateArtworkDimensions(width, height)).toThrow());
  it("accepts portrait and landscape images within the pixel budget", () => {
    expect(() => validateArtworkDimensions(1429, 2000)).not.toThrow();
    expect(() => validateArtworkDimensions(8000, 5000)).not.toThrow();
  });
});

describe("independent crop geometry", () => {
  it("clamps zoom/position and keeps resets independent", () => {
    expect(normalizeArtworkCrop({ x: -5, y: 130, zoom: 500 })).toEqual({ x: 0, y: 100, zoom: 250 });
    expect(normalizeArtworkCrop({ x: NaN, y: Infinity, zoom: 0 })).toEqual(defaultArtworkCrop());
    const crops = defaultArtworkCrops();
    expect(crops.invitation).not.toBe(crops.hub);
    const changed = replaceArtworkCrop(crops, "hub", { x: 10, y: 20, zoom: 150 });
    expect(changed.invitation).toEqual(defaultArtworkCrop());
    expect(changed.hub).toEqual({ x: 10, y: 20, zoom: 150 });
    expect(crops.hub).toEqual(defaultArtworkCrop());
    expect(replaceArtworkCrop(changed, "invitation", defaultArtworkCrop()).hub).toEqual(changed.hub);
  });
  it("shares exact aspect ratios between the editor and guest previews", () => {
    expect(artworkAspect("invitation", "phone")).toBe(artworkAspect("invitation", "desktop"));
    expect(artworkAspect("hub", "phone")).toBe(16 / 9);
    expect(artworkAspect("hub", "desktop")).toBe(3);
  });
  for (const image of [{ width: 800, height: 1200 }, { width: 1600, height: 900 }, { width: 800, height: 800 }]) {
    it.each([4 / 5, 16 / 9, 3])(`keeps ${image.width}×${image.height} covering the frame at aspect %s`, (aspect) => {
      const frame = { width: 300, height: 300 / aspect };
      for (const zoom of [100, 150, 250]) for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) {
        const placed = artworkPlacement(image, frame, { x, y, zoom });
        expect(placed.left).toBeLessThanOrEqual(.0001); expect(placed.top).toBeLessThanOrEqual(.0001);
        expect(placed.left + placed.width).toBeGreaterThanOrEqual(frame.width - .0001);
        expect(placed.top + placed.height).toBeGreaterThanOrEqual(frame.height - .0001);
        expect(placed.width / placed.height).toBeCloseTo(image.width / image.height);
      }
    });
  }
  it("drags in the expected direction and handles scaled previews consistently", () => {
    const crop = { x: 50, y: 50, zoom: 200 };
    const moved = dragArtworkCrop(crop, artwork, { width: 300, height: 200 }, 30, 20);
    expect(moved.x).toBeLessThan(crop.x); expect(moved.y).toBeLessThan(crop.y);
    expect(dragArtworkCrop(crop, artwork, { width: 150, height: 100 }, 15, 10)).toEqual(moved);
    expect(dragArtworkCrop(defaultArtworkCrop(), { width: 100, height: 100 }, { width: 100, height: 100 }, 50, 50)).toEqual(defaultArtworkCrop());
    expect(dragArtworkCrop(crop, artwork, { width: 300, height: 200 }, 9999, -9999)).toEqual({ x: 0, y: 100, zoom: 200 });
    expect(artworkImageStyle({ x: 10, y: 80, zoom: 150 })).toEqual({ objectPosition: "10% 80%", transformOrigin: "10% 80%", transform: "scale(1.5)" });
  });
});

describe("browser-local decoding and URL lifetime", () => {
  let images: MockImage[];
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1600; naturalHeight = 1200;
    src = ""; decoding = "";
    constructor() { images.push(this); }
  }
  beforeEach(() => {
    images = [];
    vi.stubGlobal("Image", MockImage);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const file = () => new File([png], "test.png", { type: "image/png" });
  async function start(signal = new AbortController().signal) {
    const pending = loadLocalArtwork(file(), signal);
    await vi.waitFor(() => expect(images).toHaveLength(1));
    return { pending, image: images[0] };
  }
  it("returns only a locally decoded asset; the caller owns its URL", async () => {
    const { pending, image } = await start(); image.onload?.();
    expect(await pending).toEqual({ url: "blob:test-url", name: "test.png", width: 1600, height: 1200 });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(image.onload).toBeNull(); expect(image.onerror).toBeNull();
  });
  it("rejects a forged MIME before creating a URL", async () => {
    await expect(loadLocalArtwork(new File(["<svg></svg>"], "bad.png", { type: "image/png" }), new AbortController().signal)).rejects.toThrow("doesn’t appear");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("revokes an unreadable image without exposing decoder details", async () => {
    const { pending, image } = await start(); const result = expect(pending).rejects.toThrow("We couldn’t open"); image.onerror?.(); await result;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
  it("revokes an oversized decoded image", async () => {
    const { pending, image } = await start(); const result = expect(pending).rejects.toThrow("too large"); image.naturalWidth = 20000; image.onload?.(); await result;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
  it("cancels in-flight decoding when replaced or removed", async () => {
    const controller = new AbortController(); const { pending, image } = await start(controller.signal);
    const result = expect(pending).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await result;
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1); expect(image.onload).toBeNull();
  });
  it("does not create a URL for an already-cancelled selection", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(loadLocalArtwork(file(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("times out a stalled decoder and releases its URL", async () => {
    vi.useFakeTimers();
    const { pending } = await start(); const result = expect(pending).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(15_000); await result;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
});

describe("artwork in the Design Studio", () => {
  for (const page of ["invitation", "hub"] as const) it.each(["phone", "desktop"] as const)(`shows local artwork in ${page} at %s without losing event text`, (device) => {
    const html = renderToStaticMarkup(<DesignPreview designId="coastal" page={page} device={device} artwork={artwork} crop={{ x: 20, y: 70, zoom: 150 }} />);
    expect(html).toContain('src="blob:local-test-only"'); expect(html).toContain('alt="Your selected artwork"');
    expect(html).toContain("object-position:20% 70%"); expect(html).toContain("scale(1.5)");
    expect(html).toContain("dinner party."); expect(html).toContain("Saturday, November 14");
    expect(html).not.toMatch(/<form|<button|<input|href=|_next\/image|\/api\//);
  });
  it("provides labeled keyboard alternatives, independent reset and honest privacy copy", () => {
    const html = renderToStaticMarkup(<ArtworkControls state={{ artwork, crops: defaultArtworkCrops(), loading: false, error: null, choose: async () => {}, remove: () => {}, updateCrop: () => {} }} page="hub" device="phone" onPageChange={() => {}} />);
    for (const text of ["Nothing is uploaded or saved", "Choose artwork", "Zoom", "Horizontal position", "Vertical position", "Reset Hub header crop", "Remove artwork", "Your other crop is kept"]) expect(html).toContain(text);
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
  });
});
