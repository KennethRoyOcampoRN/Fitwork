// Curated illness/condition categories for reporting (department + age
// breakdowns — see docs/RECOVERY.md-adjacent report design notes). This is a
// fixed, code-maintained list (same convention as FITNESS_CLASSES/DISPOSITIONS
// elsewhere in the app), not an admin-editable table — keeps the category set
// small, consistent, and auditable across reports.
//
// `suggestIllnessCategory` gives a best-effort keyword match against free-text
// diagnosis/nursingDiagnosis so charting staff get a pre-filled suggestion
// they can accept or override; it is intentionally simple (substring
// matching on normalized text) rather than fuzzy/statistical, so its
// behavior stays predictable and easy to extend by editing KEYWORD_MAP.

export interface IllnessCategory {
  key: string;
  label: string;
}

export const ILLNESS_CATEGORIES: IllnessCategory[] = [
  { key: "MUSCULOSKELETAL", label: "Musculoskeletal" },
  { key: "RESPIRATORY", label: "Respiratory" },
  { key: "GASTROINTESTINAL", label: "Gastrointestinal" },
  { key: "CARDIOVASCULAR", label: "Cardiovascular" },
  { key: "SKIN", label: "Skin" },
  { key: "INJURY_TRAUMA", label: "Injury / Trauma" },
  { key: "INFECTIOUS", label: "Infectious / Communicable" },
  { key: "NEUROLOGICAL", label: "Neurological" },
  { key: "MENTAL_HEALTH", label: "Mental Health" },
  { key: "EYE_ENT", label: "Eye / Ear / Nose / Throat" },
  { key: "GENITOURINARY", label: "Genitourinary" },
  { key: "METABOLIC_ENDOCRINE", label: "Metabolic / Endocrine" },
  { key: "DENTAL_ORAL", label: "Dental / Oral" },
  { key: "OTHER", label: "Other" },
];

export const ILLNESS_CATEGORY_KEYS = ILLNESS_CATEGORIES.map((c) => c.key);

const KEYWORD_MAP: Record<string, string[]> = {
  MUSCULOSKELETAL: [
    "back pain", "low back", "lumbar", "strain", "sprain", "muscle", "joint", "arthritis",
    "myalgia", "shoulder pain", "knee pain", "neck pain", "spasm", "tendinitis", "tendonitis",
  ],
  RESPIRATORY: [
    "cough", "asthma", "urti", "lrti", "pneumonia", "bronchitis", "cold", "flu", "influenza",
    "shortness of breath", "dyspnea", "sore throat", "sinusitis", "rhinitis", "covid", "tb ",
    "tuberculosis", "pharyngitis",
  ],
  GASTROINTESTINAL: [
    "abdominal pain", "stomach ache", "diarrhea", "vomiting", "nausea", "gastritis", "gerd",
    "constipation", "peptic ulcer", "food poisoning", "indigestion", "dyspepsia", "hyperacidity",
  ],
  CARDIOVASCULAR: [
    "hypertension", "chest pain", "palpitation", "tachycardia", "arrhythmia", "hypotension",
    "cardiac", "heart",
  ],
  SKIN: [
    "rash", "dermatitis", "allergy", "allergic reaction", "eczema", "urticaria", "wound infection",
    "boil", "abscess", "skin lesion", "itch", "pruritus",
  ],
  INJURY_TRAUMA: [
    "laceration", "contusion", "fracture", "wound", "burn", "abrasion", "fall", "accident",
    "injury", "trauma", "cut", "bruise",
  ],
  INFECTIOUS: [
    "fever", "infection", "uti", "urinary tract infection", "chickenpox", "measles", "dengue",
    "typhoid", "viral", "bacterial",
  ],
  NEUROLOGICAL: [
    "headache", "migraine", "dizziness", "vertigo", "seizure", "numbness", "tingling",
  ],
  MENTAL_HEALTH: [
    "anxiety", "stress", "depression", "insomnia", "burnout", "panic attack", "fatigue",
  ],
  EYE_ENT: [
    "eye", "conjunctivitis", "vision", "ear pain", "earache", "otitis", "epistaxis", "nosebleed",
    "throat",
  ],
  GENITOURINARY: [
    "dysmenorrhea", "menstrual", "urinary", "kidney stone", "renal colic",
  ],
  METABOLIC_ENDOCRINE: [
    "diabetes", "hyperglycemia", "hypoglycemia", "thyroid", "goiter", "gout",
  ],
  DENTAL_ORAL: [
    "tooth", "toothache", "dental", "gum", "gingivitis", "caries", "mouth",
  ],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Returns null when no keyword matches — callers treat that as
// "Uncategorized" rather than silently defaulting to OTHER, so a report can
// distinguish "we looked and found nothing recognizable" from "not checked
// yet."
export function suggestIllnessCategory(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = normalize(text);
  if (!normalized) return null;

  for (const category of ILLNESS_CATEGORIES) {
    const keywords = KEYWORD_MAP[category.key];
    if (!keywords) continue;
    if (keywords.some((kw) => normalized.includes(kw))) return category.key;
  }
  return null;
}
