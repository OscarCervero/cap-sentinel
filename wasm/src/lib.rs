use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use quick_xml::events::Event;
use quick_xml::reader::Reader;

#[derive(Serialize, Deserialize)]
pub struct ProcessedAlert {
    pub id: String,
    pub event: String,
    pub severity: String,
    pub urgency: String,
    pub certainty: String,
    pub area_desc: String,
    pub affects_user: bool,
    pub criticality_score: u8,
}

struct Point {
    lat: f64,
    lon: f64,
}

fn point_in_polygon(lat: f64, lon: f64, polygon_str: &str) -> bool {
    let points: Vec<Point> = polygon_str
        .split_whitespace()
        .filter_map(|pair| {
            let mut parts = pair.split(',');
            match (parts.next(), parts.next()) {
                (Some(lat_s), Some(lon_s)) => {
                    if let (Ok(p_lat), Ok(p_lon)) = (lat_s.parse::<f64>(), lon_s.parse::<f64>()) {
                        Some(Point { lat: p_lat, lon: p_lon })
                    } else {
                        None
                    }
                }
                _ => None,
            }
        })
        .collect();

    if points.len() < 3 {
        return false;
    }

    let mut inside = false;
    let mut j = points.len() - 1;

    for i in 0..points.len() {
        let (xi, yi) = (points[i].lat, points[i].lon);
        let (xj, yj) = (points[j].lat, points[j].lon);

        let intersect = ((yi > lon) != (yj > lon))
            && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);

        if intersect {
            inside = !inside;
        }
        j = i;
    }

    inside
}

fn calculate_criticality(severity: &str, urgency: &str, certainty: &str) -> u8 {
    let mut score = 0u8;

    score += match severity {
        "Extreme" => 4,
        "Severe" => 3,
        "Moderate" => 2,
        _ => 1,
    };

    score += match urgency {
        "Immediate" => 3,
        "Expected" => 2,
        _ => 1,
    };

    score += match certainty {
        "Observed" => 3,
        "Likely" => 2,
        _ => 1,
    };

    score.min(10)
}

#[wasm_bindgen]
pub fn process_cap_wasm(xml_content: &str, user_lat: f64, user_lon: f64) -> Result<JsValue, JsValue> {
    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text(true);

    let mut alerts = Vec::new();
    let mut buf = Vec::new();

    let mut in_alert = false;
    let mut current_tag = String::new();

    let mut id = String::new();
    let mut event = String::new();
    let mut severity = String::new();
    let mut urgency = String::new();
    let mut certainty = String::new();
    let mut area_desc = String::new();
    let mut polygon_str = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let local_name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                if local_name == "alert" {
                    in_alert = true;
                    id.clear();
                    event.clear();
                    severity.clear();
                    urgency.clear();
                    certainty.clear();
                    area_desc.clear();
                    polygon_str.clear();
                }
                current_tag = local_name;
            }
            Ok(Event::Text(e)) => {
                if in_alert {
                    let txt = e.unescape().unwrap_or_default().to_string();
                    match current_tag.as_str() {
                        "identifier" if id.is_empty() => id = txt,
                        "event" if event.is_empty() => event = txt,
                        "severity" if severity.is_empty() => severity = txt,
                        "urgency" if urgency.is_empty() => urgency = txt,
                        "certainty" if certainty.is_empty() => certainty = txt,
                        "areaDesc" if area_desc.is_empty() => area_desc = txt,
                        "polygon" if polygon_str.is_empty() => polygon_str = txt,
                        _ => {}
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let local_name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                if local_name == "alert" && in_alert {
                    let affects_user = point_in_polygon(user_lat, user_lon, &polygon_str);
                    let score = calculate_criticality(&severity, &urgency, &certainty);

                    alerts.push(ProcessedAlert {
                        id: if id.is_empty() { "N/A".into() } else { id.clone() },
                        event: if event.is_empty() { "Sin evento".into() } else { event.clone() },
                        severity: severity.clone(),
                        urgency: urgency.clone(),
                        certainty: certainty.clone(),
                        area_desc: if area_desc.is_empty() { "Sin descripción".into() } else { area_desc.clone() },
                        affects_user,
                        criticality_score: score,
                    });
                    in_alert = false;
                }
                current_tag.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(JsValue::from_str(&format!("Error XML: {:?}", e))),
            _ => {}
        }
        buf.clear();
    }

    serde_wasm_bindgen::to_value(&alerts)
        .map_err(|e| JsValue::from_str(&format!("Error serialización: {:?}", e)))
}