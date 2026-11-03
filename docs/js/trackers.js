/* BikeAds tracker feed.
 * The map never talks to a GPS vendor directly. It asks TrackerFeed for positions.
 * v1 runs SimulatorProvider (bikes drift slowly around their location) and honours
 * manual positions set by the admin. When David's trackers are known, add a provider
 * with the same start/stop shape (see TraccarProvider / WebhookProvider sketches below)
 * and switch TrackerFeed.provider. Positions are matched to bikes by trackerId (IMEI).
 */
(function () {
  'use strict';

  const METERS_PER_DEG_LAT = 111320;
  const headings = {};

  const SimulatorProvider = {
    name: 'Simulator',
    live: false,
    timer: null,
    start(onPositions) {
      this.stop();
      const tick = () => {
        const updates = [];
        Data.list('bikes').forEach((b) => {
          if (!b.position || b.position.source === 'manual') return;
          const loc = Data.get('locations', b.locationId);
          if (!loc) return;
          let h = headings[b.id];
          if (h === undefined) h = Math.random() * Math.PI * 2;
          h += (Math.random() - 0.5) * 0.7;
          const step = 4 + Math.random() * 6; // metres per tick, a slow ride
          const mPerDegLng = METERS_PER_DEG_LAT * Math.cos(loc.lat * Math.PI / 180);
          let lat = b.position.lat + (Math.cos(h) * step) / METERS_PER_DEG_LAT;
          let lng = b.position.lng + (Math.sin(h) * step) / mPerDegLng;
          // keep each bike within ~700 m of its location centre
          const dy = (lat - loc.lat) * METERS_PER_DEG_LAT, dx = (lng - loc.lng) * mPerDegLng;
          if (Math.hypot(dx, dy) > 700) { h = Math.atan2(-dx, -dy); lat = b.position.lat; lng = b.position.lng; }
          headings[b.id] = h;
          updates.push({ trackerId: b.trackerId, lat, lng, at: new Date().toISOString(), source: 'sim' });
        });
        onPositions(updates);
      };
      this.timer = setInterval(tick, 3000);
      tick();
    },
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  };

  /* Sketch: Traccar (open-source GPS server most tracker brands can report to).
  const TraccarProvider = {
    name: 'Traccar', live: true, timer: null,
    start(onPositions) {
      const poll = async () => {
        // Call through your own small server so the Traccar password is never in the browser.
        const res = await fetch('/api/traccar/positions');
        const list = await res.json(); // [{ deviceUniqueId, latitude, longitude, fixTime }]
        onPositions(list.map((p) => ({ trackerId: p.deviceUniqueId, lat: p.latitude, lng: p.longitude, at: p.fixTime, source: 'live' })));
      };
      this.timer = setInterval(poll, 10000); poll();
    },
    stop() { clearInterval(this.timer); }
  };
  A vendor webhook works the same way: the vendor POSTs positions to your server,
  the server stores them, and a provider like the one above polls (or listens on a
  websocket) and calls onPositions().
  */

  const TrackerFeed = {
    provider: SimulatorProvider,
    running: false,
    subscribers: new Set(),
    start() {
      if (this.running) return;
      this.running = true;
      this.provider.start((updates) => this.apply(updates));
    },
    stop() { this.provider.stop(); this.running = false; },
    apply(updates) {
      if (!updates.length) return;
      const byTracker = {};
      Data.list('bikes').forEach((b) => { byTracker[b.trackerId] = b; });
      updates.forEach((u) => {
        const b = byTracker[u.trackerId];
        if (!b) return;
        if (b.position && b.position.source === 'manual' && u.source === 'sim') return;
        Data.put('bikes', { id: b.id, position: { lat: u.lat, lng: u.lng, at: u.at, source: u.source } }, { silent: true });
      });
      Data.flush('bikes');
      this.subscribers.forEach((fn) => fn());
    },
    setManual(bikeId, lat, lng) {
      Data.put('bikes', { id: bikeId, position: { lat, lng, at: new Date().toISOString(), source: 'manual' } });
      this.subscribers.forEach((fn) => fn());
    },
    release(bikeId) {
      const b = Data.bike(bikeId);
      if (!b || !b.position) return;
      Data.put('bikes', { id: bikeId, position: Object.assign({}, b.position, { source: 'sim' }) });
    },
    onUpdate(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); },
    isLive() { return !!this.provider.live; }
  };

  window.TrackerFeed = TrackerFeed;
})();
