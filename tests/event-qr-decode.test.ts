import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createEventQr } from "../lib/server/event-qr";
import { eventSlug } from "./fixtures/publication";

// Optional independent scanner verification. Keep these tools out of the app's
// dependencies: install jsqr and sharp in a disposable /private/tmp directory.
const runtime = process.env.SHINDIG_TEST_QR_TOOLS;
it.skipIf(!runtime)("independently scans invitation/Hub PNG and SVG downloads", async () => {
  if (!runtime || !/^\/private\/tmp\/[^\n]+\/node_modules$/.test(runtime)) throw new Error("Use temporary QR test tools only.");
  const require = createRequire(`${runtime}/test-loader.cjs`);
  const sharp = require("sharp");
  const scan = require("jsqr");
  for (const slug of ["garden-supper", "a".repeat(60), eventSlug]) {
    for (const target of ["invitation", "hub"] as const) {
      for (const format of ["png", "svg"] as const) {
        const generated = await createEventQr(slug, target, format);
        const { data, info } = await sharp(Buffer.from(generated)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const result = scan(new Uint8ClampedArray(data), info.width, info.height);
        expect(result?.data).toBe(`https://www.haveashindig.com/e/${slug}${target === "hub" ? "/event" : ""}`);
      }
    }
  }
}, 15000);
