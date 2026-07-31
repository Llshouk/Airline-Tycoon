import assert from "node:assert/strict";
import test from "node:test";
import { detachLeafletLayer } from "@/lib/leafletLayerLifecycle";

test("detaches a Leaflet layer before clearing its event listeners", () => {
  const calls: string[] = [];
  let internalRemoveHookAttached = true;
  let mapListenerAttached = true;

  detachLeafletLayer({
    remove() {
      calls.push("remove");
      if (internalRemoveHookAttached) mapListenerAttached = false;
    },
    off() {
      calls.push("off");
      internalRemoveHookAttached = false;
    }
  });

  assert.deepEqual(calls, ["remove", "off"]);
  assert.equal(mapListenerAttached, false);
});
