import React, { useState, useRef } from 'react';
import {
  Button,
  ButtonGroup,
  ClickAwayListener,
  Grow,
  Paper,
  Popper,
  MenuItem,
  MenuList,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import ImportChartButton from './ImportChartButton';

const AddChartButton = ({ onNewChart, onImportSuccess }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }
    setOpen(false);
  };

  const handleNewChart = () => {
    setOpen(false);
    onNewChart();
  };

  const handleImportClick = () => {
    setOpen(false);
    setShowImportDialog(true);
  };

  return (
    <>
      <ButtonGroup variant="contained" ref={anchorRef}>
        <Button
          startIcon={<AddIcon />}
          onClick={handleNewChart}
        >
          Add Chart
        </Button>
        <Button
          size="small"
          onClick={handleToggle}
        >
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Popper
        sx={{ zIndex: 1300 }}
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === 'bottom' ? 'center top' : 'center bottom',
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList autoFocusItem>
                  <MenuItem onClick={handleNewChart}>
                    <ListItemIcon>
                      <AddIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>New Chart</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={handleImportClick}>
                    <ListItemIcon>
                      <UploadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Import from File...</ListItemText>
                  </MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
      
      {showImportDialog && (
        <ImportChartButton 
          onImportSuccess={onImportSuccess}
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
        />
      )}
    </>
  );
};

export default AddChartButton;
