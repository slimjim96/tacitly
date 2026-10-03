import { useEffect, useState } from 'react'
import { useApp } from './context'
import { Icon } from './ui'

function CopyField({ label, value, guide }: { label: string; value: string; guide?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { /* clipboard blocked: the text is selectable */ }
  }
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <code>{value}</code>
      <button className="chip" onClick={copy} data-guide={guide} aria-label={`Copy ${label}`}>
        <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/** Step-by-step: give Claude this server's MCP address, then let it add a note. */
export function Connect() {
  const { pulse, emit, refresh } = useApp()
  useEffect(() => { emit('view.connect') }, [emit])
  const url = `${location.origin}/mcp`
  const hasToken = (() => { try { return !!localStorage.getItem('tacitly.token') } catch { return false } })()
  const auth = hasToken ? ' --header "Authorization: Bearer $TACITLY_TOKEN"' : ''
  const connected = (pulse?.claude ?? 0) > 0

  // While waiting, look again every few seconds so "Connected" appears the moment Claude's first note lands.
  useEffect(() => {
    if (connected) return
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [connected, refresh])

  return (
    <div className="connect">
      <div className={`status-card ${connected ? 'ok' : ''}`}>
        <Icon name={connected ? 'check' : 'connect'} size={22} />
        <div>
          <b>{connected ? 'Connected' : 'Not connected yet'}</b>
          <p className="muted small">
            {connected
              ? `Claude has added ${pulse!.claude} ${pulse!.claude === 1 ? 'entry' : 'entries'} so far. They're tagged "via claude".`
              : 'Waiting for Claude. This turns green the moment it adds its first note.'}
          </p>
        </div>
      </div>

      <ol className="steps">
        <li>
          <h3>Copy this server's address</h3>
          <p className="muted small">Claude talks to Tacitly through MCP, the protocol Claude uses for tools. This is the address it needs.</p>
          <CopyField label="MCP address" value={url} />
        </li>
        <li>
          <h3>Add it to Claude</h3>
          <div className="tabs-lite">
            <section>
              <h4>Claude Code (terminal)</h4>
              <CopyField label="command" value={`claude mcp add --transport http tacitly ${url}${auth}`} guide="copy-mcp" />
            </section>
            <section>
              <h4>Claude Desktop or claude.ai</h4>
              <p className="small">Open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>. Name it Tacitly and paste the address from step 1.
                {hasToken && <> Set the header <code>Authorization: Bearer &lt;your token&gt;</code>.</>}</p>
            </section>
          </div>
          {!hasToken && <p className="muted small">No access token is set on this server. Keep it on your home network or VPN, or set <code>TACITLY_TOKEN</code> before exposing it.</p>}
        </li>
        <li>
          <h3>Try it</h3>
          <p className="small">Ask Claude: <i>"Add a to-do in Tacitly to renew my passport."</i> It will appear in your Inbox, and this page will say Connected.</p>
          {!connected && <button className="link small" onClick={() => emit('claude.marked')}>I've connected it; mark this quest done</button>}
        </li>
      </ol>

      <details className="what-claude-can-do">
        <summary>What Claude can and can't do here</summary>
        <ul className="small">
          <li><b>Can:</b> add notes and to-dos, list and tick your to-dos, search, read your lenses, and score an entry when you ask it to.</li>
          <li><b>Can't:</b> decide for you. Anything it adds is tagged "via claude", and it never turns a note into a thought on its own.</li>
        </ul>
      </details>
    </div>
  )
}
