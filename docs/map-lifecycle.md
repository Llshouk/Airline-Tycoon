# Map Lifecycle

Airline Tycoon keeps the Leaflet 2D map mounted while the optional MapLibre globe is active so a return to 2D can be prepared behind the globe cover. React owns the two map panes; each map library owns only its nested container and runtime resources.

## Leaflet Ownership

- `GameMap` owns one Leaflet map, one base `TileLayer`, one gameplay `LayerGroup`, viewport listeners, tile-readiness work, and deferred popup work.
- Every base-layer replacement increments a tile generation. Readiness callbacks from older generations cannot reveal the 2D pane or change warning state.
- Base layers must be removed before their listeners are cleared. Leaflet uses an internal `remove` listener to detach map callbacks, so all base-layer teardown goes through `detachLeafletLayer`.
- Component/provider cleanup cancels tile waits, animation frames, deferred popups, viewport listeners, overlay layers, the base layer, and finally the map.

## MapLibre Ownership

- `MapLibreGlobeProvider` owns one MapLibre map, its sources, layers, image, popup, timeout, animation frames, listeners, and observers.
- The map instance is created by the provider mount effect and removed by that same effect.
- Long-lived listeners read current callbacks and translated labels through refs. Hidden or inactive globes stop movement and source-refresh work until visible again.
- Optional imagery, label, glyph, atmosphere, and highlight failures retain the playable core globe. Only fatal core initialization failures request the 2D fallback.

## Engine Switching

- A map-switch generation and effect-owned cancellation flag guard every asynchronous 3D-to-2D restoration boundary.
- Leaflet restoration normalizes extreme wrapped centers, invalidates size, creates a fresh base layer, waits for visible loaded tiles, and uses a bounded retry/recreation path before showing a warning.
- World-copy overlays are rebuilt from canonical IDs for the currently visible longitude range. Date-line routes remain split into short edge segments, and wrapped markers select the canonical game object.

Remote map tiles are not precached by the service worker. Map availability never changes save data or simulation accounting.
