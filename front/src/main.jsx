import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import * as MUI from '@mui/material'
import * as MUIIcons from '@mui/icons-material'
import ReactECharts from 'echarts-for-react'
import chartComposerService from './services/chartComposerService.js'

// Expose host globals for dynamically-loaded extension modules.
// Extension assets import these via window.__DF instead of bundling their own copies.
window.__DF = {
  React,
  MUI,
  MUIIcons,
  ReactECharts,
  services: {
    chartComposer: chartComposerService,
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
