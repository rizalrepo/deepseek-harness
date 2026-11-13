window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-client-ui-settings-mcp',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;

    const PRESETS = [
      {
        label: 'Puppeteer (Browser Visual)',
        name: 'puppeteer',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-puppeteer',
      },
      {
        label: 'Playwright (Browser)',
        name: 'playwright',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-playwright',
      },
      {
        label: 'Filesystem',
        name: 'filesystem',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-filesystem /home/rizal',
      },
      {
        label: 'Fetch HTTP',
        name: 'fetch',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-fetch',
      },
      {
        label: 'Memory Graph',
        name: 'memory',
        command: 'npx',
        args: '-y @modelcontextprotocol/server-memory',
      },
    ];

    function McpIcon({ size = 16, active = false }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: active ? '#3b82f6' : 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'block' },
        },
        h('rect', { x: 2, y: 2, width: 20, height: 8, rx: 2, ry: 2 }),
        h('rect', { x: 2, y: 14, width: 20, height: 8, rx: 2, ry: 2 }),
        h('line', { x1: 6, y1: 6, x2: '6.01', y2: 6 }),
        h('line', { x1: 6, y1: 18, x2: '6.01', y2: 18 }),
      );
    }

    function McpSettingsSection() {
      const [servers, setServers] = useState([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);

      const [showForm, setShowForm] = useState(false);
      const [name, setName] = useState('');
      const [command, setCommand] = useState('npx');
      const [args, setArgs] = useState('');
      const [transport, setTransport] = useState('stdio');
      const [submitting, setSubmitting] = useState(false);

      const fetchServers = async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch('/api/local/mcp');
          const data = await res.json();
          if (data.ok) {
            setServers(data.servers || []);
          } else {
            setError(data.error || 'Gagal memuat daftar server');
          }
        } catch (err) {
          setError(String(err?.message || err));
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        fetchServers();
      }, []);

      const handlePreset = (p) => {
        setName(p.name);
        setCommand(p.command);
        setArgs(p.args);
        setTransport('stdio');
        setShowForm(true);
      };

      const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!name.trim() || !command.trim()) {
          setError('Nama dan perintah wajib diisi.');
          return;
        }
        setSubmitting(true);
        setError(null);
        try {
          const res = await fetch('/api/local/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              command: command.trim(),
              args: args.trim(),
              transport,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            setShowForm(false);
            setName('');
            setArgs('');
            setNotice('Server tersimpan di ~/.dsh/cordis.patch.yml! Silakan restart DSH agar aktif.');
            await fetchServers();
          } else {
            setError(data.error || 'Gagal menyimpan server.');
          }
        } catch (err) {
          setError(String(err?.message || err));
        } finally {
          setSubmitting(false);
        }
      };

      const handleDelete = async (serverName) => {
        if (!confirm(`Hapus MCP server "${serverName}"?`)) return;
        setError(null);
        try {
          const res = await fetch('/api/local/mcp', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: serverName }),
          });
          const data = await res.json();
          if (data.ok) {
            setNotice(`Server "${serverName}" telah dihapus. Silakan restart DSH.`);
            await fetchServers();
          } else {
            setError(data.error || 'Gagal menghapus server.');
          }
        } catch (err) {
          setError(String(err?.message || err));
        }
      };

      return h(
        'div',
        {
          style: {
            padding: '24px',
            color: 'var(--dsh-color-text, #f4f4f5)',
            fontFamily: 'inherit',
            maxWidth: '800px',
          },
        },
        // Header
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '20px',
            },
          },
          h(
            'div',
            null,
            h('h2', { style: { margin: 0, fontSize: '20px', fontWeight: 600 } }, 'MCP Servers'),
            h(
              'p',
              { style: { margin: '6px 0 0', fontSize: '13px', color: '#a1a1aa' } },
              'Kelola server Model Context Protocol (MCP) untuk integrasi tool browser, filesystem, dan sistem lainnya.',
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => setShowForm(!showForm),
              style: {
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              },
            },
            showForm ? 'Batal' : '+ Tambah Server',
          ),
        ),

        // Notification Banner
        notice &&
          h(
            'div',
            {
              style: {
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#86efac',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
            },
            h('span', null, '✓ ', notice),
            h(
              'button',
              {
                onClick: () => setNotice(null),
                style: { background: 'transparent', border: 'none', color: '#86efac', cursor: 'pointer' },
              },
              '✕',
            ),
          ),

        // Error Banner
        error &&
          h(
            'div',
            {
              style: {
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#fca5a5',
              },
            },
            '⚠ ',
            error,
          ),

        // Add Form
        showForm &&
          h(
            'div',
            {
              style: {
                background: '#1f1f23',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                padding: '18px',
                marginBottom: '24px',
              },
            },
            h('h3', { style: { margin: '0 0 12px', fontSize: '15px' } }, 'Tambah Server Baru'),

            // Presets
            h(
              'div',
              { style: { marginBottom: '14px' } },
              h('span', { style: { fontSize: '12px', color: '#a1a1aa', marginRight: '8px' } }, 'Preset Cepat:'),
              h(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' } },
                PRESETS.map((p) =>
                  h(
                    'button',
                    {
                      key: p.name,
                      type: 'button',
                      onClick: () => handlePreset(p),
                      style: {
                        background: '#27272a',
                        border: '1px solid #52525b',
                        color: '#e4e4e7',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      },
                    },
                    p.label,
                  ),
                ),
              ),
            ),

            // Form inputs
            h(
              'form',
              { onSubmit: handleSave },
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', fontSize: '12px', color: '#d4d4d8', marginBottom: '4px' } }, 'Nama Server'),
                  h('input', {
                    type: 'text',
                    value: name,
                    onChange: (e) => setName(e.target.value),
                    placeholder: 'contoh: puppeteer',
                    style: {
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121215',
                      border: '1px solid #3f3f46',
                      borderRadius: '4px',
                      padding: '7px 10px',
                      color: '#fff',
                      fontSize: '13px',
                    },
                  }),
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', fontSize: '12px', color: '#d4d4d8', marginBottom: '4px' } }, 'Transport'),
                  h(
                    'select',
                    {
                      value: transport,
                      onChange: (e) => setTransport(e.target.value),
                      style: {
                        width: '100%',
                        boxSizing: 'border-box',
                        background: '#121215',
                        border: '1px solid #3f3f46',
                        borderRadius: '4px',
                        padding: '7px 10px',
                        color: '#fff',
                        fontSize: '13px',
                      },
                    },
                    h('option', { value: 'stdio' }, 'stdio (Local CLI/Process)'),
                    h('option', { value: 'streamable-http' }, 'streamable-http (Remote URL)'),
                  ),
                ),
              ),
              h(
                'div',
                { style: { marginBottom: '12px' } },
                h('label', { style: { display: 'block', fontSize: '12px', color: '#d4d4d8', marginBottom: '4px' } }, 'Perintah (Command)'),
                h('input', {
                  type: 'text',
                  value: command,
                  onChange: (e) => setCommand(e.target.value),
                  placeholder: 'contoh: npx atau /usr/bin/node',
                  style: {
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#121215',
                    border: '1px solid #3f3f46',
                    borderRadius: '4px',
                    padding: '7px 10px',
                    color: '#fff',
                    fontSize: '13px',
                  },
                }),
              ),
              h(
                'div',
                { style: { marginBottom: '16px' } },
                h('label', { style: { display: 'block', fontSize: '12px', color: '#d4d4d8', marginBottom: '4px' } }, 'Argumen (Spasi dipisahkan)'),
                h('input', {
                  type: 'text',
                  value: args,
                  onChange: (e) => setArgs(e.target.value),
                  placeholder: 'contoh: -y @modelcontextprotocol/server-puppeteer',
                  style: {
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#121215',
                    border: '1px solid #3f3f46',
                    borderRadius: '4px',
                    padding: '7px 10px',
                    color: '#fff',
                    fontSize: '13px',
                  },
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '8px' } },
                h(
                  'button',
                  {
                    type: 'submit',
                    disabled: submitting,
                    style: {
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '7px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    },
                  },
                  submitting ? 'Menyimpan...' : 'Simpan Server',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setShowForm(false),
                    style: {
                      background: 'transparent',
                      color: '#a1a1aa',
                      border: '1px solid #3f3f46',
                      borderRadius: '4px',
                      padding: '7px 14px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    },
                  },
                  'Batal',
                ),
              ),
            ),
          ),

        // Server List
        loading
          ? h('div', { style: { color: '#a1a1aa', padding: '16px 0' } }, 'Memuat daftar server...')
          : servers.length === 0
          ? h(
              'div',
              {
                style: {
                  textAlign: 'center',
                  padding: '36px',
                  background: '#18181b',
                  borderRadius: '8px',
                  border: '1px dashed #3f3f46',
                  color: '#a1a1aa',
                },
              },
              'Belum ada MCP server yang terpasang. Klik tombol "+ Tambah Server" di atas.',
            )
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              servers.map((srv) =>
                h(
                  'div',
                  {
                    key: srv.name,
                    style: {
                      background: '#1f1f23',
                      border: '1px solid #3f3f46',
                      borderRadius: '6px',
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    },
                  },
                  h(
                    'div',
                    null,
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
                      h('span', { style: { fontWeight: 600, fontSize: '14px' } }, srv.name),
                      h(
                        'span',
                        {
                          style: {
                            fontSize: '10px',
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: '#a1a1aa',
                          },
                        },
                        srv.transport,
                      ),
                    ),
                    h(
                      'code',
                      {
                        style: {
                          fontSize: '12px',
                          color: '#93c5fd',
                          background: '#121215',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        },
                      },
                      `${srv.command} ${(srv.args || []).join(' ')}`,
                    ),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => handleDelete(srv.name),
                      style: {
                        background: 'transparent',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      },
                    },
                    'Hapus',
                  ),
                ),
              ),
            ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => {
          if (ctx.slots.entries('settings.section').some((e) => e.options.id === 'mcp-servers')) return () => {};
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: 'mcp-servers',
              order: 12,
              label: () => 'MCP Servers',
            },
            McpSettingsSection,
          );
        });

        ctx.slots.inject('settings.section.icon', () => {
          if (ctx.slots.entries('settings.section.icon').some((e) => e.options.id === 'mcp-servers')) return () => {};
          return ctx.slots.register(
            {
              name: 'settings.section.icon',
              id: 'mcp-servers',
            },
            McpIcon,
          );
        });
      },
    };
  },
});
