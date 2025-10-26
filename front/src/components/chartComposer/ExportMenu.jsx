import React from 'react';
import { Button, ButtonGroup } from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';

const ExportMenu = ({ onExportRaw, onExportTable }) => {
  return (
    <ButtonGroup variant="outlined" size="small">
      <Button startIcon={<DownloadIcon />} onClick={onExportRaw}>
        Export Raw CSV
      </Button>
      <Button startIcon={<DownloadIcon />} onClick={onExportTable}>
        Export Table CSV
      </Button>
    </ButtonGroup>
  );
};

export default ExportMenu;
