// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

let instance = { locations: {}, demands: [], depotSupplies: {} };
let solution = { routes: {}, objective: 0 };

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height;

// Cached transform from instance coordinates to screen coordinates
let coordTransform = null;

// Pan and zoom state
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1;
let isPanning = false;
let lastMousePos = { x: 0, y: 0 };

let isPlaying = false;
let progress = 0;
let speed = 1;
let maxProgress = 0;
let animationId;
let lastTime = 0;
let trucks = [];
let stationDemands = {};
let stationVisits = {};
let depotWithdrawals = {}; // Track withdrawals from depots per product
let dataLoaded = false;

// Exchange tracking
let totalExchanges = 0;
let currentExchanges = 0;

// Product swap tracking for notifications
let lastProductByTruck = {}; // Track last product for each truck
let shownSwapNotifications = {}; // Track which swaps have been notified

// Station deliveries tracking (per product)
let stationDeliveriesPerProduct = {}; // { stationId: { productIdx: delivered } }
let stationDemandsPerProduct = {}; // { stationId: { productIdx: demand } }

// Tooltip state
let hoveredNode = null;
let focusedTruckId = null;

const TRUCK_COLORS = [
    '#2563EB', '#059669', '#7C3AED', '#DB2777', '#0891B2', '#CA8A04',
    '#E11D48', '#4F46E5', '#4D7C0F', '#0F766E', '#0369A1', '#9333EA',
    '#BE123C', '#047857', '#1D4ED8', '#A21CAF', '#0E7490', '#854D0E',
    '#4338CA', '#15803D', '#6D28D9', '#9D174D', '#075985', '#3F6212'
];

const NODE_ICON_PATHS = {
    garage: [
        'M3 21V10L12 3L21 10V21',
        'M5 9H19',
        'M8 21V14H16V21',
        'M10 17H14'
    ],
    depot: [
        'M7.5 4.27L16.5 9.42',
        'M21 8A2 2 0 0 0 20 6.27L13 2.27A2 2 0 0 0 11 2.27L4 6.27A2 2 0 0 0 3 8V16A2 2 0 0 0 4 17.73L11 21.73A2 2 0 0 0 13 21.73L20 17.73A2 2 0 0 0 21 16Z',
        'M3.3 7L12 12L20.7 7',
        'M12 22V12'
    ],
    station: [
        'M20 10C20 15 12 22 12 22S4 15 4 10A8 8 0 1 1 20 10Z',
        'M14.5 10A2.5 2.5 0 1 1 9.5 10A2.5 2.5 0 1 1 14.5 10Z'
    ]
};

const NODE_ICON_COLORS = {
    garage: '#4F46E5',
    depot: '#0891B2',
    station: '#DB2777'
};

function truckColorAt(index) {
    return TRUCK_COLORS[index % TRUCK_COLORS.length];
}

function colorWithAlpha(hex, alpha) {
    const normalized = hex.replace('#', '');
    const value = Number.parseInt(normalized, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function nodeIconMarkup(type) {
    return `<svg class="node-icon node-icon--${type}" aria-hidden="true"><use href="#icon-node-${type}"></use></svg>`;
}

const EXAMPLE_FILES = {
    instance: '../data/examples/MPVRP_052_s9_d1_p2.dat',
    solution: '../data/examples/Sol_052_s9_d1_p2.dat'
};

// ═══════════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    document.getElementById('themeIcon').textContent = next === 'light' ? '☀️' : '🌙';
    draw();
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════

function showSwapNotification(truckId, fromProduct, toProduct, truckColor) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.setProperty('--truck-color', truckColor);
    notification.innerHTML = `
        <div class="notification-icon" aria-hidden="true">↻</div>
        <div class="notification-content">
            <div class="notification-title">
                <span class="notification-truck"></span>
                ${truckId} Truck
            </div>
            <div class="notification-message">P${fromProduct} → P${toProduct}</div>
        </div>
    `;

    container.appendChild(notification);

    // Remove notification after animation completes
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

function clearAllNotifications() {
    const container = document.getElementById('notificationContainer');
    if (container) {
        container.innerHTML = '';
    }
}

function clearFileError() {
    const errorEl = document.getElementById('fileError');
    if (errorEl) errorEl.hidden = true;
}

function showFileError(filename, error) {
    const errorEl = document.getElementById('fileError');
    const messageEl = document.getElementById('fileErrorMessage');
    if (!errorEl || !messageEl) return;

    const line = error.lineNumber ? `, line ${error.lineNumber}` : '';
    messageEl.textContent = `${filename}${line}: ${error.message}`;
    errorEl.hidden = false;
}

function parseError(message, lineNumber) {
    const error = new Error(message);
    error.lineNumber = lineNumber;
    return error;
}

function jsonErrorWithLine(error, content) {
    const position = Number(error.message.match(/position\s+(\d+)/i)?.[1]);
    if (!Number.isFinite(position)) return error;
    error.lineNumber = content.slice(0, position).split(/\r?\n/).length;
    return error;
}

// ═══════════════════════════════════════════════════════════════
// FILE UPLOAD HANDLING
// ═══════════════════════════════════════════════════════════════

function setupDragDrop(zoneId, inputId, type) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('dragover'));
    });

    zone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file, type);
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file, type);
        e.target.value = '';
    });
}

function handleFile(file, type) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const previousValue = type === 'instance' ? instance : solution;
        try {
            const content = event.target.result;
            if (type === 'instance') {
                if (file.name.endsWith('.dat') || file.name.endsWith('.txt')) {
                    instance = parseDatInstance(content);
                } else {
                    try { instance = JSON.parse(content); } catch (error) { throw jsonErrorWithLine(error, content); }
                }
                validateInstance(instance);
            } else {
                if (file.name.endsWith('.dat') || file.name.endsWith('.txt')) {
                    solution = parseDatSolution(content);
                } else {
                    try { solution = JSON.parse(content); } catch (error) { throw jsonErrorWithLine(error, content); }
                }
                validateSolution(solution);
            }
            initData();
            updateFileStatus(type, file.name);
            resize();
            clearFileError();
        } catch (err) {
            if (type === 'instance') instance = previousValue;
            else solution = previousValue;
            try { initData(); resize(); } catch (restoreError) { console.error(restoreError); }
            showFileError(file.name, err);
            console.warn(`Could not load ${file.name}: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function validateInstance(value) {
    if (!value || typeof value !== 'object') throw new Error('the instance must be an object.');
    if (!value.locations || typeof value.locations !== 'object' || Object.keys(value.locations).length === 0) {
        throw new Error('no locations were found.');
    }
    for (const [id, coords] of Object.entries(value.locations)) {
        if (!Array.isArray(coords) || coords.length < 2 || coords.slice(0, 2).some(v => !Number.isFinite(Number(v)))) {
            throw new Error(`location ${id} must contain two numeric coordinates.`);
        }
    }
}

function validateSolution(value) {
    if (!value || typeof value !== 'object') throw new Error('the solution must be an object.');
    if (!value.routes || typeof value.routes !== 'object' || Object.keys(value.routes).length === 0) {
        throw new Error('no vehicle routes were found.');
    }
    for (const [vehicleId, segments] of Object.entries(value.routes)) {
        if (!Array.isArray(segments) || segments.some(segment => !Array.isArray(segment) || segment.length !== 2)) {
            throw new Error(`route ${vehicleId} must be a list of [start, end] segments.`);
        }
    }
}

async function loadExample() {
    const button = document.getElementById('exampleButton');
    const originalLabel = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = 'Loading…';
    }

    try {
        const [instanceResponse, solutionResponse] = await Promise.all([
            fetch(EXAMPLE_FILES.instance),
            fetch(EXAMPLE_FILES.solution)
        ]);

        if (!instanceResponse.ok) throw new Error(`could not read ${EXAMPLE_FILES.instance} (${instanceResponse.status}).`);
        if (!solutionResponse.ok) throw new Error(`could not read ${EXAMPLE_FILES.solution} (${solutionResponse.status}).`);

        const [instanceContent, solutionContent] = await Promise.all([
            instanceResponse.text(),
            solutionResponse.text()
        ]);
        const parsedInstance = parseDatInstance(instanceContent);
        const parsedSolution = parseDatSolution(solutionContent);
        validateInstance(parsedInstance);
        validateSolution(parsedSolution);

        instance = parsedInstance;
        solution = parsedSolution;
        updateFileStatus('instance', EXAMPLE_FILES.instance.split('/').pop());
        updateFileStatus('solution', EXAMPLE_FILES.solution.split('/').pop());
        clearFileError();
        initData();
        resize();
    } catch (error) {
        const localHint = window.location.protocol === 'file:'
            ? ' Open the site through its local web server; browsers block fetch() from file:// pages.'
            : '';
        showFileError('data/examples', new Error(error.message + localHint));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
}

function parseDatInstance(text) {
    const sourceLines = text.split(/\r?\n/)
        .map((text, index) => ({ text: text.trim(), number: index + 1 }))
        .filter(line => line.text && !line.text.startsWith('#'));
    const lines = sourceLines.map(line => line.text);
    const lineNumberAt = index => sourceLines[index]?.number || Math.max(1, text.split(/\r?\n/).length);
    let lineIdx = 0;

    if (lines.length === 0) throw parseError('the instance file is empty.', 1);

    // Dimensions
    // Two conventions exist in the project history:
    //  A) num_products num_depots num_garages num_stations num_vehicles  (used by core/model parser)
    //  B) num_vehicles num_depots num_garages num_stations num_products  (seen in some docs)
    // We auto-detect by validating the change-cost matrix shape.
    const dims = lines[lineIdx++].split(/\s+/).map(Number);
    if (dims.length !== 5 || dims.some(n => Number.isNaN(n))) {
        throw parseError('expected five integer dimensions.', lineNumberAt(0));
    }

    const candidates = [
        {
            name: 'products-first',
            numProducts: dims[0],
            numDepots: dims[1],
            numGarages: dims[2],
            numStations: dims[3],
            numVehicles: dims[4]
        },
        {
            name: 'vehicles-first',
            numVehicles: dims[0],
            numDepots: dims[1],
            numGarages: dims[2],
            numStations: dims[3],
            numProducts: dims[4]
        }
    ];

    function matrixLooksValid(startIdx, n) {
        if (!Number.isFinite(n) || n <= 0) return false;
        if (startIdx + n > lines.length) return false;
        for (let r = 0; r < n; r++) {
            const row = lines[startIdx + r].split(/\s+/).filter(Boolean);
            if (row.length < n) return false;
            if (row.slice(0, n).some(v => Number.isNaN(parseFloat(v)))) return false;
        }
        return true;
    }

    const chosen = candidates.find(c => matrixLooksValid(lineIdx, c.numProducts)) || candidates[0];
    const { numVehicles, numDepots, numProducts, numStations, numGarages } = chosen;

    if ([numVehicles, numDepots, numProducts, numStations, numGarages].some(n => !Number.isInteger(n) || n < 1)) {
        throw parseError('all dimensions must be positive integers.', lineNumberAt(0));
    }

    if (!matrixLooksValid(lineIdx, numProducts)) {
        throw parseError(`expected a ${numProducts} × ${numProducts} numeric change-cost matrix.`, lineNumberAt(lineIdx));
    }

    // Skip Change Costs (numProducts lines)
    lineIdx += numProducts;

    // Skip Vehicles (numVehicles lines)
    if (lineIdx + numVehicles > lines.length) {
        throw parseError(`expected ${numVehicles} vehicle rows.`, lineNumberAt(lineIdx));
    }
    lineIdx += numVehicles;

    const locations = {};
    const demands = [];
    const depotSupplies = {};

    // Parse Depots
    for (let i = 0; i < numDepots; i++) {
        if (!lines[lineIdx]) throw parseError(`missing depot ${i + 1}.`, lineNumberAt(lineIdx));
        const parts = lines[lineIdx++].split(/\s+/);
        if (parts.length < 3 + numProducts || parts.slice(1, 3 + numProducts).some(v => !Number.isFinite(Number(v)))) {
            throw parseError(`depot ${i + 1} must contain an id, two coordinates and ${numProducts} supplies.`, lineNumberAt(lineIdx - 1));
        }
        const id = parts[0];
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        locations[`D${id}`] = [x, y];

        // Parse depot supplies for each product
        const supplies = [];
        for (let p = 0; p < numProducts; p++) {
            supplies.push(parseFloat(parts[3 + p] || 0));
        }
        depotSupplies[`D${id}`] = supplies;
    }

    // Parse Garages
    for (let i = 0; i < numGarages; i++) {
        if (!lines[lineIdx]) throw parseError(`missing garage ${i + 1}.`, lineNumberAt(lineIdx));
        const parts = lines[lineIdx++].split(/\s+/);
        if (parts.length < 3 || parts.slice(1, 3).some(v => !Number.isFinite(Number(v)))) {
            throw parseError(`garage ${i + 1} must contain an id and two coordinates.`, lineNumberAt(lineIdx - 1));
        }
        const id = parts[0];
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        locations[`G${id}`] = [x, y];
    }

    // Parse Stations
    const stationDemandsPerProductLocal = {}; // Track per-product demands
    for (let i = 0; i < numStations; i++) {
        if (!lines[lineIdx]) throw parseError(`missing station ${i + 1}.`, lineNumberAt(lineIdx));
        const parts = lines[lineIdx++].split(/\s+/);
        if (parts.length < 3 + numProducts || parts.slice(1, 3 + numProducts).some(v => !Number.isFinite(Number(v)))) {
            throw parseError(`station ${i + 1} must contain an id, two coordinates and ${numProducts} demands.`, lineNumberAt(lineIdx - 1));
        }
        const id = parts[0];
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        locations[`S${id}`] = [x, y];

        // Store per-product demands
        const productDemands = [];
        let totalDemand = 0;
        for (let p = 0; p < numProducts; p++) {
            const demand = parseFloat(parts[3 + p] || 0);
            productDemands.push(demand);
            totalDemand += demand;
        }
        stationDemandsPerProductLocal[`S${id}`] = productDemands;
        demands.push({ station: `S${id}`, quantity: totalDemand });
    }

    return {
        locations,
        demands,
        depotSupplies,
        stationDemandsPerProduct: stationDemandsPerProductLocal,
        num_vehicles: numVehicles,
        num_depots: numDepots,
        num_products: numProducts,
        num_stations: numStations,
        num_garages: numGarages
    };
}

function parseDatSolution(text) {
    const sourceLines = text.split(/\r?\n/)
        .map((text, index) => ({ text: text.trim(), number: index + 1 }))
        .filter(line => line.text && !line.text.startsWith('#'));
    const lines = sourceLines.map(line => line.text);
    const lineNumberAt = index => sourceLines[index]?.number || Math.max(1, text.split(/\r?\n/).length);
    let lineIdx = 0;

    if (lines.length === 0) throw parseError('the solution file is empty.', 1);

    const solution = {
        routes: {},
        depotLoads: {}, // Track loading quantities at depots
        productLines: {},
        segmentMeta: {},
        routeSourceLines: {},
        metrics: {}
    };

    // Parse vehicle routes until we reach metrics
    while (lineIdx < lines.length) {
        const line = lines[lineIdx];

        // Check if this is a vehicle line in format "ID: <route>"
        const idMatch = line.match(/^\s*(\d+)\s*:\s*(.*)$/);
        if (idMatch) {
            const vehicleId = parseInt(idMatch[1]);
            // route content after the colon
            let routeLine = idMatch[2].trim();
            if (!routeLine) throw parseError(`route for vehicle ${vehicleId} is empty.`, lineNumberAt(lineIdx));
            lineIdx++;

            // Find next non-empty line for products
            while (lineIdx < lines.length && lines[lineIdx].trim() === '') {
                lineIdx++;
            }
            if (lineIdx >= lines.length) {
                throw parseError(`missing product line for vehicle ${vehicleId}.`, lineNumberAt(lineIdx));
            }

            let productsLineRaw = lines[lineIdx].trim();
            // Remove optional "ID: " prefix from products line
            productsLineRaw = productsLineRaw.replace(/^\s*\d+\s*:\s*/, '');
            lineIdx++;

            const parseProductState = (token) => {
                const m = String(token).trim().match(/^(-?\d+)\s*(?:\(([-+]?\d*\.?\d+)\))?$/);
                if (!m) return null;
                const idx = parseInt(m[1], 10);
                return Number.isNaN(idx) ? null : idx;
            };

            // Parse the route (split by " - ") and build segments
            const routeParts = routeLine.split(' - ').map(p => p.trim());
            const productStates = productsLineRaw.split(' - ').map(p => parseProductState(p));
            if (routeParts.length < 2) {
                throw parseError(`route for vehicle ${vehicleId} needs at least two nodes separated by " - ".`, lineNumberAt(lineIdx - 2));
            }
            if (productStates.some(product => product === null)) {
                throw parseError(`product line for vehicle ${vehicleId} contains an invalid product state.`, lineNumberAt(lineIdx - 1));
            }
            const hasStatePerNode = productStates.length === routeParts.length;
            const hasStatePerSegment = productStates.length === routeParts.length - 1;
            if (!hasStatePerNode && !hasStatePerSegment) {
                throw parseError(
                    `vehicle ${vehicleId} has ${routeParts.length} route nodes; expected ${routeParts.length} product states (per node) or ${routeParts.length - 1} (per segment), but found ${productStates.length}.`,
                    lineNumberAt(lineIdx - 1)
                );
            }
            const segments = [];
            const vehicleLoads = []; // Track loads for this vehicle
            const vehicleSegmentMeta = [];

            const extractNodeInfo = (token, position, lastPosition) => {
                // Token may be: "12", "12 [qty]", "12 (qty)", or typed "G2"/"D1"/"S5".
                const raw = String(token).trim();
                const base = raw.split('[', 1)[0].split('(', 1)[0].trim();

                // Extract quantity from brackets [qty] (depot load)
                const bracketMatch = raw.match(/\[(\d+(?:\.\d+)?)\]/);
                const loadQty = bracketMatch ? parseFloat(bracketMatch[1]) : 0;
                // Extract quantity from parentheses (station delivery in route line)
                const parenMatch = raw.match(/\(([-+]?\d*\.?\d+)\)/);
                const deliveryQty = parenMatch ? parseFloat(parenMatch[1]) : 0;

                const typed = base.match(/^([GDS])(\d+)$/i);
                if (typed) {
                    return {
                        id: `${typed[1].toUpperCase()}${parseInt(typed[2], 10)}`,
                        loadQty,
                        deliveryQty
                    };
                }

                const numeric = base.match(/^(?:N)?(\d+)$/);
                if (!numeric) return { id: null, loadQty: 0, deliveryQty: 0 };
                const n = parseInt(numeric[1], 10);

                // New convention (no prefixes): infer by markers/position.
                let nodeId;
                if (raw.includes('[')) nodeId = `D#${n}`;
                else if (raw.includes('(')) nodeId = `S#${n}`;
                else if (position === 0 || position === lastPosition) nodeId = `G#${n}`;
                else nodeId = `G#${n}`;

                return { id: nodeId, loadQty, deliveryQty };
            };

            const lastPos = routeParts.length - 1;
            for (let i = 0; i < routeParts.length - 1; i++) {
                const current = routeParts[i];
                const next = routeParts[i + 1];

                const fromInfo = extractNodeInfo(current, i, lastPos);
                const toInfo = extractNodeInfo(next, i + 1, lastPos);

                if (!fromInfo.id || !toInfo.id) {
                    throw parseError(`vehicle ${vehicleId} contains an invalid node near "${!fromInfo.id ? current : next}".`, lineNumberAt(lineIdx - 2));
                }
                if (fromInfo.id && toInfo.id) {
                    segments.push([fromInfo.id, toInfo.id]);
                    vehicleSegmentMeta.push({
                        deliveryQty: toInfo.deliveryQty || 0,
                        loadQty: toInfo.loadQty || 0,
                        productRaw: productStates[i] ?? null,
                        nextProductRaw: productStates[i + 1] ?? null
                    });
                    // Track depot load if going to a depot with a load qty
                    if (toInfo.loadQty > 0) {
                        vehicleLoads.push({
                            segmentIdx: segments.length - 1,
                            nodeId: toInfo.id,
                            quantity: toInfo.loadQty
                        });
                    }
                }
            }

            solution.routes[`V${vehicleId}`] = segments;
            solution.routeSourceLines[`V${vehicleId}`] = lineNumberAt(lineIdx - 2);
            solution.depotLoads[`V${vehicleId}`] = vehicleLoads;
            solution.productLines[`V${vehicleId}`] = productStates;
            solution.segmentMeta[`V${vehicleId}`] = vehicleSegmentMeta;

            // Skip empty line separators
            while (lineIdx < lines.length && lines[lineIdx].trim() === '') {
                lineIdx++;
            }
        } else {
            // We've reached the metrics section
            break;
        }
    }

    if (Object.keys(solution.routes).length === 0) {
        throw parseError('expected a vehicle route in the form "1: node - node".', lineNumberAt(0));
    }

    // Parse metrics (last 6 lines)
    if (lineIdx + 5 < lines.length) {
        solution.metrics = {
            vehicles_used: parseInt(lines[lineIdx]),
            product_changes: parseInt(lines[lineIdx + 1]),
            routing_cost: parseFloat(lines[lineIdx + 2]),
            total_cost: parseFloat(lines[lineIdx + 3]),
            solver: lines[lineIdx + 4],
            time: parseFloat(lines[lineIdx + 5])
        };

        solution.objective = solution.metrics.total_cost;
        solution.status = 'Solved';
    } else {
        throw parseError('expected the six metric lines after the routes.', lineNumberAt(lineIdx));
    }

    const numericMetrics = [
        ['vehicles used', solution.metrics.vehicles_used, 0],
        ['product changes', solution.metrics.product_changes, 1],
        ['routing cost', solution.metrics.routing_cost, 2],
        ['total cost', solution.metrics.total_cost, 3],
        ['solver time', solution.metrics.time, 5]
    ];
    const invalidMetric = numericMetrics.find(([, value]) => !Number.isFinite(value));
    if (invalidMetric) {
        throw parseError(`${invalidMetric[0]} must be numeric.`, lineNumberAt(lineIdx + invalidMetric[2]));
    }

    return solution;
}

function mapNodeNumber(nodeStr, numGarages, numDepots, numStations) {
    // If already typed, pass through
    const typed = String(nodeStr).match(/^([GDS])(\d+)$/i);
    if (typed) return `${typed[1].toUpperCase()}${parseInt(typed[2], 10)}`;

    // Internal marked tokens from parseDatSolution: G#12 / D#3 / S#5
    const marked = String(nodeStr).match(/^([GDS])#(\d+)$/i);
    if (marked) {
        const kind = marked[1].toUpperCase();
        const n = parseInt(marked[2], 10);

        // If n fits the natural range for the kind, use it directly (no accumulation)
        if (kind === 'G' && n <= numGarages) return `G${n}`;
        if (kind === 'D' && n <= numDepots) return `D${n}`;
        if (kind === 'S' && n <= numStations) return `S${n}`;

        // Otherwise assume legacy offset numeric and map by accumulation
        if (kind === 'G') return (n <= numGarages) ? `G${n}` : `G${Math.max(1, n)}`;
        if (kind === 'D') {
            if (n <= numGarages + numDepots) return `D${n - numGarages}`;
            return `D${Math.max(1, n - numGarages)}`;
        }
        // S
        return `S${Math.max(1, n - numGarages - numDepots)}`;
    }

    // Accept both "N123" and "123"
    const match = String(nodeStr).match(/^(?:N)?(\d+)$/);
    if (!match) return nodeStr;

    const nodeNum = parseInt(match[1], 10);

    if (nodeNum <= numGarages) {
        return `G${nodeNum}`;
    } else if (nodeNum <= numGarages + numDepots) {
        return `D${nodeNum - numGarages}`;
    } else {
        return `S${nodeNum - numGarages - numDepots}`;
    }
}

function setTextContentById(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
}

function detectProductIndexingBase(productLines, numProducts) {
    const allRaw = Object.values(productLines || {})
        .flat()
        .filter(v => Number.isInteger(v) && v >= 0);

    if (allRaw.length === 0) return 'zero';
    if (allRaw.includes(0)) return 'zero';

    const maxRaw = Math.max(...allRaw);
    if (maxRaw === numProducts) return 'one';
    if (maxRaw < numProducts) return 'zero';
    return 'one';
}

function normalizeProductIndex(rawProduct, base, numProducts) {
    if (!Number.isInteger(rawProduct) || numProducts <= 0) return null;

    if (base === 'one') {
        if (rawProduct < 1 || rawProduct > numProducts) return null;
        return rawProduct - 1;
    }

    if (rawProduct < 0 || rawProduct >= numProducts) return null;
    return rawProduct;
}

function updateFileStatus(type, filename) {
    const statusEl = document.getElementById(type + 'Status');
    const zoneEl = document.getElementById(type + 'Zone');
    statusEl.innerHTML = '<svg class="status-icon" aria-hidden="true"><use href="#icon-status-loaded"></use></svg>';
    statusEl.setAttribute('aria-label', `${type === 'instance' ? 'Instance' : 'Solution'} loaded`);
    zoneEl.classList.add('loaded');
    zoneEl.querySelector('.upload-label').textContent = filename.length > 15
        ? filename.substring(0, 12) + '...'
        : filename;
}

setupDragDrop('instanceZone', 'instanceUpload', 'instance');
setupDragDrop('solutionZone', 'solutionUpload', 'solution');

// ═══════════════════════════════════════════════════════════════
// DATA INITIALIZATION
// ═══════════════════════════════════════════════════════════════

function initData() {
    trucks = [];
    focusedTruckId = null;
    maxProgress = 0;
    progress = 0;
    isPlaying = false;
    stationDemands = {};
    stationVisits = {};
    depotWithdrawals = {};

    // Reset exchange tracking
    totalExchanges = solution.metrics?.product_changes || 0;
    currentExchanges = 0;

    // Reset product swap notification tracking
    lastProductByTruck = {};
    shownSwapNotifications = {};
    clearAllNotifications();

    // Reset station per-product tracking
    stationDemandsPerProduct = instance.stationDemandsPerProduct || {};
    stationDeliveriesPerProduct = {};

    // Initialize station deliveries for all stations
    Object.keys(instance.locations || {}).forEach(locId => {
        if (locId.startsWith('S')) {
            if (!stationDemandsPerProduct[locId]) {
                const numProds = instance.num_products || 1;
                const totalD = stationDemands[locId] || 0;
                const arr = new Array(numProds).fill(0);
                arr[0] = totalD;
                stationDemandsPerProduct[locId] = arr;
            }
            stationDeliveriesPerProduct[locId] = stationDemandsPerProduct[locId].map(() => 0);
        }
    });

    // Reset pan/zoom
    panOffset = { x: 0, y: 0 };
    zoomLevel = 1;

    updatePlayBtn();

    // Process Demands
    (instance.demands || []).forEach(d => {
        stationDemands[d.station] = (stationDemands[d.station] || 0) + d.quantity;
    });

    // Get instance dimensions for node mapping
    const numGarages = instance.num_garages || 3;
    const numDepots = instance.num_depots || 2;
    const numStations = instance.num_stations || 5;
    const hasInstanceLocations = Object.keys(instance.locations || {}).length > 0;

    // Process Routes
    Object.entries(solution.routes || {}).forEach(([id, segments], idx) => {
        if (!segments || segments.length === 0) return;

        // Convert node numbers to proper IDs
        const convertedSegments = segments.map(([from, to]) => {
            const fromId = mapNodeNumber(from, numGarages, numDepots, numStations);
            const toId = mapNodeNumber(to, numGarages, numDepots, numStations);
            if (hasInstanceLocations && !instance.locations[fromId]) {
                throw parseError(`route ${id} references unknown location ${fromId}.`, solution.routeSourceLines?.[id]);
            }
            if (hasInstanceLocations && !instance.locations[toId]) {
                throw parseError(`route ${id} references unknown location ${toId}.`, solution.routeSourceLines?.[id]);
            }
            return [fromId, toId];
        });

        trucks.push({
            id,
            color: truckColorAt(idx),
            segments: convertedSegments,
            totalDist: 0,
            visible: true
        });

        convertedSegments.forEach(([from, to]) => {
            if (to && to.startsWith('S')) {
                stationVisits[to] = (stationVisits[to] || 0) + 1;
            }
        });

        maxProgress = Math.max(maxProgress, convertedSegments.length);
    });

    // Update Stats
    const metrics = solution.metrics || {};
    setTextContentById('stat-dist', (metrics.total_cost || solution.objective || 0).toFixed(2));
    setTextContentById('stat-routing', (metrics.routing_cost || 0).toFixed(2));
    // setTextContentById('stat-exchanges', `0/${totalExchanges}`);
    setTextContentById('stat-trucks', metrics.vehicles_used || trucks.length);

    let totalSegs = trucks.reduce((sum, t) => sum + t.segments.length, 0);
    setTextContentById('stat-segments', totalSegs);
    setTextContentById('stat-status', solution.status || 'Loaded');

    // Update Fleet Legend
    renderFleetLegend();

    // Update UI State
    dataLoaded = Object.keys(instance.locations).length > 0 && trucks.length > 0;
    document.getElementById('emptyState').style.display = dataLoaded ? 'none' : 'flex';
    document.getElementById('mapOverlay').style.display = dataLoaded ? 'flex' : 'none';

    updateUI();
}

function renderFleetLegend() {
    const legendEl = document.getElementById('fleet-legend');
    legendEl.replaceChildren();

    if (trucks.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'fleet-placeholder';
        placeholder.textContent = 'Load a solution';
        legendEl.appendChild(placeholder);
        return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'fleet-toolbar';
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.textContent = 'Show all routes';
    allButton.addEventListener('click', showAllTrucks);
    toolbar.appendChild(allButton);
    legendEl.appendChild(toolbar);

    trucks.forEach(truck => {
        const item = document.createElement('div');
        item.className = `fleet-item${truck.visible ? '' : ' is-hidden'}${focusedTruckId === truck.id ? ' is-focused' : ''}`;
        item.style.setProperty('--truck-color', truck.color);

        const visibilityButton = document.createElement('button');
        visibilityButton.type = 'button';
        visibilityButton.className = 'fleet-visibility';
        visibilityButton.title = truck.visible ? `Hide ${truck.id}` : `Show ${truck.id}`;
        visibilityButton.setAttribute('aria-pressed', String(truck.visible));
        const colorSwatch = document.createElement('span');
        colorSwatch.className = 'fleet-color';
        colorSwatch.setAttribute('aria-hidden', 'true');
        const visibilityState = document.createElement('span');
        visibilityState.textContent = truck.visible ? '●' : '○';
        visibilityButton.append(colorSwatch, visibilityState);
        visibilityButton.addEventListener('click', () => toggleTruckVisibility(truck.id));

        const label = document.createElement('span');
        label.className = 'fleet-name';
        label.textContent = truck.id;

        const onlyButton = document.createElement('button');
        onlyButton.type = 'button';
        onlyButton.className = 'fleet-only';
        onlyButton.textContent = 'Only';
        onlyButton.title = `Show only ${truck.id}`;
        onlyButton.addEventListener('click', () => showOnlyTruck(truck.id));

        item.append(visibilityButton, label, onlyButton);
        legendEl.appendChild(item);
    });
}

function toggleTruckVisibility(truckId) {
    const truck = trucks.find(item => item.id === truckId);
    if (!truck) return;
    truck.visible = !truck.visible;
    if (focusedTruckId !== null) {
        focusedTruckId = null;
        resetPlaybackScope();
    }
    renderFleetLegend();
    draw();
}

function showOnlyTruck(truckId) {
    const selectedTruck = trucks.find(truck => truck.id === truckId);
    if (!selectedTruck) return;
    trucks.forEach(truck => { truck.visible = truck.id === truckId; });
    focusedTruckId = truckId;
    resetPlaybackScope();
    renderFleetLegend();
    draw();
}

function showAllTrucks() {
    trucks.forEach(truck => { truck.visible = true; });
    focusedTruckId = null;
    resetPlaybackScope();
    renderFleetLegend();
    draw();
}

function getPlaybackTrucks() {
    if (focusedTruckId === null) return trucks;
    const selectedTruck = trucks.find(truck => truck.id === focusedTruckId);
    return selectedTruck ? [selectedTruck] : [];
}

function resetPlaybackScope() {
    isPlaying = false;
    cancelAnimationFrame(animationId);
    lastTime = 0;
    progress = 0;
    maxProgress = getPlaybackTrucks().reduce(
        (longestRoute, truck) => Math.max(longestRoute, truck.segments.length),
        0
    );
    lastProductByTruck = {};
    shownSwapNotifications = {};
    clearAllNotifications();
    updatePlayBtn();
    updateUI();
}

// ═══════════════════════════════════════════════════════════════
// CANVAS & DRAWING
// ═══════════════════════════════════════════════════════════════

function resize() {
    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';

    // Reset transform before applying device-pixel scaling; otherwise it accumulates
    // and the drawing progressively shrinks/grows on each resize.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    width = container.clientWidth;
    height = container.clientHeight;

    computeCoordTransform();

    draw();
}

window.addEventListener('resize', resize);

function computeCoordTransform() {
    if (!instance.locations || Object.keys(instance.locations).length === 0 || !width || !height) {
        coordTransform = null;
        return;
    }

    // Compute tight bounds then add 30% margin on each axis (world-units) for better spacing
    const allPoints = Object.values(instance.locations);
    const allX = allPoints.map(p => p[0]);
    const allY = allPoints.map(p => p[1]);
    const rawMinX = Math.min(...allX), rawMaxX = Math.max(...allX);
    const rawMinY = Math.min(...allY), rawMaxY = Math.max(...allY);

    const rawW = rawMaxX - rawMinX;
    const rawH = rawMaxY - rawMinY;

    // Use 30% margin for better spacing, with minimum spacing of 50 units
    const marginX = Math.max(rawW > 0 ? 0.3 * rawW : 50, 50);
    const marginY = Math.max(rawH > 0 ? 0.3 * rawH : 50, 50);

    const minX = rawMinX - marginX;
    const maxX = rawMaxX + marginX;
    const minY = rawMinY - marginY;
    const maxY = rawMaxY + marginY;

    const worldW = (maxX - minX) || 1;
    const worldH = (maxY - minY) || 1;

    const scale = Math.min(width / worldW, height / worldH) * 1.5;

    // Center the drawing area
    const offsetX = (width - worldW * scale) / 2;
    const offsetY = (height - worldH * scale) / 2;

    coordTransform = { minX, minY, scale, offsetX, offsetY };
}

function getCoords(locId) {
    if (!instance.locations || !instance.locations[locId]) return { x: 0, y: 0 };

    if (!coordTransform) {
        computeCoordTransform();
    }
    if (!coordTransform) {
        return { x: 0, y: 0 };
    }

    const [x, y] = instance.locations[locId];
    const { minX, minY, scale, offsetX, offsetY } = coordTransform;

    // Apply base transform
    let screenX = offsetX + (x - minX) * scale;
    let screenY = offsetY + (y - minY) * scale;

    // Apply pan and zoom (zoom centered on canvas center)
    const centerX = width / 2;
    const centerY = height / 2;
    screenX = centerX + (screenX - centerX) * zoomLevel + panOffset.x;
    screenY = centerY + (screenY - centerY) * zoomLevel + panOffset.y;

    return { x: screenX, y: screenY };
}

function getThemeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function drawMapBackground() {
    // A lightweight, deterministic basemap keeps the visualizer self-contained
    // while giving the routes a more concrete geographical setting.
    const land = ctx.createLinearGradient(0, 0, width, height);
    land.addColorStop(0, '#eef4e5');
    land.addColorStop(0.55, '#f5f1df');
    land.addColorStop(1, '#e9f1df');
    ctx.fillStyle = land;
    ctx.fillRect(0, 0, width, height);

    // Agricultural and wooded patches.
    const terrainPatches = [
        [.12, .18, .2, .13, '#d9e9c5'], [.76, .17, .25, .15, '#d2e4bd'],
        [.22, .76, .28, .18, '#e3dcb8'], [.78, .72, .22, .18, '#d7e8c7'],
        [.48, .43, .16, .11, '#e5dfbf']
    ];
    terrainPatches.forEach(([x, y, radiusX, radiusY, color], index) => {
        ctx.save();
        ctx.translate(width * x, height * y);
        ctx.rotate((index - 2) * .18);
        ctx.beginPath();
        ctx.ellipse(0, 0, width * radiusX, height * radiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    });

    // A river and its bank, positioned away from the center of most networks.
    const riverPath = new Path2D();
    riverPath.moveTo(width * .82, -20);
    riverPath.bezierCurveTo(width * .68, height * .2, width * .92, height * .48, width * .72, height * .68);
    riverPath.bezierCurveTo(width * .62, height * .79, width * .68, height * .93, width * .58, height + 20);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(169, 205, 210, .5)';
    ctx.lineWidth = Math.max(22, width * .026);
    ctx.stroke(riverPath);
    ctx.strokeStyle = 'rgba(122, 184, 204, .72)';
    ctx.lineWidth = Math.max(13, width * .016);
    ctx.stroke(riverPath);

    // Small tree clusters provide visual scale without competing with nodes.
    const treeClusters = [[.08,.42], [.15,.47], [.89,.3], [.92,.35], [.42,.1], [.47,.12], [.33,.88], [.38,.86]];
    treeClusters.forEach(([x, y], index) => {
        const cx = width * x;
        const cy = height * y;
        for (let tree = 0; tree < 4; tree++) {
            const angle = tree * 1.7 + index;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 7, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = tree % 2 ? 'rgba(72, 122, 65, .32)' : 'rgba(104, 145, 76, .38)';
            ctx.fill();
        }
    });

    drawRoadNetwork();
}

function drawRoadNetwork() {
    const roadSegments = new Map();
    trucks.forEach(truck => {
        truck.segments.forEach(([from, to]) => {
            const key = [from, to].sort().join('|');
            if (!roadSegments.has(key)) roadSegments.set(key, [from, to]);
        });
    });

    const traceRoads = () => {
        ctx.beginPath();
        roadSegments.forEach(([from, to]) => {
            const start = getCoords(from);
            const end = getCoords(to);
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
        });
        ctx.stroke();
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(116, 111, 95, .32)';
    ctx.lineWidth = 10;
    traceRoads();
    ctx.strokeStyle = 'rgba(255, 253, 244, .94)';
    ctx.lineWidth = 7;
    traceRoads();
    ctx.strokeStyle = 'rgba(148, 139, 113, .42)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    traceRoads();
    ctx.setLineDash([]);
}

function getStationSatisfaction(stationId) {
    const demand = stationDemands[stationId] || 0;
    if (demand <= 0) return 1;

    const deliveries = stationDeliveriesPerProduct[stationId] || [];
    const totalDelivered = deliveries.reduce((sum, d) => sum + d, 0);

    return Math.min(1, totalDelivered / demand);
}

function drawNodeIcon(type, x, y) {
    const paths = NODE_ICON_PATHS[type] || NODE_ICON_PATHS.station;
    ctx.save();
    ctx.translate(x - 12, y - 12);
    ctx.strokeStyle = NODE_ICON_COLORS[type] || NODE_ICON_COLORS.station;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paths.forEach(pathData => ctx.stroke(new Path2D(pathData)));
    ctx.restore();
}

function drawNode(id, type) {
    const { x, y } = getCoords(id);

    // Glow effect
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 35);
    if (type === 'garage') {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    } else if (type === 'depot') {
        gradient.addColorStop(0, 'rgba(34, 211, 238, 0.3)');
    } else {
        gradient.addColorStop(0, 'rgba(244, 114, 182, 0.3)');
    }
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(x, y, 35, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Base circle
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = getThemeColor('--node-bg');
    ctx.fill();
    ctx.strokeStyle = getThemeColor('--border-light');
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vector icon
    drawNodeIcon(type, x, y);

    // Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 11px Inter';
    ctx.fillStyle = getThemeColor('--text');
    ctx.fillText(id, x, y + 38);

    // Demand bar for stations
    if (type === 'station') {
        const satisfaction = getStationSatisfaction(id);
        const demand = stationDemands[id] || 0;

        if (demand > 0) {
            const barWidth = 44;
            const barHeight = 6;
            const barX = x - barWidth / 2;
            const barY = y + 48;

            const deliveries = stationDeliveriesPerProduct[id] || [];
            const totalDelivered = deliveries.reduce((sum, d) => sum + d, 0);

            // Background
            ctx.fillStyle = getThemeColor('--input-bg');
            ctx.beginPath();
            ctx.roundRect(barX, barY, barWidth, barHeight, 3);
            ctx.fill();

            // Progress
            const fillColor = satisfaction >= 0.999 ? '#34d399' : '#fbbf24';
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barWidth * Math.max(0, satisfaction), barHeight, 3);
            ctx.fill();

            // Text
            ctx.font = '500 9px Inter';
            ctx.fillStyle = getThemeColor('--text-dim');
            ctx.fillText(`${Math.round(totalDelivered)}/${Math.round(demand)}`, x, barY + 16);
        }
    }
}

function drawTruck(truck, currentProgress) {
    if (truck.segments.length === 0) return;

    let activeSegmentIdx = Math.floor(currentProgress);
    let t = currentProgress - activeSegmentIdx;

    if (activeSegmentIdx >= truck.segments.length) {
        activeSegmentIdx = truck.segments.length - 1;
        t = 1;
    }

    const [startId, endId] = truck.segments[activeSegmentIdx];
    const start = getCoords(startId);
    const end = getCoords(endId);

    const curX = start.x + (end.x - start.x) * t;
    const curY = start.y + (end.y - start.y) * t;

    // Draw completed route
    ctx.strokeStyle = truck.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    ctx.beginPath();
    for (let i = 0; i < activeSegmentIdx; i++) {
        const [s, e] = truck.segments[i];
        const p1 = getCoords(s);
        const p2 = getCoords(e);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    // Draw remaining route (dashed)
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = colorWithAlpha(truck.color, 0.25);
    ctx.beginPath();
    ctx.moveTo(curX, curY);
    ctx.lineTo(end.x, end.y);
    for (let i = activeSegmentIdx + 1; i < truck.segments.length; i++) {
        const [s, e] = truck.segments[i];
        const p1 = getCoords(s);
        const p2 = getCoords(e);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw truck
    ctx.save();
    ctx.translate(curX, curY);

    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.rotate(angle);

    // Glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
    glow.addColorStop(0, colorWithAlpha(truck.color, 0.38));
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = truck.color;
    ctx.beginPath();
    ctx.roundRect(-16, -10, 26, 20, 5);
    ctx.fill();

    // Cabin
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(2, -7, 7, 14, 2);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(-9, 12, 4, 0, Math.PI * 2);
    ctx.arc(4, 12, 4, 0, Math.PI * 2);
    ctx.arc(-9, -12, 4, 0, Math.PI * 2);
    ctx.arc(4, -12, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    if (!dataLoaded) return;

    drawMapBackground();

    // Draw all routes first (background)
    trucks.filter(truck => truck.visible).forEach(truck => {
        if (truck.segments.length === 0) return;

        ctx.strokeStyle = colorWithAlpha(truck.color, focusedTruckId === truck.id ? 0.78 : 0.5);
        ctx.lineWidth = focusedTruckId === truck.id ? 4 : 2.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();

        truck.segments.forEach(([s, e]) => {
            const p1 = getCoords(s);
            const p2 = getCoords(e);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Draw nodes
    Object.keys(instance.locations).forEach(id => {
        let type = 'station';
        if (id.startsWith('G')) type = 'garage';
        if (id.startsWith('D')) type = 'depot';
        drawNode(id, type);
    });

    // Draw trucks on top
    trucks.filter(truck => truck.visible).forEach(truck => drawTruck(truck, progress));

    // Update overlay
    document.getElementById('overlayStatus').textContent =
        isPlaying ? 'Animating...' : `Step ${Math.floor(progress)} of ${maxProgress}`;
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION & CONTROLS
// ═══════════════════════════════════════════════════════════════

function animate(timestamp) {
    if (!isPlaying) return;
    if (!lastTime) lastTime = timestamp;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    progress += dt * speed;

    if (progress >= maxProgress) {
        progress = maxProgress;
        isPlaying = false;
        updatePlayBtn();
    }

    updateUI();
    draw();

    if (isPlaying) {
        animationId = requestAnimationFrame(animate);
    }
}

function togglePlay() {
    if (!dataLoaded) return;

    isPlaying = !isPlaying;
    updatePlayBtn();

    if (isPlaying) {
        lastTime = 0;
        if (progress >= maxProgress) progress = 0;
        animationId = requestAnimationFrame(animate);
    } else {
        cancelAnimationFrame(animationId);
    }
}

function updatePlayBtn() {
    const btn = document.getElementById('playBtn');
    const icon = document.getElementById('playIcon');

    if (isPlaying) {
        btn.classList.add('playing');
        icon.textContent = '⏸';
    } else {
        btn.classList.remove('playing');
        icon.textContent = '▶';
    }
}

function reset() {
    isPlaying = false;
    progress = 0;
    cancelAnimationFrame(animationId);

    // Reset product swap notification tracking
    lastProductByTruck = {};
    shownSwapNotifications = {};
    clearAllNotifications();

    updatePlayBtn();
    updateUI();
    draw();
}

function stepForward() {
    if (!dataLoaded) return;
    progress = Math.min(maxProgress, Math.floor(progress) + 1);
    updateUI();
    draw();
}

function stepBackward() {
    if (!dataLoaded) return;
    progress = Math.max(0, Math.ceil(progress) - 1);
    updateUI();
    draw();
}

function seek(val) {
    progress = parseFloat(val);
    updateUI();
    draw();
}

function setSpeed(val) {
    speed = parseFloat(val);
    document.getElementById('speedText').textContent = speed + 'x';
}

function updateUI() {
    const slider = document.getElementById('timeline');
    slider.max = maxProgress || 1;
    slider.value = progress;

    document.getElementById('progressText').textContent =
        `${Math.floor(progress)}/${maxProgress}`;

    // Calculate current exchanges and station deliveries based on progress
    calculateCurrentExchangesAndDeliveries();

    // Update exchanges display
    // document.getElementById('stat-exchanges').textContent = `${currentExchanges}/${totalExchanges}`;

    // Update depot inventory panel
    updateDepotInventoryPanel();
}

// Calculate exchanges and station deliveries based on current progress
function calculateCurrentExchangesAndDeliveries() {
    currentExchanges = 0;

    // Reset station deliveries
    Object.keys(stationDemandsPerProduct).forEach(stationId => {
        stationDeliveriesPerProduct[stationId] = stationDemandsPerProduct[stationId].map(() => 0);
    });

    const numProducts = instance.num_products || 1;
    const productLines = solution.productLines || {};
    const segmentMeta = solution.segmentMeta || {};
    const productBase = detectProductIndexingBase(productLines, numProducts);
    const playbackTrucks = getPlaybackTrucks();
    const playbackStationVisits = {};

    playbackTrucks.forEach(truck => {
        truck.segments.forEach(([, toNode]) => {
            if (toNode?.startsWith('S')) {
                playbackStationVisits[toNode] = (playbackStationVisits[toNode] || 0) + 1;
            }
        });
    });

    playbackTrucks.forEach(t => {
        const vehicleKey = t.id;
        const maxSegs = t.segments.length;
        const currentProgress = Math.min(progress, maxSegs);
        const vehicleProducts = productLines[vehicleKey] || [];
        const vehicleMeta = segmentMeta[vehicleKey] || [];

        let lastProduct = null;

        for (let i = 0; i < maxSegs; i++) {
            if (i >= currentProgress) break;

            const toNode = t.segments[i][1];
            const segMeta = vehicleMeta[i] || {};
            const fromProduct = normalizeProductIndex(
                vehicleProducts[i] ?? segMeta.productRaw,
                productBase,
                numProducts
            );
            const toProduct = normalizeProductIndex(
                vehicleProducts[i + 1] ?? segMeta.nextProductRaw,
                productBase,
                numProducts
            );
            const activeProduct = (fromProduct ?? toProduct) ?? 0;

            // Fraction of segment completed: 1 if i < Math.floor(currentProgress), else (currentProgress - i)
            const frac = (i < Math.floor(currentProgress)) ? 1 : (currentProgress - i);

            // Track station deliveries for the single active product of that segment.
            if (toNode && toNode.startsWith('S')) {
                const stationId = toNode;
                if (!stationDeliveriesPerProduct[stationId]) {
                    const numProds = instance.num_products || 1;
                    stationDeliveriesPerProduct[stationId] = new Array(numProds).fill(0);
                }
                const stationDemand = stationDemandsPerProduct[stationId] || [];
                const demandForProduct = stationDemand[activeProduct] || 0;
                const explicitDelivery = Number(segMeta.deliveryQty || 0);

                if (explicitDelivery > 0 || demandForProduct > 0) {
                    const deliveryQty = explicitDelivery > 0
                        ? explicitDelivery
                        : (demandForProduct / Math.max(1, playbackStationVisits[stationId] || 1));
                    if (stationDeliveriesPerProduct[stationId][activeProduct] !== undefined) {
                        stationDeliveriesPerProduct[stationId][activeProduct] += deliveryQty * frac;
                    } else {
                        stationDeliveriesPerProduct[stationId][0] = (stationDeliveriesPerProduct[stationId][0] || 0) + deliveryQty * frac;
                    }
                }
            }

            // Count exchanges only when product actually changes across a depot segment (for completed segments).
            if (i < Math.floor(currentProgress) && toNode && toNode.startsWith('D')) {
                if (fromProduct !== null && toProduct !== null && fromProduct !== toProduct) {
                    currentExchanges++;
                    const swapKey = `${vehicleKey}-${i}`;
                    if (!shownSwapNotifications[swapKey]) {
                        shownSwapNotifications[swapKey] = true;
                        showSwapNotification(vehicleKey, fromProduct + 1, toProduct + 1, t.color);
                    }
                }
            }

            if (activeProduct !== null) {
                lastProduct = activeProduct;
            }
        }

        // Update last product tracking for this truck
        lastProductByTruck[vehicleKey] = lastProduct;
    });

    // Cap exchanges at total (estimation may overshoot)
    if (Number.isFinite(totalExchanges) && totalExchanges > 0) {
        currentExchanges = Math.min(currentExchanges, totalExchanges);
    }
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR TOGGLE
// ═══════════════════════════════════════════════════════════════

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');

    sidebar.classList.toggle('collapsed');

    // Update toggle button position
    if (sidebar.classList.contains('collapsed')) {
        toggle.style.left = '0';
    } else {
        toggle.style.left = 'var(--sidebar-width)';
    }

    // Trigger resize after transition
    setTimeout(() => {
        resize();
    }, 300);
}

// ═══════════════════════════════════════════════════════════════
// PAN & ZOOM
// ═══════════════════════════════════════════════════════════════

canvas.addEventListener('mousedown', (e) => {
    isPanning = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Handle panning
    if (isPanning) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;

        panOffset.x += dx;
        panOffset.y += dy;

        lastMousePos = { x: e.clientX, y: e.clientY };
        draw();
        return;
    }

    // Handle tooltip for station hover
    handleNodeHover(mouseX, mouseY, e.clientX, e.clientY);
});

canvas.addEventListener('mouseup', () => {
    isPanning = false;
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', () => {
    isPanning = false;
    canvas.style.cursor = 'grab';
    hideTooltip();
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(5, zoomLevel * zoomFactor));

    // Zoom towards mouse position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = width / 2;
    const centerY = height / 2;

    // Adjust pan to zoom towards mouse
    const zoomRatio = newZoom / zoomLevel;
    panOffset.x = mouseX - (mouseX - panOffset.x - centerX) * zoomRatio - centerX;
    panOffset.y = mouseY - (mouseY - panOffset.y - centerY) * zoomRatio - centerY;

    zoomLevel = newZoom;
    draw();
}, { passive: false });

// Double-click to reset view
canvas.addEventListener('dblclick', () => {
    panOffset = { x: 0, y: 0 };
    zoomLevel = 1;
    draw();
});

// Touch support for mobile
let touchStartDist = 0;
let touchStartZoom = 1;

canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        isPanning = true;
        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        // Pinch zoom
        touchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartZoom = zoomLevel;
    }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();

    if (e.touches.length === 1 && isPanning) {
        const dx = e.touches[0].clientX - lastMousePos.x;
        const dy = e.touches[0].clientY - lastMousePos.y;

        panOffset.x += dx;
        panOffset.y += dy;

        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        draw();
    } else if (e.touches.length === 2) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        zoomLevel = Math.max(0.3, Math.min(5, touchStartZoom * (dist / touchStartDist)));
        draw();
    }
}, { passive: false });

canvas.addEventListener('touchend', () => {
    isPanning = false;
});

// ═══════════════════════════════════════════════════════════════
// DEPOT INVENTORY TRACKING
// ═══════════════════════════════════════════════════════════════

function toggleDepotPanel() {
    const panel = document.getElementById('depotInventoryPanel');
    const btn = panel.querySelector('.depot-toggle');
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
}

function updateDepotInventoryPanel() {
    const panel = document.getElementById('depotInventory');
    if (!panel) return;

    const numProducts = instance.num_products || 0;
    const depotSupplies = instance.depotSupplies || {};
    const productLines = solution.productLines || {};
    const segmentMeta = solution.segmentMeta || {};
    const productBase = detectProductIndexingBase(productLines, numProducts);

    if (Object.keys(depotSupplies).length === 0) {
        panel.innerHTML = '<div class="depot-placeholder">Load an instance</div>';
        return;
    }

    // Calculate current inventory based on progress
    // Initialize with original supplies
    const currentInventory = {};
    const depotVisitCounts = {};
    const depotWithdrawalsTotal = {};

    for (const [depotId, supplies] of Object.entries(depotSupplies)) {
        currentInventory[depotId] = [...supplies];
        depotVisitCounts[depotId] = 0;
        depotWithdrawalsTotal[depotId] = supplies.map(() => 0);
    }

    // Get instance dimensions for node mapping
    const numGarages = instance.num_garages || 1;
    const numDepots = instance.num_depots || 2;
    const numStations = instance.num_stations || 5;

    // Calculate withdrawals from depots based on solution loads and current progress
    getPlaybackTrucks().forEach(t => {
        const vehicleKey = t.id;
        const vehicleLoads = solution.depotLoads?.[vehicleKey] || [];
        const vehicleProducts = productLines[vehicleKey] || [];
        const vehicleMeta = segmentMeta[vehicleKey] || [];
        const completedSegs = Math.floor(Math.min(progress, t.segments.length));

        for (let i = 0; i < completedSegs; i++) {
            const toNode = t.segments[i][1];

            // Check if this segment ends at a depot
            if (toNode && toNode.startsWith('D')) {
                // Find the mapped depot ID
                const depotId = toNode;

                if (currentInventory[depotId]) {
                    depotVisitCounts[depotId] = (depotVisitCounts[depotId] || 0) + 1;

                    // Find the load for this segment
                    const loadInfo = vehicleLoads.find(l => l.segmentIdx === i);

                    if (loadInfo && loadInfo.quantity > 0) {
                        const segMetaInfo = vehicleMeta[i] || {};
                        const loadedProduct = normalizeProductIndex(
                            vehicleProducts[i + 1] ?? segMetaInfo.nextProductRaw,
                            productBase,
                            numProducts
                        );

                        if (loadedProduct !== null && currentInventory[depotId][loadedProduct] !== undefined) {
                            currentInventory[depotId][loadedProduct] -= loadInfo.quantity;
                            depotWithdrawalsTotal[depotId][loadedProduct] += loadInfo.quantity;
                        } else {
                            // Backward-compatible fallback for malformed/missing product lines.
                            const totalSupply = depotSupplies[depotId].reduce((a, b) => a + b, 0);
                            for (let p = 0; p < currentInventory[depotId].length; p++) {
                                const ratio = totalSupply > 0 ? depotSupplies[depotId][p] / totalSupply : 1 / Math.max(1, numProducts);
                                const withdrawal = loadInfo.quantity * ratio;
                                currentInventory[depotId][p] -= withdrawal;
                                depotWithdrawalsTotal[depotId][p] += withdrawal;
                            }
                        }
                    }
                }
            }
        }
    });

    // Build HTML
    let html = '';
    const productColors = ['#6366f1', '#22d3ee', '#f472b6', '#34d399', '#fbbf24'];

    for (const [depotId, originalSupplies] of Object.entries(depotSupplies)) {
        const visits = depotVisitCounts[depotId] || 0;
        const currentStock = currentInventory[depotId];
        const hasNegative = currentStock.some(qty => qty < 0);

        html += `<div class="depot-card ${hasNegative ? 'depot-warning' : ''}">
            <div class="depot-header">
                <span class="depot-name">${nodeIconMarkup('depot')} ${depotId}</span>
                <span class="depot-visits">${visits} visit${visits !== 1 ? 's' : ''}</span>
            </div>
            <div class="depot-products">`;

        currentStock.forEach((currentQty, idx) => {
            const color = productColors[idx % productColors.length];
            const originalQty = originalSupplies[idx];
            const isNegative = currentQty < 0;

            // Calculate percentage (can go below 0)
            const percent = originalQty > 0 ? Math.max(0, (currentQty / originalQty) * 100) : 0;

            // Format the quantity display
            const displayQty = Math.round(currentQty);
            const qtyClass = isNegative ? 'product-qty negative' : 'product-qty';

            html += `<div class="product-row ${isNegative ? 'negative' : ''}">
                <span class="product-label" style="background: ${color}20; color: ${color}">P${idx + 1}</span>
                <div class="product-bar-bg">
                    <div class="product-bar" style="width: ${percent}%; background: ${isNegative ? '#ef4444' : color}"></div>
                </div>
                <span class="${qtyClass}">${displayQty}</span>
            </div>`;
        });

        html += `</div></div>`;
    }

    panel.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// STATION TOOLTIP
// ═══════════════════════════════════════════════════════════════

function handleNodeHover(mouseX, mouseY, clientX, clientY) {
    if (!dataLoaded) return;

    const tooltip = document.getElementById('tooltip');
    let foundNode = null;
    const hitRadius = 30; // Pixel radius for hover detection

    // Check if mouse is over any node
    for (const [id, coords] of Object.entries(instance.locations)) {
        const { x, y } = getCoords(id);
        const dist = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);

        if (dist < hitRadius) {
            foundNode = id;
            break;
        }
    }

    if (foundNode) {
        hoveredNode = foundNode;
        showTooltip(foundNode, clientX, clientY);
    } else {
        hoveredNode = null;
        hideTooltip();
    }
}

function showTooltip(nodeId, clientX, clientY) {
    const tooltip = document.getElementById('tooltip');

    let content = '';
    const productColors = ['#6366f1', '#22d3ee', '#f472b6', '#34d399', '#fbbf24'];

    if (nodeId.startsWith('S')) {
        // Station tooltip - show demand fulfillment
        const demands = stationDemandsPerProduct[nodeId] || [];
        const deliveries = stationDeliveriesPerProduct[nodeId] || [];

        content = `<div class="tooltip-header">${nodeIconMarkup('station')} ${nodeId}</div>`;
        content += '<div class="tooltip-content">';

        if (demands.length > 0) {
            demands.forEach((demand, idx) => {
                const delivered = Math.round(deliveries[idx] || 0);
                const demandRounded = Math.round(demand);
                const excess = delivered - demandRounded;
                const isExcess = excess > 0;
                const isShortage = delivered < demandRounded && demand > 0;
                const color = productColors[idx % productColors.length];

                const percent = demand > 0 ? Math.min(100, (delivered / demand) * 100) : 100;

                let statusClass = '';
                let statusText = '';
                if (isExcess) {
                    statusClass = 'excess';
                    statusText = ` (+${excess})`;
                } else if (isShortage) {
                    statusClass = 'shortage';
                }

                content += `<div class="tooltip-product ${statusClass}">
                    <span class="tooltip-product-label" style="background: ${color}20; color: ${color}">P${idx + 1}</span>
                    <div class="tooltip-bar-bg">
                        <div class="tooltip-bar" style="width: ${percent}%; background: ${isExcess ? '#f59e0b' : color}"></div>
                    </div>
                    <span class="tooltip-qty ${statusClass}">${delivered}/${demandRounded}${statusText}</span>
                </div>`;
            });

            // Summary
            const totalDemand = demands.reduce((a, b) => a + b, 0);
            const totalDelivered = deliveries.reduce((a, b) => a + b, 0);
            const totalExcess = totalDelivered - totalDemand;

            content += `<div class="tooltip-summary">`;
            content += `<span>Total: ${Math.round(totalDelivered)}/${Math.round(totalDemand)}</span>`;
            if (totalExcess > 0) {
                content += `<span class="tooltip-excess-badge">+${Math.round(totalExcess)} excess</span>`;
            } else if (totalExcess < 0) {
                content += `<span class="tooltip-shortage-badge">${Math.round(totalExcess)} remaining</span>`;
            }
            content += `</div>`;
        } else {
            content += '<div class="tooltip-empty">No demand data</div>';
        }

        content += '</div>';
    } else if (nodeId.startsWith('D')) {
        // Depot tooltip
        const supplies = instance.depotSupplies?.[nodeId] || [];
        content = `<div class="tooltip-header">${nodeIconMarkup('depot')} ${nodeId}</div>`;
        content += '<div class="tooltip-content">';

        if (supplies.length > 0) {
            supplies.forEach((supply, idx) => {
                const color = productColors[idx % productColors.length];
                content += `<div class="tooltip-product">
                    <span class="tooltip-product-label" style="background: ${color}20; color: ${color}">P${idx + 1}</span>
                    <span class="tooltip-qty">${Math.round(supply)} units</span>
                </div>`;
            });
        }
        content += '</div>';
    } else if (nodeId.startsWith('G')) {
        // Garage tooltip
        content = `<div class="tooltip-header">${nodeIconMarkup('garage')} ${nodeId}</div>`;
        content += '<div class="tooltip-content"><div class="tooltip-empty">Vehicle depot</div></div>';
    }

    tooltip.innerHTML = content;
    tooltip.style.opacity = '1';

    // Position tooltip
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = clientX + 15;
    let top = clientY + 15;

    // Keep tooltip on screen
    if (left + tooltipRect.width > window.innerWidth) {
        left = clientX - tooltipRect.width - 15;
    }
    if (top + tooltipRect.height > window.innerHeight) {
        top = clientY - tooltipRect.height - 15;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.opacity = '0';
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Press 'B' to toggle sidebar
    if (e.key === 'b' || e.key === 'B') {
        if (e.target.tagName !== 'INPUT') {
            toggleSidebar();
        }
    }
    // Press 'T' to toggle theme
    if (e.key === 't' || e.key === 'T') {
        if (e.target.tagName !== 'INPUT') {
            toggleTheme();
        }
    }
    // Press Space to play/pause
    if (e.key === ' ') {
        if (e.target.tagName !== 'INPUT') {
            e.preventDefault();
            togglePlay();
        }
    }
    // Press 'R' to reset view
    if (e.key === 'r' || e.key === 'R') {
        if (e.target.tagName !== 'INPUT') {
            panOffset = { x: 0, y: 0 };
            zoomLevel = 1;
            draw();
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

resize();
updateUI();
draw();
