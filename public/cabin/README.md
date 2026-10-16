# Seat Product Catalog

Runtime asset: `/cabin/seat-products.png`.

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

Runtime asset: `/cabin/first-class-products-v172.png`.

Generated with the built-in image tool in generate mode, without reference
images. The original 966-by-1628 PNG contains three equal-height vertical
frames: Basic, Premium and Luxury. CSS selects one frame; the source image is
not cropped or edited. Business, Premium Economy and Economy still use the
original atlas above. These are fictional, unbranded photorealistic concepts,
not photographs of certified airline products. Floor-plan layouts and widths
come from the existing model rules, not from the illustration.

Full generation prompt:

> Use case: product-mockup. Asset type: a production sprite atlas for three First Class seat product photographs in an airline management game. Create ONE image, a vertical strip with exactly THREE equal-height edge-to-edge rectangular photographic panels stacked top to bottom, each individual panel 16:9 landscape, overall desired canvas 1536 pixels wide by 2592 pixels tall. No gutters, borders, text, labels, logos, watermarks or humans. Every panel shows the SAME realistic modern widebody aircraft cabin perspective, eye level 3/4 view from the aisle, showing one complete seat and its surrounding personal space and aircraft windows. Neutral daylight, crisp realistic materials, refined balanced photographic color, believable cabin dimensions. TOP panel (Basic): an open wide charcoal upholstered first class armchair, modest armrests, low privacy dividers, standard table and screen, clearly open to neighboring seats. MIDDLE panel (Premium): a spacious semi-private blue upholstered lie-flat First Class seat, tall sculpted partition without a door, larger screen, tasteful wood side console, more personal space. BOTTOM panel (Luxury): visibly exceptional enclosed ivory and deep burgundy First Class suite, sliding privacy door OPEN to reveal the complete seat/bed, very large screen, fine stitched upholstery, generous personal space with refined wood and metal details, still physically believable inside an A330/A350-size airliner, not a mansion or business jet. Distinction between all three levels must be dramatic at thumbnail size. Each frame must independently show its complete product centered, avoid clipping important features at the panel boundaries. This is fictional photorealistic product concept art, not a branded real airline photograph.
