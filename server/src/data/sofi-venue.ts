/**
 * SoFi Stadium venue configuration.
 * Inglewood, CA — capacity 70,240.
 * 12 zones: 4 gates, 2 concourses, 2 seating sections, 1 medical, 1 accessibility hub,
 * 1 food court, 1 restroom cluster.
 */
import type { VenueConfig, Zone } from '../types/index.js';

const zones: Zone[] = [
  // ── Gates ──────────────────────────────────────────────────────────────
  {
    zoneId: 'gate-a',
    name: 'Gate A (North)',
    type: 'gate',
    capacity: 8000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-north', 'accessibility-hub'],
    adjacentZones: ['concourse-north', 'accessibility-hub'],
    coordinates: { x: 50, y: 5 },
  },
  {
    zoneId: 'gate-b',
    name: 'Gate B (East)',
    type: 'gate',
    capacity: 8000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-east', 'accessibility-hub'],
    adjacentZones: ['concourse-east', 'accessibility-hub'],
    coordinates: { x: 95, y: 50 },
  },
  {
    zoneId: 'gate-c',
    name: 'Gate C (South)',
    type: 'gate',
    capacity: 8000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-south', 'accessibility-hub'],
    adjacentZones: ['concourse-south', 'accessibility-hub'],
    coordinates: { x: 50, y: 95 },
  },
  {
    zoneId: 'gate-d',
    name: 'Gate D (West)',
    type: 'gate',
    capacity: 8000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-west', 'accessibility-hub'],
    adjacentZones: ['concourse-west', 'accessibility-hub'],
    coordinates: { x: 5, y: 50 },
  },

  // ── Concourses ─────────────────────────────────────────────────────────
  {
    zoneId: 'concourse-north',
    name: 'North Concourse',
    type: 'concourse',
    capacity: 12000,
    currentOccupancy: 0,
    accessibleRoutes: ['gate-a', 'section-100s', 'accessibility-hub', 'food-court-north'],
    adjacentZones: ['gate-a', 'section-100s', 'accessibility-hub', 'food-court-north', 'restrooms-north'],
    coordinates: { x: 50, y: 20 },
  },
  {
    zoneId: 'concourse-east',
    name: 'East Concourse',
    type: 'concourse',
    capacity: 10000,
    currentOccupancy: 0,
    accessibleRoutes: ['gate-b', 'section-200s', 'accessibility-hub'],
    adjacentZones: ['gate-b', 'section-200s', 'accessibility-hub', 'food-court-north'],
    coordinates: { x: 75, y: 50 },
  },
  {
    zoneId: 'concourse-south',
    name: 'South Concourse',
    type: 'concourse',
    capacity: 12000,
    currentOccupancy: 0,
    accessibleRoutes: ['gate-c', 'section-100s', 'accessibility-hub'],
    adjacentZones: ['gate-c', 'section-100s', 'accessibility-hub', 'restrooms-north'],
    coordinates: { x: 50, y: 80 },
  },
  {
    zoneId: 'concourse-west',
    name: 'West Concourse',
    type: 'concourse',
    capacity: 10000,
    currentOccupancy: 0,
    accessibleRoutes: ['gate-d', 'section-200s', 'accessibility-hub'],
    adjacentZones: ['gate-d', 'section-200s', 'accessibility-hub', 'medical-bay'],
    coordinates: { x: 25, y: 50 },
  },

  // ── Seating Sections ───────────────────────────────────────────────────
  {
    zoneId: 'section-100s',
    name: 'Sections 100–130 (Lower Bowl)',
    type: 'section',
    capacity: 18000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-north', 'concourse-south', 'accessibility-hub'],
    adjacentZones: ['concourse-north', 'concourse-south', 'accessibility-hub'],
    coordinates: { x: 50, y: 50 },
  },
  {
    zoneId: 'section-200s',
    name: 'Sections 200–240 (Upper Bowl)',
    type: 'section',
    capacity: 14000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-east', 'concourse-west', 'accessibility-hub'],
    adjacentZones: ['concourse-east', 'concourse-west', 'accessibility-hub'],
    coordinates: { x: 50, y: 55 },
  },

  // ── Support Zones ──────────────────────────────────────────────────────
  {
    zoneId: 'medical-bay',
    name: 'Medical Bay (West Wing)',
    type: 'medical',
    capacity: 200,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-west', 'accessibility-hub'],
    adjacentZones: ['concourse-west', 'accessibility-hub'],
    coordinates: { x: 10, y: 45 },
  },
  {
    zoneId: 'accessibility-hub',
    name: 'Accessibility Services Hub',
    type: 'accessibility',
    capacity: 500,
    currentOccupancy: 0,
    accessibleRoutes: ['gate-a', 'gate-b', 'gate-c', 'gate-d', 'concourse-north', 'concourse-east', 'concourse-south', 'concourse-west', 'section-100s', 'section-200s', 'medical-bay'],
    adjacentZones: ['gate-a', 'gate-b', 'gate-c', 'gate-d', 'concourse-north', 'concourse-east', 'concourse-south', 'concourse-west', 'medical-bay'],
    coordinates: { x: 50, y: 48 },
  },
  {
    zoneId: 'food-court-north',
    name: 'North Food Court',
    type: 'food',
    capacity: 3000,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-north', 'concourse-east'],
    adjacentZones: ['concourse-north', 'concourse-east'],
    coordinates: { x: 65, y: 20 },
  },
  {
    zoneId: 'restrooms-north',
    name: 'North Restroom Cluster',
    type: 'restroom',
    capacity: 1500,
    currentOccupancy: 0,
    accessibleRoutes: ['concourse-north', 'concourse-south'],
    adjacentZones: ['concourse-north', 'concourse-south'],
    coordinates: { x: 35, y: 20 },
  },
];

export const sofiVenue: VenueConfig = {
  venueId: 'sofi-stadium',
  venueName: 'SoFi Stadium',
  city: 'Inglewood, CA',
  capacity: 70_240,
  zones,
};

/**
 * Lookup a zone by ID. Returns undefined if not found.
 */
export function getZoneById(zoneId: string): Zone | undefined {
  return sofiVenue.zones.find((z) => z.zoneId === zoneId);
}

/**
 * Returns all zones adjacent to the given zone (one hop).
 */
export function getAdjacentZones(zoneId: string): Zone[] {
  const zone = getZoneById(zoneId);
  if (!zone) return [];
  return zone.adjacentZones
    .map((id) => getZoneById(id))
    .filter((z): z is Zone => z !== undefined);
}

/**
 * BFS over accessibleRoutes to find shortest step-free path between two zones.
 * Returns the path as zone IDs, or null if no path exists.
 */
export function findAccessiblePath(fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];

  const visited = new Set<string>([fromId]);
  const queue: Array<{ zoneId: string; path: string[] }> = [
    { zoneId: fromId, path: [fromId] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const zone = getZoneById(current.zoneId);
    if (!zone) continue;

    for (const neighborId of zone.accessibleRoutes) {
      if (visited.has(neighborId)) continue;
      const newPath = [...current.path, neighborId];
      if (neighborId === toId) return newPath;
      visited.add(neighborId);
      queue.push({ zoneId: neighborId, path: newPath });
    }
  }

  return null; // no accessible path
}

/**
 * BFS over adjacentZones (any route) to find shortest path between two zones.
 * Returns path as zone IDs, or null if no path exists.
 */
export function findShortestPath(fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];

  const visited = new Set<string>([fromId]);
  const queue: Array<{ zoneId: string; path: string[] }> = [
    { zoneId: fromId, path: [fromId] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const zone = getZoneById(current.zoneId);
    if (!zone) continue;

    for (const neighborId of zone.adjacentZones) {
      if (visited.has(neighborId)) continue;
      const newPath = [...current.path, neighborId];
      if (neighborId === toId) return newPath;
      visited.add(neighborId);
      queue.push({ zoneId: neighborId, path: newPath });
    }
  }

  return null;
}
