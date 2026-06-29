import type { Airport } from "@/types/game";

export const airports: Airport[] = [
  { id: "lhr", iata: "LHR", icao: "EGLL", name: "Heathrow Airport", city: "London", country: "United Kingdom", lat: 51.47, lng: -0.4543, sizeTier: "mega", baseDemandScore: 98 },
  { id: "lgw", iata: "LGW", icao: "EGKK", name: "Gatwick Airport", city: "London", country: "United Kingdom", lat: 51.1537, lng: -0.1821, sizeTier: "large", baseDemandScore: 82 },
  { id: "man", iata: "MAN", icao: "EGCC", name: "Manchester Airport", city: "Manchester", country: "United Kingdom", lat: 53.365, lng: -2.2728, sizeTier: "large", baseDemandScore: 72 },
  { id: "edi", iata: "EDI", icao: "EGPH", name: "Edinburgh Airport", city: "Edinburgh", country: "United Kingdom", lat: 55.95, lng: -3.3725, sizeTier: "large", baseDemandScore: 62 },
  { id: "cdg", iata: "CDG", icao: "LFPG", name: "Charles de Gaulle Airport", city: "Paris", country: "France", lat: 49.0097, lng: 2.5479, sizeTier: "mega", baseDemandScore: 94 },
  { id: "ams", iata: "AMS", icao: "EHAM", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands", lat: 52.3105, lng: 4.7683, sizeTier: "mega", baseDemandScore: 92 },
  { id: "fra", iata: "FRA", icao: "EDDF", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", lat: 50.0379, lng: 8.5622, sizeTier: "mega", baseDemandScore: 91 },
  { id: "mad", iata: "MAD", icao: "LEMD", name: "Adolfo Suarez Madrid-Barajas Airport", city: "Madrid", country: "Spain", lat: 40.4983, lng: -3.5676, sizeTier: "mega", baseDemandScore: 86 },
  { id: "bcn", iata: "BCN", icao: "LEBL", name: "Josep Tarradellas Barcelona-El Prat Airport", city: "Barcelona", country: "Spain", lat: 41.2974, lng: 2.0833, sizeTier: "large", baseDemandScore: 81 },
  { id: "fco", iata: "FCO", icao: "LIRF", name: "Leonardo da Vinci-Fiumicino Airport", city: "Rome", country: "Italy", lat: 41.8003, lng: 12.2389, sizeTier: "large", baseDemandScore: 78 },
  { id: "zrh", iata: "ZRH", icao: "LSZH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", lat: 47.4581, lng: 8.5555, sizeTier: "large", baseDemandScore: 76 },
  { id: "ist", iata: "IST", icao: "LTFM", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", lat: 41.2753, lng: 28.7519, sizeTier: "mega", baseDemandScore: 90 },
  { id: "dxb", iata: "DXB", icao: "OMDB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", lat: 25.2532, lng: 55.3657, sizeTier: "mega", baseDemandScore: 96 },
  { id: "doh", iata: "DOH", icao: "OTHH", name: "Hamad International Airport", city: "Doha", country: "Qatar", lat: 25.2731, lng: 51.6081, sizeTier: "mega", baseDemandScore: 84 },
  { id: "jfk", iata: "JFK", icao: "KJFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States", lat: 40.6413, lng: -73.7781, sizeTier: "mega", baseDemandScore: 95 },
  { id: "lax", iata: "LAX", icao: "KLAX", name: "Los Angeles International Airport", city: "Los Angeles", country: "United States", lat: 33.9416, lng: -118.4085, sizeTier: "mega", baseDemandScore: 94 },
  { id: "ord", iata: "ORD", icao: "KORD", name: "O'Hare International Airport", city: "Chicago", country: "United States", lat: 41.9742, lng: -87.9073, sizeTier: "mega", baseDemandScore: 88 },
  { id: "atl", iata: "ATL", icao: "KATL", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", country: "United States", lat: 33.6407, lng: -84.4277, sizeTier: "mega", baseDemandScore: 89 },
  { id: "sin", iata: "SIN", icao: "WSSS", name: "Singapore Changi Airport", city: "Singapore", country: "Singapore", lat: 1.3644, lng: 103.9915, sizeTier: "mega", baseDemandScore: 93 },
  { id: "hkg", iata: "HKG", icao: "VHHH", name: "Hong Kong International Airport", city: "Hong Kong", country: "Hong Kong", lat: 22.308, lng: 113.9185, sizeTier: "mega", baseDemandScore: 90 },
  { id: "hnd", iata: "HND", icao: "RJTT", name: "Tokyo Haneda Airport", city: "Tokyo", country: "Japan", lat: 35.5494, lng: 139.7798, sizeTier: "mega", baseDemandScore: 95 },
  { id: "nrt", iata: "NRT", icao: "RJAA", name: "Narita International Airport", city: "Tokyo", country: "Japan", lat: 35.772, lng: 140.3929, sizeTier: "mega", baseDemandScore: 84 },
  { id: "icn", iata: "ICN", icao: "RKSI", name: "Incheon International Airport", city: "Seoul", country: "South Korea", lat: 37.4602, lng: 126.4407, sizeTier: "mega", baseDemandScore: 88 },
  { id: "bkk", iata: "BKK", icao: "VTBS", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand", lat: 13.69, lng: 100.7501, sizeTier: "mega", baseDemandScore: 85 },
  { id: "syd", iata: "SYD", icao: "YSSY", name: "Sydney Kingsford Smith Airport", city: "Sydney", country: "Australia", lat: -33.9399, lng: 151.1753, sizeTier: "large", baseDemandScore: 83 },
  { id: "mel", iata: "MEL", icao: "YMML", name: "Melbourne Airport", city: "Melbourne", country: "Australia", lat: -37.669, lng: 144.841, sizeTier: "large", baseDemandScore: 78 },
  { id: "yyz", iata: "YYZ", icao: "CYYZ", name: "Toronto Pearson International Airport", city: "Toronto", country: "Canada", lat: 43.6777, lng: -79.6248, sizeTier: "mega", baseDemandScore: 82 },
  { id: "gru", iata: "GRU", icao: "SBGR", name: "Sao Paulo-Guarulhos International Airport", city: "Sao Paulo", country: "Brazil", lat: -23.4356, lng: -46.4731, sizeTier: "mega", baseDemandScore: 80 },
  { id: "jnb", iata: "JNB", icao: "FAOR", name: "O. R. Tambo International Airport", city: "Johannesburg", country: "South Africa", lat: -26.1337, lng: 28.242, sizeTier: "large", baseDemandScore: 75 },
  { id: "cpt", iata: "CPT", icao: "FACT", name: "Cape Town International Airport", city: "Cape Town", country: "South Africa", lat: -33.9715, lng: 18.6021, sizeTier: "large", baseDemandScore: 66 }
];

export const airportsById = Object.fromEntries(airports.map((airport) => [airport.id, airport]));
