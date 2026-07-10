import { useTranslation } from 'react-i18next';

const STEPS = [
  { key: 'payrollWorkflowStepMonth', n: 1 },
  { key: 'payrollWorkflowStepGenerate', n: 2 },
  { key: 'payrollWorkflowStepReview', n: 3 },
  { key: 'payrollWorkflowStepExport', n: 4 },
];

export default function PayrollWorkflowBar({ currentStep, attentionCount = 0 }) {
  const { t } = useTranslation();

  return (
    <nav
      className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/40 px-4 py-3 sm:px-5"
      aria-label={t('payrollWorkflowTitle')}
    >
      <p className="text-[13px] font-medium text-apple-text">{t('payrollWorkflowTitle')}</p>
      <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {STEPS.map((step, i) => {
          const done = currentStep > step.n;
          const active = currentStep === step.n;
          return (
            <li key={step.key} className="flex items-center gap-2 text-[13px]">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                  done
                    ? 'bg-emerald-600 text-white'
                    : active
                      ? 'bg-brand-600 text-white'
                      : 'bg-black/[0.06] text-apple-label'
                }`}
              >
                {done ? '✓' : step.n}
              </span>
              <span className={active ? 'font-medium text-apple-text' : 'text-apple-label'}>
                {t(step.key)}
              </span>
              {step.n === 3 && attentionCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {t('payrollAttentionCount', { count: attentionCount })}
                </span>
              )}
              {i < STEPS.length - 1 && (
                <span className="hidden text-apple-muted sm:inline" aria-hidden>
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
