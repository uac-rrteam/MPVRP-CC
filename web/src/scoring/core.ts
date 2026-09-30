/** Pure MPVRP-CC parsing and feasibility logic shared by the Node scorer and browser tools. */

export interface Instance {
  productCount: number;
  costs: number[][];
  vehicles: Map<number, { capacity: number; garageId: number; initialProduct: number }>;
  depots: Map<number, { point: [number, number]; stock: number[] }>;
  garages: Map<number, { point: [number, number] }>;
  stations: Map<number, { point: [number, number]; demand: number[] }>;
  points: Map<string, [number, number]>;
}

type NodeKind = 'garage' | 'depot' | 'station';
interface RouteNode { kind: NodeKind; id: number; quantity: number }
interface ProductStep { product: number; reportedCost: number }
interface VehicleRoute { vehicleId: number; nodes: RouteNode[]; products: ProductStep[] }
export interface Solution { routes: VehicleRoute[] }
export interface Metrics {
  usedVehicles: number;
  totalChanges: number;
  totalSwitchCost: number;
  distanceTotal: number;
}
export interface Verification { errors: string[]; metrics: Metrics; feasible: boolean; objective: number | null }

const EPSILON = 1e-2;

function integer(token: string, context: string): number {
  if (!/^-?\d+$/.test(token)) throw new Error(`${context}: expected an integer, got ${token}`);
  const value = Number(token);
  if (!Number.isSafeInteger(value)) throw new Error(`${context}: integer outside safe range`);
  return value;
}

function finite(token: string, context: string): number {
  const value = Number(token);
  if (!token || !Number.isFinite(value)) throw new Error(`${context}: expected a finite number, got ${token}`);
  return value;
}

function fields(line: string, expected: number, context: string): string[] {
  const result = line.trim().split(/\s+/);
  if (result.length !== expected) throw new Error(`${context}: expected ${expected} fields, got ${result.length}`);
  return result;
}

export function parseInstance(text: string): Instance {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('Instance is empty or incomplete');
  const [productCount, depotCount, garageCount, stationCount, vehicleCount] = fields(lines[1], 5, 'dimensions').map((value, index) => integer(value, `dimension ${index + 1}`));
  if ([productCount, depotCount, garageCount, stationCount, vehicleCount].some(value => value < 1)) throw new Error('Instance dimensions must be positive');
  let line = 2;
  const next = (context: string) => {
    if (line >= lines.length) throw new Error(`${context}: unexpected end of instance`);
    return lines[line++];
  };
  const costs = Array.from({ length: productCount }, (_, index) => fields(next(`cost row ${index + 1}`), productCount, `cost row ${index + 1}`).map(value => integer(value, 'cost')));
  const vehicles = new Map<number, { capacity: number; garageId: number; initialProduct: number }>();
  const depots = new Map<number, { point: [number, number]; stock: number[] }>();
  const garages = new Map<number, { point: [number, number] }>();
  const stations = new Map<number, { point: [number, number]; demand: number[] }>();
  const points = new Map<string, [number, number]>();

  for (let i = 0; i < vehicleCount; i++) {
    const [id, capacity, garageId, product] = fields(next(`vehicle ${i + 1}`), 4, `vehicle ${i + 1}`).map(value => integer(value, 'vehicle field'));
    if (vehicles.has(id)) throw new Error(`Duplicate vehicle ${id}`);
    vehicles.set(id, { capacity, garageId, initialProduct: product - 1 });
  }
  for (let i = 0; i < depotCount; i++) {
    const [id, x, y, ...stock] = fields(next(`depot ${i + 1}`), 3 + productCount, `depot ${i + 1}`).map(value => integer(value, 'depot field'));
    if (depots.has(id)) throw new Error(`Duplicate depot ${id}`);
    depots.set(id, { point: [x, y], stock });
    points.set(`D${id}`, [x, y]);
  }
  for (let i = 0; i < garageCount; i++) {
    const [id, x, y] = fields(next(`garage ${i + 1}`), 3, `garage ${i + 1}`).map(value => integer(value, 'garage field'));
    if (garages.has(id)) throw new Error(`Duplicate garage ${id}`);
    garages.set(id, { point: [x, y] });
    points.set(`G${id}`, [x, y]);
  }
  for (let i = 0; i < stationCount; i++) {
    const [id, x, y, ...demand] = fields(next(`station ${i + 1}`), 3 + productCount, `station ${i + 1}`).map(value => integer(value, 'station field'));
    if (stations.has(id)) throw new Error(`Duplicate station ${id}`);
    stations.set(id, { point: [x, y], demand });
    points.set(`S${id}`, [x, y]);
  }
  if (line !== lines.length) throw new Error(`Instance contains ${lines.length - line} unexpected line(s)`);
  for (const [id, vehicle] of vehicles) {
    if (!garages.has(vehicle.garageId)) throw new Error(`Vehicle ${id} has unknown garage ${vehicle.garageId}`);
    if (vehicle.initialProduct < 0 || vehicle.initialProduct >= productCount) throw new Error(`Vehicle ${id} has invalid initial product`);
  }
  return { productCount, costs, vehicles, depots, garages, stations, points };
}

function parseNode(token: string): RouteNode {
  const depot = token.match(/^(\d+)\s*\[\s*([^\]]+)\s*\]$/);
  if (depot) return { kind: 'depot', id: integer(depot[1], 'depot id'), quantity: finite(depot[2], 'depot load') };
  const station = token.match(/^(\d+)\s*\(\s*([^\)]+)\s*\)$/);
  if (station) return { kind: 'station', id: integer(station[1], 'station id'), quantity: finite(station[2], 'station delivery') };
  if (/^\d+$/.test(token)) return { kind: 'garage', id: integer(token, 'garage id'), quantity: 0 };
  throw new Error(`Invalid route node: ${token}`);
}

function parseProduct(token: string): ProductStep {
  const match = token.match(/^(\d+)\s*\(\s*([^\)]+)\s*\)$/);
  if (!match) throw new Error(`Invalid product step: ${token}`);
  return { product: integer(match[1], 'product id'), reportedCost: finite(match[2], 'cumulative cost') };
}

export function parseSolution(text: string): Solution {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  while (lines.length && !lines.at(-1)) lines.pop();
  const routes: VehicleRoute[] = [];
  let index = 0;
  while (index < lines.length && lines[index].includes(':')) {
    const routeLine = lines[index++];
    if (index >= lines.length) throw new Error('Unexpected end of vehicle block');
    const productLine = lines[index++];
    const routeMatch = routeLine.match(/^(\d+)\s*:\s*(.+)$/);
    const productMatch = productLine.match(/^(\d+)\s*:\s*(.+)$/);
    if (!routeMatch || !productMatch) throw new Error('Vehicle block must contain two prefixed lines');
    const vehicleId = integer(routeMatch[1], 'vehicle id');
    if (integer(productMatch[1], 'product-line vehicle id') !== vehicleId) throw new Error(`Mismatched vehicle IDs in block ${vehicleId}`);
    const nodes = routeMatch[2].split(/\s+-\s+/).map(parseNode);
    const products = productMatch[2].split(/\s+-\s+/).map(parseProduct);
    if (!products.length || products.length !== nodes.length - 1 || nodes.at(-1)?.kind !== 'garage') {
      throw new Error('The product line must have one fewer entry than the route line; the final garage is implicit');
    }
    products.push(products.at(-1)!);
    routes.push({ vehicleId, nodes, products });
    while (index < lines.length && !lines[index]) index++;
  }
  const summary = lines.slice(index).filter(Boolean);
  if (summary.length !== 6) throw new Error('Solution must end with exactly six summary lines');
  integer(summary[0], 'used vehicles');
  integer(summary[1], 'product transitions');
  finite(summary[2], 'reported transition cost');
  finite(summary[3], 'reported distance');
  finite(summary[5], 'reported runtime');
  return { routes };
}

function key(node: RouteNode): string {
  return `${node.kind === 'garage' ? 'G' : node.kind === 'depot' ? 'D' : 'S'}${node.id}`;
}

function closeTrip(errors: string[], vehicleId: number, load: number, delivered: number, hasStation: boolean): void {
  if (!hasStation) errors.push(`Vehicle ${vehicleId}: every depot load must be followed by at least one delivery`);
  if (Math.abs(load - delivered) > EPSILON) errors.push(`Vehicle ${vehicleId}: mass conservation violated (loaded=${load}, delivered=${delivered})`);
}

export function verifySolution(instance: Instance, solution: Solution): Verification {
  const errors: string[] = [];
  const delivered = new Map<string, number>();
  const loaded = new Map<string, number>();
  const seenVisits = new Set<string>();
  const seenVehicles = new Set<number>();
  let totalChanges = 0;
  let totalSwitchCost = 0;
  let distanceTotal = 0;

  for (const route of solution.routes) {
    const id = route.vehicleId;
    if (seenVehicles.has(id)) { errors.push(`Vehicle ${id}: duplicate route block`); continue; }
    seenVehicles.add(id);
    const vehicle = instance.vehicles.get(id);
    if (!vehicle) { errors.push(`Vehicle ${id}: missing from instance`); continue; }
    const nodes = route.nodes;
    const products = route.products.map(step => step.product);
    if (nodes.length !== products.length) { errors.push(`Vehicle ${id}: route/product lengths differ`); continue; }
    if (!nodes.length) { errors.push(`Vehicle ${id}: empty route`); continue; }
    if (key(nodes[0]) !== `G${vehicle.garageId}` || key(nodes.at(-1)!) !== `G${vehicle.garageId}`) errors.push(`Vehicle ${id}: route must begin and end at home garage G${vehicle.garageId}`);
    if (nodes.length < 4) { errors.push(`Vehicle ${id}: route must contain a garage, depot, station and return garage`); continue; }
    for (let j = 0; j < nodes.length - 1; j++) {
      const from = instance.points.get(key(nodes[j]));
      const to = instance.points.get(key(nodes[j + 1]));
      if (!from || !to) errors.push(`Vehicle ${id}: unknown arc ${key(nodes[j])} -> ${key(nodes[j + 1])}`);
      else distanceTotal += Math.round(Math.hypot(from[0] - to[0], from[1] - to[1]));
    }
    if (products.some(product => product < 0 || product >= instance.productCount)) { errors.push(`Vehicle ${id}: product outside range`); continue; }
    if (products[0] !== vehicle.initialProduct) errors.push(`Vehicle ${id}: first product must be initial product ${vehicle.initialProduct}`);
    let cumulative = 0;
    let currentLoad: number | null = null;
    let currentDelivered = 0;
    let tripProduct: number | null = null;
    let tripHasStation = false;

    for (let j = 0; j < nodes.length; j++) {
      const node = nodes[j];
      const product = products[j];
      const quantity = node.quantity;
      if (quantity < -EPSILON) errors.push(`Vehicle ${id}: negative quantity at ${key(node)}`);
      if (node.kind === 'garage') {
        if (j !== 0 && j !== nodes.length - 1) errors.push(`Vehicle ${id}: garage may only appear at route endpoints`);
        if (j === nodes.length - 1 && currentLoad !== null) closeTrip(errors, id, currentLoad, currentDelivered, tripHasStation);
        if (j > 0 && product !== products[j - 1]) errors.push(`Vehicle ${id}: product cannot change at a garage`);
      } else if (node.kind === 'depot') {
        if (!instance.depots.has(node.id)) { errors.push(`Vehicle ${id}: unknown depot D${node.id}`); continue; }
        if (currentLoad !== null) closeTrip(errors, id, currentLoad, currentDelivered, tripHasStation);
        if (quantity <= EPSILON) errors.push(`Vehicle ${id}: depot D${node.id} load must be positive`);
        if (quantity > vehicle.capacity + EPSILON) errors.push(`Vehicle ${id}: capacity exceeded at D${node.id}`);
        const previous = j ? products[j - 1] : vehicle.initialProduct;
        if (product !== previous) totalChanges++;
        cumulative += instance.costs[previous][product];
        const stockKey = `D${node.id}:${product}`;
        loaded.set(stockKey, (loaded.get(stockKey) ?? 0) + quantity);
        currentLoad = quantity;
        currentDelivered = 0;
        tripProduct = product;
        tripHasStation = false;
      } else {
        if (!instance.stations.has(node.id)) { errors.push(`Vehicle ${id}: unknown station S${node.id}`); continue; }
        if (currentLoad === null || tripProduct === null) { errors.push(`Vehicle ${id}: station S${node.id} visited before loading`); continue; }
        if (product !== tripProduct) errors.push(`Vehicle ${id}: product changed inside a trip at S${node.id}`);
        if (quantity <= EPSILON) errors.push(`Vehicle ${id}: delivery at S${node.id} must be positive`);
        const visit = `${id}:${node.id}:${product}`;
        if (seenVisits.has(visit)) errors.push(`Vehicle ${id}: station S${node.id}, product ${product} visited more than once`);
        seenVisits.add(visit);
        const demandKey = `S${node.id}:${product}`;
        delivered.set(demandKey, (delivered.get(demandKey) ?? 0) + quantity);
        currentDelivered += quantity;
        tripHasStation = true;
      }
    }
    totalSwitchCost += cumulative;
  }

  for (const [id, station] of instance.stations) {
    station.demand.forEach((demand, product) => {
      const actual = delivered.get(`S${id}:${product}`) ?? 0;
      if (Math.abs(actual - demand) > EPSILON) errors.push(`Unsatisfied demand: S${id} product ${product} (demand=${demand}, delivered=${actual})`);
    });
  }
  for (const [id, depot] of instance.depots) {
    depot.stock.forEach((stock, product) => {
      const actual = loaded.get(`D${id}:${product}`) ?? 0;
      if (actual > stock + EPSILON) errors.push(`Stock exceeded: D${id} product ${product} (stock=${stock}, withdrawn=${actual})`);
    });
  }
  const metrics = { usedVehicles: seenVehicles.size, totalChanges, totalSwitchCost, distanceTotal };
  return { errors, metrics, feasible: errors.length === 0, objective: errors.length ? null : distanceTotal + totalSwitchCost };
}
