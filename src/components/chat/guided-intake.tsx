"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface IntakeStep {
  key: string;
  question: string;
  placeholder: string;
  skipLabel?: string;
  choices?: string[];
}

const STEPS: IntakeStep[] = [
  {
    key: "state",
    question: "What state is the client applying in?",
    placeholder: "e.g. TX, Ohio, FL",
    skipLabel: "Not sure yet",
  },
  {
    key: "age_gender",
    question: "Age and gender?",
    placeholder: "e.g. 68 female",
    skipLabel: "Skip",
  },
  {
    key: "conditions",
    question: "What conditions or diagnoses are on the app?",
    placeholder: "e.g. AFib, diabetes, COPD",
  },
  {
    key: "medications",
    question: "Any medications worth noting?",
    placeholder: "e.g. Eliquis, Metformin",
    skipLabel: "None / not sure",
  },
  {
    key: "height_weight",
    question: "Height and weight?",
    placeholder: "e.g. 5'10\" 195 lbs",
    skipLabel: "Skip",
  },
  {
    key: "tobacco",
    question: "Tobacco use?",
    placeholder: "",
    choices: ["No", "Yes", "Skip"],
  },
  {
    key: "extra",
    question: "Anything else? (surgeries, dates, other notes)",
    placeholder: "e.g. hip replacement 2019",
    skipLabel: "Nope, run it",
  },
];

export type GuidedAnswers = Record<string, string>;

interface GuidedIntakeProps {
  onComplete: (scenario: string, answers: GuidedAnswers) => void;
  onCancel: () => void;
}

function buildScenario(answers: GuidedAnswers): string {
  const parts: string[] = [];
  if (answers.age_gender) parts.push(answers.age_gender);
  if (answers.state) parts.push(`in ${answers.state}`);
  if (answers.conditions) parts.push(`conditions: ${answers.conditions}`);
  if (answers.medications) parts.push(`meds: ${answers.medications}`);
  if (answers.height_weight) parts.push(answers.height_weight);
  if (answers.tobacco && answers.tobacco.toLowerCase() !== "skip") {
    parts.push(`tobacco: ${answers.tobacco}`);
  }
  if (answers.extra) parts.push(answers.extra);
  return parts.join(", ") || "No details provided";
}

export function GuidedIntake({ onComplete, onCancel }: GuidedIntakeProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<GuidedAnswers>({});
  const [inputValue, setInputValue] = useState("");

  const step = STEPS[stepIdx];

  const advance = useCallback(
    (value: string) => {
      const next = { ...answers, [step.key]: value };
      setAnswers(next);
      setInputValue("");
      if (stepIdx + 1 >= STEPS.length) {
        onComplete(buildScenario(next), next);
      } else {
        setStepIdx(stepIdx + 1);
      }
    },
    [answers, step, stepIdx, onComplete]
  );

  const skip = useCallback(() => advance(""), [advance]);

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-600">
          Step {stepIdx + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>

      <p className="font-medium text-gray-900">{step.question}</p>

      {"choices" in step && step.choices ? (
        <div className="flex flex-wrap gap-2">
          {step.choices.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === "Skip" ? "ghost" : "outline"}
              onClick={() => advance(c === "Skip" ? "" : c)}
            >
              {c}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            advance(inputValue.trim());
          }}
        >
          <input
            autoFocus
            className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder={step.placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={!inputValue.trim()}>
            Next
          </Button>
          {step.skipLabel && (
            <Button type="button" size="sm" variant="ghost" onClick={skip}>
              {step.skipLabel}
            </Button>
          )}
        </form>
      )}

      {Object.keys(answers).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(answers)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span
                key={k}
                className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800"
              >
                {v}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
