/**
 * Motor TypeScript para procesamiento estructurado de alertas CAP v1.2
 * Aplica contratos de tipos, enums y orientación a objetos.
 */
// Tipos y Enums estrictos de la especificación CAP
export var CapUrgency;
(function (CapUrgency) {
    CapUrgency["Immediate"] = "Immediate";
    CapUrgency["Expected"] = "Expected";
    CapUrgency["Future"] = "Future";
    CapUrgency["Past"] = "Past";
    CapUrgency["Unknown"] = "Unknown";
})(CapUrgency || (CapUrgency = {}));
export var CapSeverity;
(function (CapSeverity) {
    CapSeverity["Extreme"] = "Extreme";
    CapSeverity["Severe"] = "Severe";
    CapSeverity["Moderate"] = "Moderate";
    CapSeverity["Minor"] = "Minor";
    CapSeverity["Unknown"] = "Unknown";
})(CapSeverity || (CapSeverity = {}));
export var CapCertainty;
(function (CapCertainty) {
    CapCertainty["Observed"] = "Observed";
    CapCertainty["Likely"] = "Likely";
    CapCertainty["Possible"] = "Possible";
    CapCertainty["Unlikely"] = "Unlikely";
    CapCertainty["Unknown"] = "Unknown";
})(CapCertainty || (CapCertainty = {}));
export class CapEngineTS {
    userCoord;
    constructor(userLat, userLon) {
        this.userCoord = { lat: userLat, lon: userLon };
    }
    /**
     * Actualiza las coordenadas del usuario
     */
    setUserLocation(lat, lon) {
        this.userCoord = { lat, lon };
    }
    /**
     * Algoritmo Ray-Casting tipado
     */
    isPointInPolygon(polygonStr) {
        if (!polygonStr)
            return false;
        const points = polygonStr
            .trim()
            .split(/\s+/)
            .map((pair) => {
            const [latStr, lonStr] = pair.split(',');
            return {
                lat: parseFloat(latStr),
                lon: parseFloat(lonStr)
            };
        })
            .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
        if (points.length < 3)
            return false;
        let inside = false;
        const { lat, lon } = this.userCoord;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].lat, yi = points[i].lon;
            const xj = points[j].lat, yj = points[j].lon;
            const intersect = yi > lon !== yj > lon &&
                lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    /**
     * Calcula el índice de criticidad operacional (1 a 10)
     */
    calculateCriticality(severity, urgency, certainty) {
        let score = 0;
        switch (severity) {
            case CapSeverity.Extreme:
                score += 4;
                break;
            case CapSeverity.Severe:
                score += 3;
                break;
            case CapSeverity.Moderate:
                score += 2;
                break;
            default:
                score += 1;
                break;
        }
        switch (urgency) {
            case CapUrgency.Immediate:
                score += 3;
                break;
            case CapUrgency.Expected:
                score += 2;
                break;
            default:
                score += 1;
                break;
        }
        switch (certainty) {
            case CapCertainty.Observed:
                score += 3;
                break;
            case CapCertainty.Likely:
                score += 2;
                break;
            default:
                score += 1;
                break;
        }
        return Math.min(score, 10);
    }
    /**
     * Procesa la cadena XML y devuelve la lista de alertas normalizadas
     */
    process(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "application/xml");
        const alertNodes = Array.from(doc.getElementsByTagName("alert"));
        return alertNodes
            .map((alertNode) => {
            const id = alertNode.getElementsByTagName("identifier")[0]?.textContent || "N/A";
            const infoNode = alertNode.getElementsByTagName("info")[0];
            if (!infoNode)
                return null;
            const event = infoNode.getElementsByTagName("event")[0]?.textContent || "Sin evento";
            const severity = infoNode.getElementsByTagName("severity")[0]?.textContent || CapSeverity.Unknown;
            const urgency = infoNode.getElementsByTagName("urgency")[0]?.textContent || CapUrgency.Unknown;
            const certainty = infoNode.getElementsByTagName("certainty")[0]?.textContent || CapCertainty.Unknown;
            const areaDesc = infoNode.getElementsByTagName("areaDesc")[0]?.textContent || "Sin descripción";
            const polygonStr = infoNode.getElementsByTagName("polygon")[0]?.textContent || "";
            const affectsUser = this.isPointInPolygon(polygonStr);
            const criticalityScore = this.calculateCriticality(severity, urgency, certainty);
            return {
                id,
                event,
                severity,
                urgency,
                certainty,
                areaDesc,
                affectsUser,
                criticalityScore
            };
        })
            .filter((alert) => alert !== null);
    }
}
