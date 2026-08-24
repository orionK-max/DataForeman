import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import * as MUI from '@mui/material'
import * as MUIIcons from '@mui/icons-material'
import ReactECharts from 'echarts-for-react'
import chartComposerService from './services/chartComposerService.js'
import connectivityService from './services/connectivityService.js'

// Expose host globals for dynamically-loaded extension modules.
// Extension assets import these via window.__DF instead of bundling their own copies.
window.__DF = {
  React,
  MUI,
  MUIIcons,
  ReactECharts,
  services: {
    chartComposer: chartComposerService,
    // Used by connectivity-driver-form extensions (installable-drivers framework, Phase 0)
    // for saveConnection/driverRpc calls, e.g. testing a device connection before saving.
    connectivity: connectivityService,
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
