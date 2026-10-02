import { CONTROL_BINDINGS, TOUCH_INSTRUCTIONS } from '../../config/controls.ts';

/** Keyboard and touch control instructions, generated from the central bindings. */
export function ControlsGuide() {
  return (
    <div className="controls-guide">
      <table className="controls-guide__table">
        <caption className="visually-hidden">Keyboard controls</caption>
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Keys</th>
          </tr>
        </thead>
        <tbody>
          {CONTROL_BINDINGS.map((binding) => (
            <tr key={binding.action}>
              <th scope="row">{binding.label}</th>
              <td>
                {binding.keys.map((key, index) => (
                  <span key={key}>
                    {index > 0 && <span className="controls-guide__or"> or </span>}
                    <kbd>{key}</kbd>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="controls-guide__touch">{TOUCH_INSTRUCTIONS}</p>
    </div>
  );
}
