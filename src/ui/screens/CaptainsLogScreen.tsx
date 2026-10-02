import { useRef, type KeyboardEvent } from 'react';
import type { LogTab } from '../../app/navigation.ts';
import { Button } from '../components/Button.tsx';
import { Panel } from '../components/Panel.tsx';
import { useFocusOnMount } from '../hooks/useFocusOnMount.ts';

interface CaptainsLogScreenProps {
  readonly tab: LogTab;
  readonly onTabChange: (tab: LogTab) => void;
  readonly onBack: () => void;
}

const TABS: readonly { readonly id: LogTab; readonly label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match history' },
];

/** Ranking and match history tabs (WAI-ARIA tabs pattern with arrow key navigation). */
export function CaptainsLogScreen({ tab, onTabChange, onBack }: CaptainsLogScreenProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const tabRefs = useRef<Partial<Record<LogTab, HTMLButtonElement | null>>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    if (!next) return;
    onTabChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <Panel size="lg" className="captains-log">
      <h1 className="panel-title" ref={headingRef} tabIndex={-1}>
        Captain&apos;s log
      </h1>
      <div className="tabs" role="tablist" aria-label="Captain's log" onKeyDown={handleKeyDown}>
        {TABS.map((item) => (
          <Button
            key={item.id}
            ref={(element) => {
              tabRefs.current[item.id] = element;
            }}
            id={`log-tab-${item.id}`}
            role="tab"
            size="sm"
            variant={tab === item.id ? 'primary' : 'secondary'}
            aria-selected={tab === item.id}
            aria-controls={`log-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div
        className="captains-log__panel"
        role="tabpanel"
        id={`log-panel-${tab}`}
        aria-labelledby={`log-tab-${tab}`}
        tabIndex={0}
      >
        <p className="empty-state">
          {tab === 'ranking'
            ? 'The ranking will be available soon.'
            : 'Your match history will be available soon.'}
        </p>
      </div>
      <Button onClick={onBack}>Main menu</Button>
    </Panel>
  );
}
