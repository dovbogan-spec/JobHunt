import type { ChangeEvent } from 'react'

export type LlmProvider = 'openai' | 'anthropic' | 'copilot' | 'gemini' | 'custom'

export type LlmIntegrationSettings = {
  provider: LlmProvider
  apiKey: string
  model: string
  endpoint: string
  organization: string
  enabled: boolean
}

export const initialLlmSettings: LlmIntegrationSettings = {
  provider: 'openai',
  apiKey: '',
  model: '',
  endpoint: '',
  organization: '',
  enabled: false,
}

type Props = {
  llmSettings: LlmIntegrationSettings
  llmSavedNotice: string
  onChange: (next: LlmIntegrationSettings) => void
  onSave: () => void
  onDirty: () => void
}

function applyInputValue<T extends keyof LlmIntegrationSettings>(
  settings: LlmIntegrationSettings,
  key: T,
  event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
) {
  if (key === 'enabled') {
    return {
      ...settings,
      enabled: (event.target as HTMLInputElement).checked,
    }
  }

  return {
    ...settings,
    [key]: event.target.value,
  }
}

export function LlmIntegrationTab({ llmSettings, llmSavedNotice, onChange, onSave, onDirty }: Props) {
  const update = <T extends keyof LlmIntegrationSettings>(key: T) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onDirty()
    onChange(applyInputValue(llmSettings, key, event))
  }

  return (
    <section className="llm-config">
      <div className="llm-header-row">
        <h3>LLM Provider Configuration</h3>
        <label className="toggle-inline">
          <input type="checkbox" checked={llmSettings.enabled} onChange={update('enabled')} />
          Enable integration
        </label>
      </div>

      <p className="llm-note">Add the credentials and endpoint you use for ChatGPT, Claude, Copilot, Gemini, or a custom compatible API.</p>

      <div className="llm-grid">
        <label>
          Provider
          <select value={llmSettings.provider} onChange={update('provider')}>
            <option value="openai">ChatGPT / OpenAI</option>
            <option value="anthropic">Claude / Anthropic</option>
            <option value="copilot">Copilot / Azure OpenAI</option>
            <option value="gemini">Gemini / Google AI</option>
            <option value="custom">Custom endpoint</option>
          </select>
        </label>

        <label>
          API key / token
          <input type="password" value={llmSettings.apiKey} onChange={update('apiKey')} placeholder="Paste secret key or token" />
        </label>

        <label>
          Model
          <input value={llmSettings.model} onChange={update('model')} placeholder="gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-pro..." />
        </label>

        <label>
          API endpoint (optional)
          <input value={llmSettings.endpoint} onChange={update('endpoint')} placeholder="https://api.openai.com/v1/chat/completions" />
        </label>

        <label>
          Organization / tenant (optional)
          <input value={llmSettings.organization} onChange={update('organization')} placeholder="org_..., tenant id, project id" />
        </label>
      </div>

      <button className="primary" onClick={onSave}>Save integration settings</button>
      {llmSavedNotice && <p className="llm-saved">{llmSavedNotice}</p>}
    </section>
  )
}
