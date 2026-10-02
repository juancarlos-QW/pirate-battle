import { useId, useRef, useState, type FormEvent } from 'react';
import {
  DEFAULT_OPTIONS,
  OPTION_LIMITS,
  stepOption,
  validateOptions,
  type OptionsErrors,
  type OptionsField,
  type PlayerOptions,
} from '../../config/options.ts';
import { optionsStore, useOptions } from '../../storage/optionsStore.ts';
import { Button, IconButton } from '../components/Button.tsx';
import { Panel } from '../components/Panel.tsx';
import { SoundToggle } from '../components/SoundToggle.tsx';
import { useFocusOnMount } from '../hooks/useFocusOnMount.ts';

interface OptionsScreenProps {
  readonly onBack: () => void;
}

/** Form state keeps raw strings so invalid input can be shown and corrected. */
interface Draft {
  readonly sessionTime: string;
  readonly spawnInterval: string;
  readonly captainName: string;
}

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly message: string };

const FIELD_ORDER: readonly OptionsField[] = ['captainName', 'sessionTime', 'spawnInterval'];

function toDraft(options: PlayerOptions): Draft {
  return {
    sessionTime: String(options.sessionTime),
    spawnInterval: String(options.spawnInterval),
    captainName: options.captainName,
  };
}

function parseNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function fromDraft(draft: Draft) {
  return {
    sessionTime: parseNumber(draft.sessionTime),
    spawnInterval: parseNumber(draft.spawnInterval),
    captainName: draft.captainName,
  };
}

export function OptionsScreen({ onBack }: OptionsScreenProps) {
  const saved = useOptions();
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<OptionsErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputRefs = useRef<Partial<Record<OptionsField, HTMLInputElement | null>>>({});

  const isDirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  const update = (field: OptionsField, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setStatus({ kind: 'idle' });
    if (errors[field]) {
      const next = validateOptions(fromDraft({ ...draft, [field]: value }));
      setErrors((previous) => ({ ...previous, [field]: next.ok ? undefined : next.errors[field] }));
    }
  };

  const validateField = (field: OptionsField) => {
    const result = validateOptions(fromDraft(draft));
    setErrors((previous) => ({
      ...previous,
      [field]: result.ok ? undefined : result.errors[field],
    }));
  };

  const step = (field: 'sessionTime' | 'spawnInterval', direction: 1 | -1) => {
    update(field, String(stepOption(field, parseNumber(draft[field]), direction)));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateOptions(fromDraft(draft));
    if (!result.ok) {
      setErrors(result.errors);
      setStatus({ kind: 'error', message: 'Please fix the highlighted fields.' });
      const firstInvalid = FIELD_ORDER.find((field) => result.errors[field]);
      if (firstInvalid) inputRefs.current[firstInvalid]?.focus();
      return;
    }
    setErrors({});
    const stored = optionsStore.save(result.value);
    setDraft(toDraft(result.value));
    setStatus(
      stored
        ? { kind: 'saved' }
        : { kind: 'error', message: 'Options apply to this session but could not be stored.' },
    );
  };

  const handleReset = () => {
    setDraft(toDraft(DEFAULT_OPTIONS));
    setErrors({});
    setStatus({ kind: 'idle' });
  };

  return (
    <Panel className="options">
      <h1 className="panel-title" ref={headingRef} tabIndex={-1}>
        Options
      </h1>

      <form className="options__form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Captain name"
          value={draft.captainName}
          error={errors.captainName}
          hint={`Shown on the ranking. Up to ${OPTION_LIMITS.captainName.maxLength} characters.`}
          maxLength={OPTION_LIMITS.captainName.maxLength + 10}
          inputRef={(element) => (inputRefs.current.captainName = element)}
          onChange={(value) => update('captainName', value)}
          onBlur={() => validateField('captainName')}
        />
        <StepperField
          label="Game session time"
          unit="s"
          value={draft.sessionTime}
          error={errors.sessionTime}
          hint={`${OPTION_LIMITS.sessionTime.min}–${OPTION_LIMITS.sessionTime.max} seconds.`}
          inputMode="numeric"
          inputRef={(element) => (inputRefs.current.sessionTime = element)}
          onChange={(value) => update('sessionTime', value)}
          onBlur={() => validateField('sessionTime')}
          onStep={(direction) => step('sessionTime', direction)}
        />
        <StepperField
          label="Enemy spawn time"
          unit="s"
          value={draft.spawnInterval}
          error={errors.spawnInterval}
          hint={`${OPTION_LIMITS.spawnInterval.min}–${OPTION_LIMITS.spawnInterval.max} seconds, in steps of ${OPTION_LIMITS.spawnInterval.unitStep}.`}
          inputMode="decimal"
          inputRef={(element) => (inputRefs.current.spawnInterval = element)}
          onChange={(value) => update('spawnInterval', value)}
          onBlur={() => validateField('spawnInterval')}
          onStep={(direction) => step('spawnInterval', direction)}
        />

        <p className="options__note">Changes apply to the next match.</p>

        <div
          className={`form-status form-status--${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.kind === 'saved' && 'Options saved.'}
          {status.kind === 'error' && status.message}
          {status.kind === 'idle' && isDirty && 'You have unsaved changes.'}
        </div>

        <div className="options__actions">
          <Button type="submit" disabled={!isDirty && status.kind !== 'error'}>
            Save
          </Button>
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Reset defaults
          </Button>
          <SoundToggle />
          <Button variant="secondary" size="sm" onClick={onBack}>
            Main menu
          </Button>
        </div>
      </form>
    </Panel>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly hint: string;
  readonly inputRef: (element: HTMLInputElement | null) => void;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}

function TextField({
  label,
  value,
  error,
  hint,
  inputRef,
  onChange,
  onBlur,
  maxLength,
}: FieldProps & { readonly maxLength: number }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className="field__input"
        type="text"
        autoComplete="nickname"
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

function StepperField({
  label,
  unit,
  value,
  error,
  hint,
  inputMode,
  inputRef,
  onChange,
  onBlur,
  onStep,
}: FieldProps & {
  readonly unit: string;
  readonly inputMode: 'numeric' | 'decimal';
  readonly onStep: (direction: 1 | -1) => void;
}) {
  const id = useId();
  return (
    <div className="field field--stepper">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper">
        <IconButton
          icon="minus"
          label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onStep(-1)}
        />
        <span className="stepper__value">
          <input
            id={id}
            ref={inputRef}
            className="field__input stepper__input"
            type="text"
            inputMode={inputMode}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                onStep(event.key === 'ArrowUp' ? 1 : -1);
              }
            }}
          />
          <span className="stepper__unit" aria-hidden="true">
            {unit}
          </span>
        </span>
        <IconButton
          icon="plus"
          label={`Increase ${label.toLowerCase()}`}
          onClick={() => onStep(1)}
        />
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

function FieldMessages({
  id,
  hint,
  error,
}: {
  readonly id: string;
  readonly hint: string;
  readonly error: string | undefined;
}) {
  return (
    <>
      <p id={`${id}-hint`} className="field__hint">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </>
  );
}
