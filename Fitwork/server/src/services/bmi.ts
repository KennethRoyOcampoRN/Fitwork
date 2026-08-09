// Asia-Pacific WHO cutoffs (default per spec §5, §16 Q3)
export type BmiCategory = "UNDERWEIGHT" | "NORMAL" | "OVERWEIGHT" | "OBESE_I" | "OBESE_II";

export function computeBmi(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "UNDERWEIGHT";
  if (bmi < 23.0) return "NORMAL";
  if (bmi < 25.0) return "OVERWEIGHT";
  if (bmi < 30.0) return "OBESE_I";
  return "OBESE_II";
}
