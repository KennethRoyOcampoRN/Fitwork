import { ComponentStat, DemographicBreakdown, ApeComprehensiveStats, YearOverYearComponent, isSmallN } from "./stats";
import { CLASSIFIED_COMPONENT_KEYS } from "./classification";

// Sentence-generation rules — kept entirely separate from docx-writing code
// (docBuilder.ts) so the wording/threshold logic can be reasoned about (and
// changed) without touching document assembly. Every function here is a
// pure string producer: given computed stats, return text. No chart/canvas
// code, no docx imports.
//
// Hard invariants enforced throughout:
//   - Percentages are always computed over the count of employees with a
//     RECORDED value for that specific field, never over total headcount —
//     and both denominators are stated in the same sentence.
//   - Small-n (<5 recorded) suppresses percentages and trend language,
//     falling back to plain counts.
//   - Zero-n renders one sentence stating the field wasn't recorded, and
//     nothing else (the caller skips the chart/table for that section).
//   - Never emits NaN/undefined/null/Infinity — every division is guarded.
//   - Describes and classifies for review; never states a diagnosis or
//     recommends treatment.

export function pct(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return "—";
  const value = Math.round((numerator / denominator) * 100);
  return `${Number.isFinite(value) ? value : 0}%`;
}

export function componentNarrative(stat: ComponentStat): string {
  if (stat.totalExamined === 0) {
    return `${stat.label}: no employees were examined under this scope for this period, so nothing can be reported.`;
  }
  if (stat.recordedCount === 0) {
    return `${stat.label} was not recorded for any of the ${stat.totalExamined} employee(s) examined.`;
  }

  const sentences: string[] = [];
  sentences.push(`${stat.label} was recorded for ${stat.recordedCount} of ${stat.totalExamined} employee(s) examined (${pct(stat.recordedCount, stat.totalExamined)} of those examined).`);

  if (isSmallN(stat.recordedCount)) {
    const counts = stat.tally.map((t) => `${t.label}: ${t.count}`).join(", ");
    sentences.push(`Because fewer than 5 values were recorded, results are reported as counts only, without percentages or trend comparison: ${counts}.`);
  } else if (stat.tally.length > 0) {
    const top = stat.tally[0];
    sentences.push(`Of the ${stat.recordedCount} employee(s) with a recorded value, the most common classification was "${top.label}" (${top.count} of ${stat.recordedCount}, ${pct(top.count, stat.recordedCount)}).`);
    if (stat.tally.length > 1) {
      const rest = stat.tally.slice(1).map((t) => `"${t.label}" (${t.count}, ${pct(t.count, stat.recordedCount)})`).join("; ");
      sentences.push(`Remaining classifications: ${rest}.`);
    }
  }

  if (stat.unclassifiableCount > 0) {
    sentences.push(`${stat.unclassifiableCount} recorded value(s) could not be parsed into a standard classification from the text on file and are excluded from the percentages above.`);
  }

  return sentences.join(" ");
}

export function demographicNarrative(breakdown: DemographicBreakdown): string {
  const recorded = breakdown.tally.reduce((sum, t) => sum + t.count, 0);
  if (recorded === 0) return `${breakdown.label} is not on file for any employee in this scope.`;
  const top = breakdown.tally[0];
  const sentences = [`${breakdown.label} is on file for ${recorded} employee(s) in this scope.`];
  if (isSmallN(recorded)) {
    sentences.push(`Given the small population, the breakdown is reported as counts only: ${breakdown.tally.map((t) => `${t.label}: ${t.count}`).join(", ")}.`);
  } else {
    sentences.push(`The largest group is "${top.label}" (${top.count} of ${recorded}, ${pct(top.count, recorded)}).`);
  }
  return sentences.join(" ");
}

export function executiveSummaryNarrative(stats: ApeComprehensiveStats, scopeLabel: string): string[] {
  const paragraphs: string[] = [];

  if (stats.headcount === 0) {
    return [`No employees fall under the selected scope (${scopeLabel}) — this report cannot summarize a population that does not exist.`];
  }

  paragraphs.push(
    `This report covers ${stats.headcount} employee(s) under the scope "${scopeLabel}" for exam year ${stats.year}. ` +
    `Of these, ${stats.examined} (${pct(stats.examined, stats.headcount)}) completed an Annual Physical Exam for this period; ` +
    `${stats.headcount - stats.examined} (${pct(stats.headcount - stats.examined, stats.headcount)}) did not.`
  );

  if (stats.examined === 0) {
    paragraphs.push("No exam records exist for this scope and year, so no findings can be summarized below.");
    return paragraphs;
  }

  const notable = stats.components
    .filter((c) => CLASSIFIED_COMPONENT_KEYS.has(c.key) && c.recordedCount >= 5 && c.tally.length > 0)
    .map((c) => ({ c, top: c.tally[0] }))
    .filter(({ top }) => top.label !== "Normal")
    .sort((a, b) => (b.top.count / b.c.recordedCount) - (a.top.count / a.c.recordedCount))
    .slice(0, 3);

  if (notable.length > 0) {
    const list = notable.map(({ c, top }) => `${c.label} — "${top.label}" in ${top.count} of ${c.recordedCount} recorded (${pct(top.count, c.recordedCount)})`).join("; ");
    paragraphs.push(`The most prevalent non-normal findings this period: ${list}.`);
  } else {
    paragraphs.push("No component this period had enough recorded values, or a large enough non-normal group, to call out as a leading finding.");
  }

  if (stats.followUps.length > 0) {
    const high = stats.followUps.filter((f) => f.urgency === "High").length;
    paragraphs.push(`${stats.followUps.length} finding(s) are flagged for follow-up review this period, ${high} at High urgency. See "Findings Requiring Follow-Up" below.`);
  } else {
    paragraphs.push("No findings were flagged for follow-up review this period.");
  }

  return paragraphs;
}

export function yoyComponentNarrative(component: YearOverYearComponent): string {
  const [current, ...priorYears] = component.years;
  if (!current || current.recordedCount === 0) {
    return `${component.label}: no data recorded for ${current?.year ?? "the current period"} under this scope.`;
  }
  const priorWithData = priorYears.filter((y) => y.hasData && y.recordedCount > 0);
  if (priorWithData.length === 0) {
    return `${component.label}: no prior-year data on file for this scope — year-over-year comparison is not possible, so only the current period (${current.year}) is reported.`;
  }

  const currentTop = current.tally[0];
  const priorTop = priorWithData[0].tally[0];
  if (!currentTop || !priorTop) {
    return `${component.label}: insufficient classified data in ${current.year} or ${priorWithData[0].year} to compare.`;
  }
  const currentPctVal = current.recordedCount > 0 ? currentTop.count / current.recordedCount : 0;
  const priorPctVal = priorWithData[0].recordedCount > 0 ? priorTop.count / priorWithData[0].recordedCount : 0;
  const direction = currentPctVal > priorPctVal ? "increased" : currentPctVal < priorPctVal ? "decreased" : "held steady";

  if (isSmallN(current.recordedCount) || isSmallN(priorWithData[0].recordedCount)) {
    return `${component.label}: sample sizes in ${current.year} (${current.recordedCount} recorded) and/or ${priorWithData[0].year} (${priorWithData[0].recordedCount} recorded) are too small for a reliable trend comparison; reported as counts only.`;
  }

  return `${component.label}: the share classified as "${currentTop.label}" ${direction} from ${pct(priorTop.count, priorWithData[0].recordedCount)} in ${priorWithData[0].year} (${priorTop.count} of ${priorWithData[0].recordedCount}) to ${pct(currentTop.count, current.recordedCount)} in ${current.year} (${currentTop.count} of ${current.recordedCount}).`;
}

export function companyBreakdownNarrative(headcount: number, examined: number, keyFindings: string[]): string {
  const sentences = [`${examined} of ${headcount} employee(s) (${pct(examined, headcount)}) completed an exam this period.`];
  if (keyFindings.length > 0) sentences.push(keyFindings.join(" "));
  return sentences.join(" ");
}

export function methodologyNarrative(stats: ApeComprehensiveStats, scopeLabel: string, department: string | undefined): string {
  return (
    `Scope: ${scopeLabel}. Department filter: ${department || "All departments"}. ` +
    `Population: ${stats.headcount} employee(s) active under this scope as of report generation. ` +
    `${stats.examined} (${pct(stats.examined, stats.headcount)}) have an Annual Physical Exam on file for ${stats.year}. ` +
    `Data completeness for each component examined is stated per-section below and summarized in the Appendix.`
  );
}
