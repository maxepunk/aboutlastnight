/**
 * FileBrowser Component
 * Modal dialog for browsing server-side directories and files.
 * Uses GET /api/browse endpoint.
 * Exports to window.Console.FileBrowser
 */

window.Console = window.Console || {};

const { api: browseApi } = window.Console;

function FileBrowser({ open, mode, initialPath, onSelect, onCancel }) {
  const [currentPath, setCurrentPath] = React.useState(initialPath || '');
  const [entries, setEntries] = React.useState([]);
  const [parentPath, setParentPath] = React.useState(null);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const fetchDir = async (dirPath, fallback) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    try {
      const params = dirPath ? '?dir=' + encodeURIComponent(dirPath) : '';
      const resp = await fetch('/api/browse' + params, { credentials: 'include' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        // If path not found and we have a fallback, try that instead
        if (resp.status === 404 && fallback) {
          return fetchDir(fallback);
        }
        throw new Error(body.error || 'Failed to browse directory');
      }
      const data = await resp.json();
      setCurrentPath(data.path);
      setParentPath(data.parent);
      setEntries(data.entries);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      // If initial path fails (e.g. doesn't exist yet), fall back to default data/ dir
      fetchDir(initialPath || '', '');
    }
  }, [open]);

  if (!open) return null;

  const handleEntryClick = (entry) => {
    if (entry.type === 'directory') {
      fetchDir(entry.path);
    } else if (mode === 'file') {
      setSelectedFile(entry.path === selectedFile ? null : entry.path);
    }
  };

  const handleSelect = () => {
    if (mode === 'directory') {
      onSelect(currentPath);
    } else if (selectedFile) {
      onSelect(selectedFile);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  // Build breadcrumb segments from currentPath
  const buildBreadcrumbs = () => {
    if (!currentPath) return [];
    // Split on both / and \ for cross-platform support
    const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const crumbs = [];
    for (let i = 0; i < parts.length; i++) {
      // Rebuild the path up to this segment
      const partial = parts.slice(0, i + 1).join('/');
      // On Windows, first part might be a drive letter like C:
      const fullPath = parts[0].includes(':') ? partial : '/' + partial;
      crumbs.push({ label: parts[i], path: fullPath });
    }
    return crumbs;
  };

  const breadcrumbs = buildBreadcrumbs();

  return React.createElement('div', {
    className: 'rollback-modal',
    onClick: handleBackdropClick,
    onKeyDown: handleKeyDown,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Browse ' + (mode === 'directory' ? 'directories' : 'files')
  },
    React.createElement('div', { className: 'rollback-modal__panel glass-panel fade-in file-browser' },
      // Title
      React.createElement('h3', { className: 'rollback-modal__title' },
        mode === 'directory' ? 'Select Directory' : 'Select File'
      ),

      // Breadcrumb
      React.createElement('div', { className: 'file-browser__breadcrumb mt-sm' },
        breadcrumbs.map((crumb, i) =>
          React.createElement(React.Fragment, { key: i },
            i > 0 && React.createElement('span', { className: 'file-browser__breadcrumb-sep' }, '/'),
            React.createElement('button', {
              className: 'file-browser__breadcrumb-item' +
                (i === breadcrumbs.length - 1 ? ' file-browser__breadcrumb-item--active' : ''),
              onClick: () => fetchDir(crumb.path)
            }, crumb.label)
          )
        )
      ),

      // Error
      error && React.createElement('p', { className: 'validation-error mt-sm' }, error),

      // Loading
      loading && React.createElement('p', { className: 'text-muted text-sm mt-md' }, 'Loading...'),

      // Entries list
      !loading && React.createElement('div', { className: 'file-browser__list mt-sm' },
        // Parent directory
        parentPath && React.createElement('div', {
          className: 'file-browser__entry file-browser__entry--dir',
          onClick: () => fetchDir(parentPath)
        },
          React.createElement('span', { className: 'file-browser__entry-icon' }, '\u{1F4C1}'),
          React.createElement('span', { className: 'file-browser__entry-name' }, '..')
        ),

        // Directory/file entries
        entries.map((entry) =>
          React.createElement('div', {
            key: entry.name,
            className: 'file-browser__entry' +
              (entry.type === 'directory' ? ' file-browser__entry--dir' : ' file-browser__entry--file') +
              (selectedFile === entry.path ? ' file-browser__entry--selected' : ''),
            onClick: () => handleEntryClick(entry)
          },
            React.createElement('span', { className: 'file-browser__entry-icon' },
              entry.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'
            ),
            React.createElement('span', { className: 'file-browser__entry-name' }, entry.name)
          )
        ),

        // Empty state
        entries.length === 0 && !loading && React.createElement('p', {
          className: 'text-muted text-sm',
          style: { padding: 'var(--space-md)' }
        }, 'Empty directory')
      ),

      // Actions
      React.createElement('div', { className: 'rollback-modal__actions mt-lg' },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: handleSelect,
          disabled: mode === 'file' && !selectedFile
        }, 'Select'),
        React.createElement('button', {
          className: 'btn btn-ghost',
          onClick: onCancel
        }, 'Cancel')
      )
    )
  );
}

window.Console.FileBrowser = FileBrowser;
