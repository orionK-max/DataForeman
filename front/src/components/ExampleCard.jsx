import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

/**
 * Example reusable component
 * Use this as a template for creating new components
 */
const ExampleCard = ({ title, value, subtitle, icon }) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="overline">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box sx={{ color: 'primary.main' }}>
              {icon}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ExampleCard;
