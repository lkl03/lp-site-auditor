// ── US States + special regions ──────────────────────────────────────────────
export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming", "Washington D.C.",
];

export const STATE_OR_REGION_OPTIONS = [
  ...US_STATES,
  "Canada",
  "Worldwide",
];

// ── Brokerages ────────────────────────────────────────────────────────────────
export const BROKERAGES = [
  "Compass",
  "Coldwell Banker",
  "Sotheby's International Realty",
  "Douglas Elliman",
  "eXp Realty",
  "SERHANT.",
  "The Agency",
  "Corcoran",
  "Keller Williams",
  "Berkshire Hathaway HomeServices",
  "Other",
] as const;

export type BrokerageName = (typeof BROKERAGES)[number];

// ── MLS per state/region ──────────────────────────────────────────────────────
// TODO: Expand this mapping with authoritative MLS data from each state board.
// Current data is a seed of well-known, high-volume MLSs per market.
// Sources: state Realtor associations, NAR MLS database.
// When Coda compliance doc is updated, cross-reference and add new MLSs here.
export const STATE_MLS_MAP: Record<string, string[]> = {
  "Alabama": ["Alabama MLS (ValleyMLS)", "Other"],
  "Alaska": ["Alaska MLS", "Other"],
  "Arizona": ["ARMLS", "Arizona Regional MLS", "Tucson Association of Realtors MLS", "Other"],
  "Arkansas": ["CARMLS", "Other"],
  "California": [
    "CRMLS (California Regional MLS)",
    "SFAR (San Francisco Association of Realtors MLS)",
    "Bareis MLS",
    "MetroList MLS",
    "CARETS",
    "MLSListings",
    "Other",
  ],
  "Colorado": ["REColorado", "IRES MLS", "Pikes Peak MLS", "Other"],
  "Connecticut": ["SmartMLS", "Other"],
  "Delaware": ["Bright MLS", "Other"],
  "Florida": [
    "Stellar MLS",
    "MIAMI MLS",
    "Beaches MLS",
    "Northeast Florida MLS (NEFMLS)",
    "Realtors® of the Palm Beaches (Rapb-Gflr MLS)",
    "Other",
  ],
  "Georgia": ["FMLS", "GAMLS", "Columbus Board of Realtors MLS", "Other"],
  "Hawaii": ["Honolulu Board of Realtors MLS", "Maui MLS", "Other"],
  "Idaho": ["Intermountain MLS", "Other"],
  "Illinois": ["MRED (Midwest Real Estate Data)", "Other"],
  "Indiana": ["MIBOR MLS", "Indiana Regional MLS", "Other"],
  "Iowa": ["Iowa Association of Realtors MLS", "Other"],
  "Kansas": ["Heartland MLS", "Other"],
  "Kentucky": ["Greater Louisville Association of Realtors MLS", "Lexington-Bluegrass MLS", "Other"],
  "Louisiana": ["Gulf South Real Estate Information Network (GSREIN)", "Other"],
  "Maine": ["Maine Real Estate Information System (MREIS)", "Other"],
  "Maryland": ["Bright MLS", "Other"],
  "Massachusetts": ["MLS PIN", "Other"],
  "Michigan": ["REALCOMP II", "MichRIC", "Other"],
  "Minnesota": ["NorthStarMLS", "Other"],
  "Mississippi": ["MLS United", "Other"],
  "Missouri": ["Heartland MLS", "MARIS", "Other"],
  "Montana": ["Montana Regional MLS", "Other"],
  "Nebraska": ["Great Plains Regional MLS", "Other"],
  "Nevada": ["GLVAR (Greater Las Vegas Association of Realtors)", "NNRMLS (Northern Nevada Regional MLS)", "Other"],
  "New Hampshire": ["New England Real Estate Network (NEREN)", "Other"],
  "New Jersey": ["GSMLS (Garden State MLS)", "Bright MLS", "Other"],
  "New Mexico": ["Southwest MLS", "Other"],
  "New York": ["OneKey MLS", "REBNY", "MLS Long Island", "Upstate New York MLS", "Other"],
  "North Carolina": ["Triangle MLS", "Canopy MLS", "CCAR MLS", "Other"],
  "North Dakota": ["Fargo-Moorhead Area Association of Realtors MLS", "Other"],
  "Ohio": ["Columbus Realtors MLS (CincyMLS)", "MLS Now (Northern Ohio)", "Dayton Area Board of Realtors MLS", "Other"],
  "Oklahoma": ["Oklahoma City MLS (MLSOK)", "Tulsa Area MLS", "Other"],
  "Oregon": ["RMLS (Regional MLS, Portland)", "Willamette Valley MLS", "Other"],
  "Pennsylvania": ["Bright MLS", "Berkshire County MLS", "Other"],
  "Rhode Island": ["State-Wide Multiple Listing Service", "Other"],
  "South Carolina": ["Consolidated MLS (CMLS)", "Charleston Trident MLS", "Other"],
  "South Dakota": ["Realtor Association of the Sioux Empire MLS", "Other"],
  "Tennessee": ["Greater Nashville Realtors MLS", "Memphis Area Association of Realtors MLS", "Other"],
  "Texas": [
    "HAR MLS (Houston Association of Realtors)",
    "NTREIS (North Texas Real Estate Info Systems / DFW)",
    "Actris (Austin/Central TX)",
    "SABOR (San Antonio)",
    "Corpus Christi Association of Realtors MLS",
    "Other",
  ],
  "Utah": ["UtahRealEstate.com MLS", "Other"],
  "Vermont": ["New England Real Estate Network (NEREN)", "Other"],
  "Virginia": ["Bright MLS", "CVR MLS (Central Virginia)", "Other"],
  "Washington": ["NWMLS (Northwest MLS)", "CBA MLS", "Other"],
  "Washington D.C.": ["Bright MLS", "Other"],
  "West Virginia": ["Bright MLS", "Other"],
  "Wisconsin": ["Metro MLS (Milwaukee)", "RANW MLS", "Other"],
  "Wyoming": ["Teton Board of Realtors MLS", "Other"],
  "Canada": ["CREA (Canadian Real Estate Association)", "TREB / TRREB (Toronto)", "REBGV (Vancouver)", "OREB (Ottawa)", "Other"],
  "Worldwide": ["Not applicable / No MLS", "Other"],
};

/** Returns MLS options for a given state/region. Always includes "Other". */
export function getMlsForState(stateOrRegion: string): string[] {
  return STATE_MLS_MAP[stateOrRegion] ?? ["Other"];
}

// ── Additional pages ──────────────────────────────────────────────────────────
export const ADDITIONAL_PAGE_OPTIONS = [
  "Buyers",
  "Sellers",
  "Mortgage",
  "Home Valuation",
  "Neighborhoods",
  "Testimonials",
  "Blog",
  "Press",
  "Developments",
  "Videos",
  "Contact",
  "Other",
] as const;

export type AdditionalPageOption = (typeof ADDITIONAL_PAGE_OPTIONS)[number];
