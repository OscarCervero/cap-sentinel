/**
 * Motor JavaScript nativo para procesamiento de alertas CAP
 */

// Algoritmo Ray-Casting (Point in Polygon)
function isPointInPolygon(lat, lon, polygonStr) {
  if (!polygonStr) return false;
  
  const points = polygonStr.trim().split(/\s+/).map(pair => {
    const [pLat, pLon] = pair.split(',').map(Number);
    return { lat: pLat, lon: pLon };
  });

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].lat, yi = points[i].lon;
    const xj = points[j].lat, yj = points[j].lon;

    const intersect = ((yi > lon) !== (yj > lon)) &&
      (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function processCapJS(xmlString, userLat, userLon) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const alertElements = Array.from(doc.getElementsByTagName("alert"));

  return alertElements.map(alert => {
    const id = alert.getElementsByTagName("identifier")[0]?.textContent || "N/A";
    const info = alert.getElementsByTagName("info")[0];
    
    if (!info) return null;

    const event = info.getElementsByTagName("event")[0]?.textContent || "Sin evento";
    const urgency = info.getElementsByTagName("urgency")[0]?.textContent || "Unknown";
    const severity = info.getElementsByTagName("severity")[0]?.textContent || "Unknown";
    const certainty = info.getElementsByTagName("certainty")[0]?.textContent || "Unknown";
    const areaDesc = info.getElementsByTagName("areaDesc")[0]?.textContent || "Sin descripción";
    const polygon = info.getElementsByTagName("polygon")[0]?.textContent || "";

    const affectsUser = isPointInPolygon(userLat, userLon, polygon);

    // Cálculo de criticidad heurística (1 a 10)
    let score = 0;
    if (severity === "Extreme") score += 4;
    else if (severity === "Severe") score += 3;
    else if (severity === "Moderate") score += 2;

    if (urgency === "Immediate") score += 3;
    else if (urgency === "Expected") score += 2;

    if (certainty === "Observed") score += 3;
    else if (certainty === "Likely") score += 2;

    return {
      id,
      event,
      severity,
      urgency,
      areaDesc,
      affectsUser,
      criticalityScore: score
    };
  }).filter(Boolean);
}