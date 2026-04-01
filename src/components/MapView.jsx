import { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ROUTE_COLORS = ['#2563eb', '#7c3aed'];

export function MapView({ userLocation, birchTrees, routes, selectedRoute }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center = userLocation ? [userLocation.lng, userLocation.lat] : [24.9384, 60.1699];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center,
      zoom: 14,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      if (!mapRef.current) return;

      // Birch heatmap
      map.addSource('birch', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'birch-heat',
        type: 'heatmap',
        source: 'birch',
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 16, 1.2],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(254,240,138,0.4)',
            0.5, 'rgba(251,146,60,0.55)',
            0.8, 'rgba(239,68,68,0.65)',
            1, 'rgba(153,27,27,0.75)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 16, 28],
          'heatmap-opacity': 0.85,
        },
      });

      // Routes (support up to 2 alternatives)
      for (let i = 0; i < 2; i++) {
        map.addSource(`route-${i}`, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: `route-${i}`,
          type: 'line',
          source: `route-${i}`,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROUTE_COLORS[i],
            'line-width': 4,
            'line-opacity': i === 0 ? 1 : 0.4,
          },
        });
      }

      mapLoadedRef.current = true;
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update user location marker
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    const coords = [userLocation.lng, userLocation.lat];

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-marker';
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(mapRef.current);
    } else {
      markerRef.current.setLngLat(coords);
    }

    if (mapReady && !routes) {
      mapRef.current.flyTo({ center: coords, zoom: 14 });
    }
  }, [userLocation, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update birch heatmap
  useEffect(() => {
    if (!mapLoadedRef.current || !birchTrees) return;
    mapRef.current?.getSource('birch')?.setData(birchTrees);
  }, [birchTrees, mapReady]);

  // Update routes
  useEffect(() => {
    if (!mapLoadedRef.current || !routes?.length) return;

    routes.forEach((route, i) => {
      if (i >= 2) return;
      mapRef.current?.getSource(`route-${i}`)?.setData({
        type: 'Feature',
        geometry: route.geometry,
        properties: {},
      });
      mapRef.current?.setPaintProperty(`route-${i}`, 'line-opacity', i === selectedRoute ? 1 : 0.35);
      mapRef.current?.setPaintProperty(`route-${i}`, 'line-width', i === selectedRoute ? 5 : 3);
    });

    // Clear unused route slots
    for (let i = routes.length; i < 2; i++) {
      mapRef.current?.getSource(`route-${i}`)?.setData({ type: 'FeatureCollection', features: [] });
    }

    // Fit to selected route
    const geom = routes[selectedRoute]?.geometry;
    if (geom?.coordinates?.length) {
      const bounds = geom.coordinates.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(geom.coordinates[0], geom.coordinates[0])
      );
      mapRef.current?.fitBounds(bounds, { padding: { top: 60, bottom: 220, left: 40, right: 40 } });
    }
  }, [routes, selectedRoute, mapReady]);

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map-container" />
    </div>
  );
}
