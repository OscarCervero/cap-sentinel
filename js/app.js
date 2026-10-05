import { processCapJS } from './cap_js.js';
import { CapEngineTS } from '../ts/dist/cap_ts.js';
import initWasm, { process_cap_wasm } from '../wasm_pkg/cap_wasm.js';

// Estado global de la aplicación
let wasmReady = false;
let currentXmlContent = "";

// Carga e inicialización del binario WebAssembly
initWasm()
  .then(() => {
    wasmReady = true;
  })
  .catch((err) => console.error("Error al inicializar el binario WASM:", err));

// Referencias del DOM sin usar IDs ni clases (selectores semánticos y de atributos)
const fileInput = document.querySelector('input[type="file"]');
const btnLoadSample = document.querySelector('button[name="load-sample"]');
const btnGps = document.querySelector('button[name="btn-gps"]');
const inputLat = document.querySelector('input[name="latitude"]');
const inputLon = document.querySelector('input[name="longitude"]');

const btnRunJS = document.querySelector('button[name="run-js"]');
const btnRunTS = document.querySelector('button[name="run-ts"]');
const btnRunWASM = document.querySelector('button[name="run-wasm"]');
const btnRunAll = document.querySelector('button[name="run-all"]');

const outputStats = document.querySelector('output');
const tbodyResults = document.querySelector('tbody');
const mapContainer = document.querySelector('figure');

// Inicialización del mapa Leaflet sobre el contenedor semántico <figure>
const map = L.map(mapContainer).setView([40.4168, -3.7038], 6);

// Capa base de teselas de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
}).addTo(map);

// Grupo de capas para añadir/limpiar marcadores y polígonos dinámicamente
const alertsLayerGroup = L.layerGroup().addTo(map);

/**
 * Obtiene las coordenadas ingresadas en el formulario
 */
function getCoords() {
  return {
    lat: parseFloat(inputLat.value) || 0,
    lon: parseFloat(inputLon.value) || 0
  };
}

/**
 * Extrae los vértices geométricos de las alertas CAP XML
 * Soporta etiquetas con o sin prefijo de namespace (polygon o cap:polygon)
 */
function extractPolygons(xmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "application/xml");
  const alerts = Array.from(doc.getElementsByTagName("alert"));

  return alerts.map((a) => {
    const id = a.getElementsByTagName("identifier")[0]?.textContent?.trim() || "Alerta";
    
    // Buscar polygon estándar o con prefijo
    const polyNode = a.getElementsByTagName("polygon")[0] || a.getElementsByTagName("cap:polygon")[0];
    const polyText = polyNode?.textContent?.trim() || "";

    if (!polyText) return { id, points: [] };

    const points = polyText
      .split(/\s+/)
      .map((pair) => {
        const [lat, lon] = pair.split(',').map(Number);
        return { lat, lon };
      })
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));

    return { id, points };
  });
}

/**
 * Renderiza el mapa interactivo con OpenStreetMap y Leaflet
 */
function renderMap(alertsData, userCoord) {
  alertsLayerGroup.clearLayers();

  if (!currentXmlContent) return;

  const polygons = extractPolygons(currentXmlContent);
  const bounds = [];

  // 1. Trazado de las zonas poligonales de las alertas
  polygons.forEach((poly, idx) => {
    if (poly.points.length < 3) return;

    const alertInfo = alertsData ? alertsData[idx] : null;
    const isAffecting = alertInfo ? (alertInfo.affectsUser || alertInfo.affects_user) : false;

    // Leaflet utiliza coordenadas [latitud, longitud]
    const latLngs = poly.points.map((pt) => [pt.lat, pt.lon]);
    bounds.push(...latLngs);

    const polygonColor = isAffecting ? '#ef4444' : '#22c55e';

    const polygonLayer = L.polygon(latLngs, {
      color: polygonColor,
      fillColor: polygonColor,
      fillOpacity: isAffecting ? 0.45 : 0.25,
      weight: 2
    }).addTo(alertsLayerGroup);

    polygonLayer.bindPopup(`
      <strong>${poly.id}</strong><br>
      Estado: ${isAffecting ? '⚠️ <span style="color:#ef4444;font-weight:bold;">Afecta a tu posición</span>' : '<span style="color:#15803d;">Zona distante</span>'}
    `);
  });

  // 2. Marcador de posición del usuario (Pin azul circular con halo)
  if (userCoord && !isNaN(userCoord.lat) && !isNaN(userCoord.lon)) {
    const userLatLng = [userCoord.lat, userCoord.lon];
    bounds.push(userLatLng);

    // Halo exterior
    L.circleMarker(userLatLng, {
      radius: 12,
      fillColor: '#0284c7',
      color: 'transparent',
      fillOpacity: 0.25
    }).addTo(alertsLayerGroup);

    // Núcleo del marcador
    L.circleMarker(userLatLng, {
      radius: 6,
      fillColor: '#0284c7',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    }).addTo(alertsLayerGroup).bindPopup('📍 <strong>Tu ubicación actual</strong>');
  }

  // 3. Auto-encuadre: centra y ajusta el nivel de zoom a las alertas y coordenadas
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  // Asegura el cálculo correcto de dimensiones tras manipular capas
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

/**
 * Rellena la tabla semántica con los incidentes computados
 */
function renderResults(alerts) {
  tbodyResults.innerHTML = '';
  if (!alerts || alerts.length === 0) {
    tbodyResults.innerHTML = '<tr><td colspan="7">No se encontraron alertas</td></tr>';
    return;
  }

  alerts.forEach((a) => {
    const isAffected = a.affectsUser !== undefined ? a.affectsUser : a.affects_user;
    const score = a.criticalityScore !== undefined ? a.criticalityScore : a.criticality_score;
    const area = a.areaDesc || a.area_desc;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${a.id}</td>
      <td>${a.event}</td>
      <td>${a.severity}</td>
      <td>${a.urgency}</td>
      <td>${area}</td>
      <td data-danger="${isAffected}">${isAffected ? '⚠ SÍ' : 'NO'}</td>
      <td><strong>${score}/10</strong></td>
    `;
    tbodyResults.appendChild(row);
  });
}

/**
 * Ejecuta el motor recibido por parámetro y refresca vista y mapa
 */
function processAndRefresh(engineRunner) {
  if (!currentXmlContent) {
    alert("Carga un archivo XML primero.");
    return null;
  }
  const coords = getCoords();
  const t0 = performance.now();
  const results = engineRunner(coords);
  const t1 = performance.now();

  renderResults(results);
  renderMap(results, coords);

  return { time: t1 - t0, count: results.length };
}

// ---------------- Listeners de Eventos ----------------

// 1. Cargar archivo de ejemplo
btnLoadSample.addEventListener('click', async () => {
  try {
    const res = await fetch('./data/alerts-sample.xml');
    currentXmlContent = await res.text();
    outputStats.innerHTML = `<p><strong>Muestra cargada:</strong> ${currentXmlContent.length} bytes listos.</p>`;
    const out = processAndRefresh((coords) => processCapJS(currentXmlContent, coords.lat, coords.lon));
    if (out) {
      outputStats.innerHTML += `<p>Procesadas ${out.count} alertas en ${out.time.toFixed(3)} ms.</p>`;
    }
  } catch (err) {
    alert("Para cargar archivos con fetch es necesario abrir la carpeta con un servidor local (Live Server o npx serve).");
  }
});

// 2. Cargar archivo local mediante el input
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    currentXmlContent = evt.target.result;
    outputStats.innerHTML = `<p><strong>Archivo cargado:</strong> ${file.name} (${currentXmlContent.length} bytes).</p>`;
    processAndRefresh((coords) => processCapJS(currentXmlContent, coords.lat, coords.lon));
  };
  reader.readAsText(file);
});

// 3. Geolocalización real por GPS
if (btnGps) {
  btnGps.addEventListener('click', () => {
    if (!navigator.geolocation) {
      return alert("Tu navegador no soporta la API de geolocalización.");
    }
    const options = {
      enableHighAccuracy: true, 
      timeout: 10000,
      maximumAge: 0          
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        inputLat.value = pos.coords.latitude.toFixed(4);
        inputLon.value = pos.coords.longitude.toFixed(4);
        if (currentXmlContent) {
          processAndRefresh((coords) => processCapJS(currentXmlContent, coords.lat, coords.lon));
        }
      },
      (err) => alert("No se pudo obtener la posición GPS: " + err.message),
      options
    );
  });
}

// 4. Ejecución del motor nativo JavaScript
btnRunJS.addEventListener('click', () => {
  const out = processAndRefresh((coords) => processCapJS(currentXmlContent, coords.lat, coords.lon));
  if (out) {
    outputStats.innerHTML = `<p><strong>Motor JavaScript:</strong> ${out.time.toFixed(3)} ms (${out.count} alertas).</p>`;
  }
});

// 5. Ejecución del motor TypeScript
btnRunTS.addEventListener('click', () => {
  const out = processAndRefresh((coords) => {
    const engine = new CapEngineTS(coords.lat, coords.lon);
    return engine.process(currentXmlContent);
  });
  if (out) {
    outputStats.innerHTML = `<p><strong>Motor TypeScript:</strong> ${out.time.toFixed(3)} ms (${out.count} alertas).</p>`;
  }
});

// 6. Ejecución del motor WebAssembly (Rust)
btnRunWASM.addEventListener('click', () => {
  if (!wasmReady) return alert("El módulo WebAssembly se está cargando...");
  const out = processAndRefresh((coords) => process_cap_wasm(currentXmlContent, coords.lat, coords.lon));
  if (out) {
    outputStats.innerHTML = `<p><strong>Motor Rust/WASM:</strong> ${out.time.toFixed(3)} ms (${out.count} alertas).</p>`;
  }
});

// 7. Comparativa de rendimiento (Benchmark x100 iteraciones)
btnRunAll.addEventListener('click', () => {
  if (!currentXmlContent) return alert("Carga un archivo XML primero.");
  if (!wasmReady) return alert("El módulo WebAssembly se está cargando...");

  const { lat, lon } = getCoords();
  const iterations = 100;

  // JavaScript
  let t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    processCapJS(currentXmlContent, lat, lon);
  }
  const timeJS = performance.now() - t0;

  // TypeScript
  t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const engine = new CapEngineTS(lat, lon);
    engine.process(currentXmlContent);
  }
  const timeTS = performance.now() - t0;

  // WebAssembly (Rust)
  t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    process_cap_wasm(currentXmlContent, lat, lon);
  }
  const timeWASM = performance.now() - t0;

  const latestResults = process_cap_wasm(currentXmlContent, lat, lon);
  renderResults(latestResults);
  renderMap(latestResults, { lat, lon });

  outputStats.innerHTML = `
    <p><strong>Resultados del Benchmark (${iterations} iteraciones completas):</strong></p>
    <p>JavaScript: <strong>${timeJS.toFixed(2)} ms</strong> (media: ${(timeJS / iterations).toFixed(3)} ms/ejecución)</p>
    <p>TypeScript: <strong>${timeTS.toFixed(2)} ms</strong> (media: ${(timeTS / iterations).toFixed(3)} ms/ejecución)</p>
    <p>WebAssembly (Rust): <strong>${timeWASM.toFixed(2)} ms</strong> (media: ${(timeWASM / iterations).toFixed(3)} ms/ejecución)</p>
  `;
});