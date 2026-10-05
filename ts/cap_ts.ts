/**
 * Motor TypeScript para procesamiento estructurado de alertas CAP v1.2
 * Aplica contratos de tipos, enums y orientación a objetos.
 */

// Tipos y Enums estrictos de la especificación CAP
export enum CapUrgency {
  Immediate = "Immediate",
  Expected = "Expected",
  Future = "Future",
  Past = "Past",
  Unknown = "Unknown"
}

export enum CapSeverity {
  Extreme = "Extreme",
  Severe = "Severe",
  Moderate = "Moderate",
  Minor = "Minor",
  Unknown = "Unknown"
}

export enum CapCertainty {
  Observed = "Observed",
  Likely = "Likely",
  Possible = "Possible",
  Unlikely = "Unlikely",
  Unknown = "Unknown"
}

export interface Point2D {
  lat: number;
  lon: number;
}

export interface ProcessedAlert {
  id: string;
  event: string;
  severity: CapSeverity;
  urgency: CapUrgency;
  certainty: CapCertainty;
  areaDesc: string;
  affectsUser: boolean;
  criticalityScore: number;
}

export class CapEngineTS {
  private userCoord: Point2D;

  constructor(userLat: number, userLon: number) {
    this.userCoord = { lat: userLat, lon: userLon };
  }

  /**
   * Actualiza las coordenadas del usuario
   */
  public setUserLocation(lat: number, lon: number): void {
    this.userCoord = { lat, lon };
  }

  /**
   * Algoritmo Ray-Casting tipado
   */
  private isPointInPolygon(polygonStr: string): boolean {
    if (!polygonStr) return false;

    const points: Point2D[] = polygonStr
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

    if (points.length < 3) return false;

    let inside = false;
    const { lat, lon } = this.userCoord;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lat, yi = points[i].lon;
      const xj = points[j].lat, yj = points[j].lon;

      const intersect =
        yi > lon !== yj > lon &&
        lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Calcula el índice de criticidad operacional (1 a 10)
   */
  private calculateCriticality(
    severity: CapSeverity,
    urgency: CapUrgency,
    certainty: CapCertainty
  ): number {
    let score = 0;

    switch (severity) {
      case CapSeverity.Extreme: score += 4; break;
      case CapSeverity.Severe: score += 3; break;
      case CapSeverity.Moderate: score += 2; break;
      default: score += 1; break;
    }

    switch (urgency) {
      case CapUrgency.Immediate: score += 3; break;
      case CapUrgency.Expected: score += 2; break;
      default: score += 1; break;
    }

    switch (certainty) {
      case CapCertainty.Observed: score += 3; break;
      case CapCertainty.Likely: score += 2; break;
      default: score += 1; break;
    }

    return Math.min(score, 10);
  }

  /**
   * Procesa la cadena XML y devuelve la lista de alertas normalizadas
   */
  public process(xmlString: string): ProcessedAlert[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const alertNodes = Array.from(doc.getElementsByTagName("alert"));

    return alertNodes
      .map((alertNode): ProcessedAlert | null => {
        const id = alertNode.getElementsByTagName("identifier")[0]?.textContent || "N/A";
        const infoNode = alertNode.getElementsByTagName("info")[0];

        if (!infoNode) return null;

        const event = infoNode.getElementsByTagName("event")[0]?.textContent || "Sin evento";
        const severity = (infoNode.getElementsByTagName("severity")[0]?.textContent as CapSeverity) || CapSeverity.Unknown;
        const urgency = (infoNode.getElementsByTagName("urgency")[0]?.textContent as CapUrgency) || CapUrgency.Unknown;
        const certainty = (infoNode.getElementsByTagName("certainty")[0]?.textContent as CapCertainty) || CapCertainty.Unknown;
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
      .filter((alert): alert is ProcessedAlert => alert !== null);
  }
}