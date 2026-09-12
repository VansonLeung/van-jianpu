import { useEffect } from 'react';
import { Alert, Button, Drawer, Form, Input, Space } from 'antd';
import type { LlmSettings, ServerSettings } from '../types/scanner';

export function LlmSettingsDrawer({ open, settings, defaults, onClose, onSave }: {
  open: boolean; settings: LlmSettings; defaults: ServerSettings | null;
  onClose: () => void; onSave: (settings: LlmSettings) => void;
}) {
  const [form] = Form.useForm<LlmSettings>();
  useEffect(() => { if (open) form.setFieldsValue(settings); }, [open, settings, form]);
  return <Drawer title="LLM settings" open={open} onClose={onClose} size={440}>
    <p className="settings-description">Use an OpenAI-compatible endpoint with a vision model.</p>
    <Form form={form} layout="vertical" onFinish={values => {
      onSave({ baseUrl: values.baseUrl.trim().replace(/\/+$/, ''), model: values.model.trim(), apiKey: values.apiKey?.trim() || '' }); onClose();
    }}>
      <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }, { validator: async (_, value) => {
        try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(); }
        catch { throw new Error('Enter an HTTP(S) base URL without credentials, a query, or a fragment.'); }
      } }]} extra="Include /v1 if your provider requires it."><Input placeholder="http://localhost:5321/v1" /></Form.Item>
      <Form.Item name="model" label="Vision model" rules={[{ required: true, whitespace: true }]}><Input placeholder="Model identifier" /></Form.Item>
      <Form.Item name="apiKey" label="API key" extra="An entered key is kept in memory for this session only. Leave blank to use the backend key at its default endpoint."><Input.Password autoComplete="off" placeholder={defaults?.hasApiKey ? 'Backend key configured' : 'Optional'} /></Form.Item>
      <Alert type="info" title="The base URL and model are saved in this browser. Image crops are sent to the configured provider when you scan." />
      <Space className="settings-actions">
        <Button type="primary" htmlType="submit">Save settings</Button>
        <Button disabled={!defaults} onClick={() => defaults && form.setFieldsValue({ baseUrl: defaults.baseUrl, model: defaults.model, apiKey: '' })}>Backend defaults</Button>
      </Space>
    </Form>
  </Drawer>;
}
