import React, { useEffect, useRef, useState, Suspense } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * RemoteExtensionPage
 * 
 * Dynamically loads and renders a UI component from an extension.
 */
const RemoteExtensionPage = ({ componentUrl, libraryId }) => {
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);
  const mountRef = useRef(null);
  const unmountRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const loadComponent = async () => {
      try {
        // Load extension code via authenticated fetch, then import from a Blob URL.
        // This keeps extension assets behind auth. Extension bundles should be
        // self-contained (no additional chunk imports), otherwise relative imports
        // will fail from a blob: URL.
        const token = localStorage.getItem('df_token');
        if (!token) {
          throw new Error('Not authenticated');
        }

        const resp = await fetch(componentUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          cache: 'no-store'
        });

        if (!resp.ok) {
          throw new Error(`Failed to load extension module (${resp.status})`);
        }

        const code = await resp.text();
        const blob = new Blob([code], { type: 'text/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const module = await import(/* @vite-ignore */ blobUrl);
        URL.revokeObjectURL(blobUrl);
        
        if (!mounted) return;

        // Mode A: React component
        if (module.default) {
          setComponent(() => module.default);
          return;
        }

        // Mode B: vanilla mount(container, props) API
        if (typeof module.mount === 'function') {
          // Clear any previous React component
          setComponent(null);
          // Call mount once the container div exists
          requestAnimationFrame(() => {
            if (!mounted) return;
            try {
              if (!mountRef.current) {
                throw new Error('Extension mount container not available');
              }
              const maybeUnmount = module.mount(mountRef.current, { libraryId });
              unmountRef.current = typeof maybeUnmount === 'function' ? maybeUnmount : (module.unmount || null);
            } catch (e) {
              setError(e?.message || String(e));
            }
          });
          return;
        }

        throw new Error('Extension module must export default (React component) or mount(container, props)');
      } catch (err) {
        console.error(`Failed to load extension component from ${componentUrl}:`, err);
        if (mounted) {
          setError(err.message);
        }
      }
    };

    loadComponent();

    return () => {
      mounted = false;
      try {
        if (typeof unmountRef.current === 'function') {
          unmountRef.current();
        }
      } catch {
        // ignore
      }
    };
  }, [componentUrl]);

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error" variant="h6">Failed to load extension</Typography>
        <Typography variant="body2">{error}</Typography>
      </Box>
    );
  }

  // If module is using mount(), render a container.
  if (!Component) {
    return (
      <Box sx={{ p: 2 }}>
        <div ref={mountRef} />
      </Box>
    );
  }

  return (
    <Suspense fallback={<CircularProgress />}>
      <Component libraryId={libraryId} />
    </Suspense>
  );
};

export default RemoteExtensionPage;
