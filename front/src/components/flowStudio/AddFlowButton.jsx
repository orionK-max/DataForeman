import React, { useState } from 'react';
import {
  Button,
  ButtonGroup,
  ClickAwayListener,
  Grow,
  Paper,
  Popper,
  MenuItem,
  MenuList,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import ImportFlowButton from './ImportFlowButton';

const AddFlowButton = ({ onNewFlow, onImportSuccess }) => {
  const [open, setOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const anchorRef = React.useRef(null);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }
    setOpen(false);
  };

  const handleNewFlow = () => {
    setOpen(false);
    if (onNewFlow) {
      onNewFlow();
    }
  };

  const handleImportClick = () => {
    setOpen(false);
    setImportDialogOpen(true);
  };

  const handleImportDialogClose = () => {
    setImportDialogOpen(false);
  };

  const handleImportSuccess = (flow) => {
    setImportDialogOpen(false);
    if (onImportSuccess) {
      onImportSuccess(flow);
    }
  };

  return (
    <>
      <ButtonGroup variant="contained" ref={anchorRef}>
        <Button startIcon={<AddIcon />} onClick={handleNewFlow}>
          Create Flow
        </Button>
        <Button
          size="small"
          onClick={handleToggle}
          sx={{ px: 1 }}
        >
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        placement="bottom-end"
        transition
        disablePortal
        sx={{ zIndex: 1300 }}
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin: placement === 'bottom-end' ? 'right top' : 'right bottom',
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList autoFocusItem={open} id="split-button-menu">
                  <MenuItem onClick={handleNewFlow}>
                    <AddIcon fontSize="small" sx={{ mr: 1 }} />
                    New Flow
                  </MenuItem>
                  <MenuItem onClick={handleImportClick}>
                    <UploadIcon fontSize="small" sx={{ mr: 1 }} />
                    Import from File...
                  </MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>

      <ImportFlowButton
        open={importDialogOpen}
        onClose={handleImportDialogClose}
        onImportSuccess={handleImportSuccess}
      />
    </>
  );
};

export default AddFlowButton;
