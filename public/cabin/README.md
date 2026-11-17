# Seat Product Catalog


## V1.7.3 All-Cabin Gallery

The original `seat-products.png` is retained for history but is no longer used
by the current gallery or precached. First Class still uses its V1.7.2 atlas.
Business, Premium Economy and Economy each use a new three-frame vertical
atlas: Basic, Premium, Luxury from top to bottom. The presentation registry uses
measured frame bounds to exclude seams where generated heights vary slightly.
All were generated with the
built-in image tool in **generate** mode, without reference images. Original
PNGs are used unchanged; CSS selects a frame inside a stable 16:9 viewport.
These fictional photorealistic concepts are not certified layouts or real
airline product photographs. Actual seat arrangements remain model-driven.

### Business

Saved asset: `public/cabin/business-products-v173.webp` (965 x 1629 WebP).
Runtime URL: `/cabin/business-products-v173.webp`.

Full generation prompt:

> Use case: product-mockup. Asset type: a production sprite atlas for an airline management game's Business Class seat photographs. Create ONE image with exactly THREE equal-height edge-to-edge photographic frames vertically stacked, each frame a 16:9 landscape picture; overall portrait strip ratio 16:27 (desired 1024 by 1728). Top frame Basic, middle Premium, bottom Luxury, but do not write any words. Style: photorealistic aircraft interior product photography, soft neutral daylight through real oval airliner windows, crisp fabric weave, believable upholstery, aisle carpet and overhead bins, matching the polished realistic look of an airline First Class product catalog. Every frame uses the same aisle-side three-quarter close-up with ONE complete Business Class seat, headrest to footrest visible, and limited neighboring context, not a full cabin-row layout. TOP Basic: open dark gray-blue padded Business recliner, broad shared armrests, straightforward fabric, modest recline and simple folding footrest, no privacy pod. MIDDLE Premium: noticeably upgraded indigo upholstered Business recliner, sculpted headrest and substantial leg support, discrete side console and half-height privacy wing, more refined stitching. BOTTOM Luxury: sophisticated deep teal upholstered Business seat with generous padding, extended legrest, a compact sculpted privacy shell and refined light-metal detailing; noticeably more premium but still Business, NOT an enclosed First Class room and NO sliding door. Make all three grades clearly different at small thumbnail size. No people, branding, logos, labels, letters, visible screen text, watermarks, decorative borders or gutters. Keep each whole seat inside its own frame without clipping important parts at boundaries. Three equally sized frames, camera and lighting consistent. These are fictional product concepts, not certified technical layouts.

### Premium Economy

Saved asset: `public/cabin/premium-economy-products-v173.webp` (965 x 1629 WebP).
Runtime URL: `/cabin/premium-economy-products-v173.webp`.

Full generation prompt:

> Use case: product-mockup. Asset type: production sprite atlas for an airline management game's Premium Economy cabin products. Create ONE portrait image, a vertical strip with exactly THREE equal-height edge-to-edge photographic panels, each panel 16:9 landscape, overall ratio 16:27 (desired 1024 by 1728). Top Basic, middle Premium, bottom Luxury, with NO written labels. Style: photorealistic airline cabin interior photography, natural daylight through oval windows, crisp woven fabric and realistic seat hardware, clean contemporary airliner architecture; consistent with a high-end First Class seat catalog but a visibly more modest class of travel. Use the SAME aisle-side three-quarter product view in every frame, one complete upright Premium Economy seat shown from headrest to floor, partial adjacent seats and cabin context only, not a full row arrangement or seating plan. TOP Basic: a generous upright slate blue fabric seat, padded headrest, useful broad shared armrest and modest legroom, clearly more substantial than a slim economy seat. MIDDLE Premium: better padded warm gray and muted ochre fabric Premium Economy recliner, sculpted adjustable winged headrest, broad armrest, folding calf support and refined stitching. BOTTOM Luxury: elegant burgundy and light-gray upholstered Premium Economy recliner, visibly thicker cushioning, adjustable headrest wings, substantial armrest console and extended calf support, still an OPEN UPRIGHT AIRLINER SEAT. All products remain seated upright with only modest recline; NO lie-flat beds, privacy pods, doors, full-height partitions or First/Business Class suites. Grades must be noticeably different at thumbnail scale through materials, cushioning and support, with believable cabin dimensions. Keep complete main seat within each frame, no clipped headrests or feet. No people, brands, logos, text, letters, watermarks, frame gutters or borders. Fictional product concepts, not certified layouts.

### Economy

Saved asset: `public/cabin/economy-products-v173.webp` (965 x 1629 WebP).
Runtime URL: `/cabin/economy-products-v173.webp`.

Full generation prompt:

> Use case: product-mockup. Asset type: production sprite atlas of Economy Class seat products for an airline management game. Make ONE portrait image containing exactly THREE equal-height edge-to-edge photographic frames stacked vertically. Each frame is 16:9 landscape; overall strip ratio 16:27, desired size 1024 by 1728. Frames are top Basic, middle Premium and bottom Luxury, but include NO words or labels. Style: photorealistic professional aircraft cabin photography, believable contemporary commercial airliner interior, oval windows, overhead bins, aisle carpet, honest woven-fabric textures and seat hardware, soft neutral daylight. Same aisle-side three-quarter perspective in every frame, one whole MAIN ECONOMY seat headrest-to-floor plus cropped neighboring seats for context; do not show a complete row layout or try to communicate seats abreast. TOP Basic: compact gray economy slimline fabric seat, thin but plausible padding, simple fixed headrest, narrow practical armrests, tight normal economy spacing, plain functional finish. MIDDLE Premium: noticeably improved blue fabric economy seat with contoured cushioning, adjustable headrest wings, nicer upholstery and more comfortable but still narrow armrests; a modern seat-back screen visible only in background. BOTTOM Luxury: refined dark emerald and muted gray economy seat, clearly thicker ergonomic cushions and stitched textile, supportive adjustable winged headrest, tasteful small lumbar cushion and slightly improved ordinary economy legroom. All three are normal upright ECONOMY seats, not Premium Economy, Business or First Class. NO giant recliners, no broad console armrests, no extended calf rests or foot beds, no privacy shells, no partitions or doors, no lie-flat seat. Different grades should read clearly through fabric, cushion shape and headrest quality at small thumbnail size while remaining physically believable. Keep main seat completely within each frame. No people, brand logos, letters, screen text, watermarks, gutters or decorative borders. Fictional product concepts rather than certified engineering layouts.

## Original V1.7.1 Catalog (Historical)

Former runtime asset: `/cabin/seat-products.png`.

AI-generated, unbranded product illustrations made with the built-in image tool.
They are visual game assets, not photographs of certified airline products.
One atlas, three columns (Basic, Premium, Luxury), four rows (First, Business,
Premium Economy, Economy). UI tiles display a single cell without editing the
source. Actual seating arrangement is rendered separately from model rules.

Generation prompt: a single uniform 3-by-4 airline-seat catalog sheet on a
cool-white studio background, consistent full-seat three-quarter views. First
class uses burgundy seat shells, Business indigo recliners, Premium Economy
amber upright seats and Economy teal slim seats. Left-to-right grades progress
from Basic cloth through Premium adjustable upholstery to Luxury padded leather.
Keep economy products upright; no people, logos, text or watermarks. Center each
seat with generous margins inside its equal tile.

## V1.7.2 First Class

Runtime asset: `/cabin/first-class-products-v172.webp`.

Generated with the built-in image tool in generate mode, without reference
images. The original 966-by-1628 PNG contains three equal-height vertical
frames: Basic, Premium and Luxury. CSS selects one frame; the source image is
not cropped or edited. Business, Premium Economy and Economy still use the
original atlas above. These are fictional, unbranded photorealistic concepts,
not photographs of certified airline products. Floor-plan layouts and widths
come from the existing model rules, not from the illustration.

Full generation prompt:

> Use case: product-mockup. Asset type: a production sprite atlas for three First Class seat product photographs in an airline management game. Create ONE image, a vertical strip with exactly THREE equal-height edge-to-edge rectangular photographic panels stacked top to bottom, each individual panel 16:9 landscape, overall desired canvas 1536 pixels wide by 2592 pixels tall. No gutters, borders, text, labels, logos, watermarks or humans. Every panel shows the SAME realistic modern widebody aircraft cabin perspective, eye level 3/4 view from the aisle, showing one complete seat and its surrounding personal space and aircraft windows. Neutral daylight, crisp realistic materials, refined balanced photographic color, believable cabin dimensions. TOP panel (Basic): an open wide charcoal upholstered first class armchair, modest armrests, low privacy dividers, standard table and screen, clearly open to neighboring seats. MIDDLE panel (Premium): a spacious semi-private blue upholstered lie-flat First Class seat, tall sculpted partition without a door, larger screen, tasteful wood side console, more personal space. BOTTOM panel (Luxury): visibly exceptional enclosed ivory and deep burgundy First Class suite, sliding privacy door OPEN to reveal the complete seat/bed, very large screen, fine stitched upholstery, generous personal space with refined wood and metal details, still physically believable inside an A330/A350-size airliner, not a mansion or business jet. Distinction between all three levels must be dramatic at thumbnail size. Each frame must independently show its complete product centered, avoid clipping important features at the panel boundaries. This is fictional photorealistic product concept art, not a branded real airline photograph.
