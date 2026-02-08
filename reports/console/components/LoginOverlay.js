/**
 * LoginOverlay Component
 * Full-screen overlay with glass panel for password authentication.
 * Exports to window.Console.LoginOverlay
 */

window.Console = window.Console || {};

const { api } = window.Console;
const { ACTIONS: LOGIN_ACTIONS } = window.Console;

function LoginOverlay({ dispatch }) {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.login(password);
      if (result.success) {
        dispatch({ type: LOGIN_ACTIONS.LOGIN_SUCCESS });
      } else {
        setError(result.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Connection failed. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', { className: 'login-overlay' },
    React.createElement('form', {
      className: 'login-panel glass-panel',
      onSubmit: handleSubmit
    },
      React.createElement('h1', { className: 'login-title' }, 'ALN Director Console'),
      React.createElement('p', { className: 'login-subtitle' }, 'Investigative Report Generator'),
      error && React.createElement('div', { className: 'login-error' }, error),
      React.createElement('input', {
        type: 'password',
        className: 'login-input',
        placeholder: 'Access password',
        value: password,
        onChange: (e) => setPassword(e.target.value),
        autoFocus: true,
        disabled: loading
      }),
      React.createElement('button', {
        type: 'submit',
        className: 'btn btn-primary',
        disabled: loading || !password.trim()
      }, loading ? 'Authenticating...' : 'Enter')
    )
  );
}

window.Console.LoginOverlay = LoginOverlay;
