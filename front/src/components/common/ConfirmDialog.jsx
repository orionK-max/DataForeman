import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress
} from '@mui/material';

/**
 * Reusable confirmation dialog component
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether dialog is open
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Confirmation message
 * @param {Function} props.onConfirm - Callback when confirmed
 * @param {Function} props.onCancel - Callback when cancelled
 * @param {boolean} props.loading - Whether action is in progress
 * @param {string} props.confirmText - Text for confirm button (default: "Confirm")
 * @param {string} props.confirmColor - Color for confirm button (default: "error")
 */
export default function ConfirmDialog({
  open,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  onConfirm,
  onCancel,
  loading = false,
  confirmText = 'Confirm',
  confirmColor = 'error'
}) {
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          color={confirmColor}
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Working...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
