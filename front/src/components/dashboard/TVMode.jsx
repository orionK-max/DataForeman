import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  IconButton,
  Typography,
  Fab,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  ExitToApp,
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  Settings,
} from '@mui/icons-material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import DashboardWidget from './DashboardWidget';

const ResponsiveGridLayout = WidthProvider(Responsive);

const TVMode = ({ 
  dashboards, 
  currentIndex, 
  onIndexChange, 
  rotationInterval = 10,
  autoRotate = true,
  onExit,
  currentDashboard,
  layout,
}) => {
  const [paused, setPaused] = useState(!autoRotate);
  const [showControls, setShowControls] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(rotationInterval);

  // Auto-hide controls after 3 seconds of no mouse movement
  useEffect(() => {
    let timeout;
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  // Auto-rotation timer
  useEffect(() => {
    if (paused || dashboards.length <= 1) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleNext();
          return rotationInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [paused, dashboards.length, rotationInterval]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e) => {
      switch (e.key) {
        case 'Escape':
          onExit();
          break;
        case ' ':
          setPaused(prev => !prev);
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case 'ArrowLeft':
          handlePrevious();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onExit]);

  const handleNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % dashboards.length;
    onIndexChange(nextIndex);
    setTimeRemaining(rotationInterval);
  }, [currentIndex, dashboards.length, onIndexChange, rotationInterval]);

  const handlePrevious = useCallback(() => {
    const prevIndex = (currentIndex - 1 + dashboards.length) % dashboards.length;
    onIndexChange(prevIndex);
    setTimeRemaining(rotationInterval);
  }, [currentIndex, dashboards.length, onIndexChange, rotationInterval]);

  const handleTogglePause = () => {
    setPaused(prev => !prev);
    setTimeRemaining(rotationInterval);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: 'background.default',
        zIndex: 9999,
      }}
    >
      {/* Dashboard Content */}
      <Box sx={{ width: '100%', height: '100%', overflow: 'auto', p: 2 }}>
        {layout.items.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="h5" color="text.secondary">
              No widgets in this dashboard
            </Typography>
          </Box>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={{ lg: layout.items }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={layout.row_height || 80}
            isDraggable={false}
            isResizable={false}
            compactType={null}
            preventCollision={false}
          >
            {layout.items.map(item => (
              <div key={item.i}>
                <DashboardWidget
                  widgetConfig={item}
                  syncGroupIndex={null}
                />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </Box>

      {/* Controls Overlay */}
      {showControls && (
        <>
          {/* Top Bar */}
          <Paper
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              p: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              bgcolor: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(10px)',
              zIndex: 10000,
            }}
            elevation={3}
          >
            <Box>
              <Typography variant="h6" color="white">
                {currentDashboard?.name || 'Dashboard'}
              </Typography>
              <Typography variant="caption" color="rgba(255,255,255,0.7)">
                Dashboard {currentIndex + 1} of {dashboards.length}
                {!paused && ` • Next in ${timeRemaining}s`}
              </Typography>
            </Box>
            <IconButton onClick={onExit} sx={{ color: 'white' }}>
              <ExitToApp />
            </IconButton>
          </Paper>

          {/* Bottom Controls */}
          <Box
            sx={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 1,
              zIndex: 10000,
            }}
          >
            <Tooltip title="Previous Dashboard">
              <span>
                <Fab 
                  size="small" 
                  onClick={handlePrevious}
                  disabled={dashboards.length <= 1}
                >
                  <SkipPrevious />
                </Fab>
              </span>
            </Tooltip>
            
            <Tooltip title={paused ? 'Play' : 'Pause'}>
              <span>
                <Fab 
                  size="medium" 
                  color="primary"
                  onClick={handleTogglePause}
                  disabled={dashboards.length <= 1}
                >
                  {paused ? <PlayArrow /> : <Pause />}
                </Fab>
              </span>
            </Tooltip>
            
            <Tooltip title="Next Dashboard">
              <span>
                <Fab 
                  size="small" 
                  onClick={handleNext}
                  disabled={dashboards.length <= 1}
                >
                  <SkipNext />
                </Fab>
              </span>
            </Tooltip>
          </Box>

          {/* Exit Hint */}
          <Typography
            variant="caption"
            sx={{
              position: 'fixed',
              bottom: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.7)',
              bgcolor: 'rgba(0,0,0,0.5)',
              px: 2,
              py: 1,
              borderRadius: 1,
              zIndex: 10000,
            }}
          >
            Press ESC to exit • Space to pause • Arrow keys to navigate
          </Typography>
        </>
      )}
    </Box>
  );
};

export default TVMode;
