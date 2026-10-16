# V1.7.3 Cabin Product Gallery

## Scope

Business, Premium Economy and Economy now have separate realistic Basic,
Premium and Luxury product concepts. First Class keeps its V1.7.2 image.
All four cabins use one presentation registry, `src/config/cabinArtwork.ts`,
for product cards and the selected-product preview.

Each local atlas has three landscape frames, top to bottom: Basic, Premium,
Luxury. A fixed 16:9 viewport selects the corresponding frame without editing
the original PNG. Explicit source bounds avoid narrow strips of adjacent panels
caused by slightly uneven generated frame heights. Each failed image falls
back to the existing seat icon;
switching cabin does not inherit another asset's failure state.

These are fictional, unbranded AI-generated concepts, not certified products
or photographs of a specific airline. Seat rows, arrangements, width, pitch,
capacity, purchase price and satisfaction still use the existing model rules.
No aircraft data, economic coefficient or save schema changes are included.

## UI Corrections

- Mobile purchase footer stacks the price row above a full-width Apply button.
- Product names reserve a fixed checkmark slot; arrangement and width use
  separate lines instead of squeezing together at 320px.
- Preview captions wrap independently from the comfort score.
- Nearby cabin dividers receive separate vertical lanes. All-economy layouts
  no longer put three controls on the same point. The stage reserves the
  required height so controls cannot cover the editor below.
- Layout follows measured stage width and cleans up its resize observer.
  Existing pointer, keyboard, touch and reduced-motion behavior is retained.

## Assets And Offline Support

- `/cabin/first-class-products-v172.png` (unchanged)
- `/cabin/business-products-v173.png`
- `/cabin/premium-economy-products-v173.png`
- `/cabin/economy-products-v173.png`

The V1.7.3 service-worker cache precaches these four atlases. The unused old
`seat-products.png` remains as a historical asset but is no longer precached.
Generation mode, dimensions and full prompts are in `public/cabin/README.md`.
No image service, secret, new dependency or external runtime image URL is used.

## Verification

The optional browser check `tests/verifyCabinGallery.cjs` uses an isolated
paused save, not a real player's profile. It covers all 12 concepts, frame
selection, EN/ZH layouts at 1440x1000, 390x844, 320x740 and 844x390, collapsed
dividers, pointer/keyboard/emulated touch, pitch bounds, cancel, purchase cash,
unchanged legacy aircraft, persisted reload, image failure and reduced motion.
Run `pnpm test` first to compile its shared fixture modules; provide Playwright
with `PLAYWRIGHT_MODULE`, an optional `PLAYWRIGHT_CHANNEL`, and a running app
with `UI_CHECK_URL` (default `http://localhost:3015`).

Verified locally on 2026-10-16: 158 unit tests, typecheck, zero-warning lint and
optimized production build passed. Gallery acceptance passed at all four sizes
in development and production with no unexpected console/runtime errors. The
390px production main UI smoke also passed navigation, map camera retention,
layers, airport board, route dialog and modal stacking.

`tests/verifyCabinOffline.cjs` passed production precaching, obsolete-cache
cleanup and network-offline fetch/decode for all four atlases. Use the same
Playwright variables and a production `UI_CHECK_URL` (default port 3016).

Physical-device testing, live Supabase and Vercel deployment are separate
external checks. This local update does not itself publish to GitHub or Vercel.
