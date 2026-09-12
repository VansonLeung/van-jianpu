import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App';
import 'antd/dist/reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ConfigProvider theme={{ token: { colorPrimary: '#315eea', borderRadius: 6, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 13 } }}><AntApp><App /></AntApp></ConfigProvider></React.StrictMode>,
);
