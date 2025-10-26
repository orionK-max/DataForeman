import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Alert,
  Box,
  CircularProgress,
} from '@mui/material';
import { useChartComposer } from '../../contexts/ChartComposerContext';

const MAX_TAGS = 50;

const TagSelector = () => {
  const {
    savedTags,
    selectedTagIds,
    selectedConnectionId,
    loading,
    error,
    loadSavedTags,
    updateSelectedTags,
  } = useChartComposer();

  const [searchTerm, setSearchTerm] = React.useState('');
  const [filteredTags, setFilteredTags] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(100);

  // Load tags when connection changes
  React.useEffect(() => {
    if (selectedConnectionId) {
      loadSavedTags(selectedConnectionId);
    }
  }, [selectedConnectionId, loadSavedTags]);

  // Filter tags based on search term
  React.useEffect(() => {
    if (!searchTerm) {
      setFilteredTags(savedTags);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = savedTags.filter(
        (tag) =>
          tag.tag_name?.toLowerCase().includes(term) ||
          tag.tag_path?.toLowerCase().includes(term) ||
          tag.tag_id?.toString().includes(term)
      );
      setFilteredTags(filtered);
    }
    // Reset to first page when search changes
    setPage(0);
  }, [searchTerm, savedTags]);

  // Paginated tags for display
  const paginatedTags = React.useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredTags.slice(start, end);
  }, [filteredTags, page, rowsPerPage]);

  const handleToggle = (tagId) => {
    const currentIndex = selectedTagIds.indexOf(tagId);
    const newSelected = [...selectedTagIds];

    if (currentIndex === -1) {
      // Adding new tag - check max limit
      if (newSelected.length >= MAX_TAGS) {
        alert(`Maximum ${MAX_TAGS} tags allowed`);
        return;
      }
      newSelected.push(tagId);
    } else {
      // Removing tag
      newSelected.splice(currentIndex, 1);
    }

    updateSelectedTags(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTagIds.length === filteredTags.length) {
      // Deselect all
      updateSelectedTags([]);
    } else {
      // Select all (up to MAX_TAGS)
      const newSelected = filteredTags.slice(0, MAX_TAGS).map((tag) => tag.tag_id);
      updateSelectedTags(newSelected);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (!selectedConnectionId) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Tag Selection
          </Typography>
          <Alert severity="info">Please select a connection first</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Tag Selection
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Search Field */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 2 }}
          disabled={loading}
        />

        {/* Tag Count Info */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {selectedTagIds.length} / {MAX_TAGS} tags selected
            {filteredTags.length !== savedTags.length &&
              ` (${filteredTags.length} shown of ${savedTags.length} total)`}
          </Typography>
        </Box>

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Tags Table */}
        {!loading && filteredTags.length > 0 && (
          <>
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={
                          selectedTagIds.length > 0 &&
                          selectedTagIds.length < filteredTags.length
                        }
                        checked={
                          filteredTags.length > 0 &&
                          selectedTagIds.length === filteredTags.length
                        }
                        onChange={handleSelectAll}
                        disabled={loading}
                      />
                    </TableCell>
                    <TableCell>Tag Name</TableCell>
                    <TableCell>Path</TableCell>
                    <TableCell align="right">Poll Rate (ms)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedTags.map((tag) => {
                  const isSelected = selectedTagIds.indexOf(tag.tag_id) !== -1;
                  return (
                    <TableRow
                      key={tag.tag_id}
                      hover
                      onClick={() => handleToggle(tag.tag_id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      selected={isSelected}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isSelected}
                          disabled={
                            !isSelected && selectedTagIds.length >= MAX_TAGS
                          }
                        />
                      </TableCell>
                      <TableCell>{tag.tag_name || tag.tag_id}</TableCell>
                      <TableCell>{tag.tag_path || '-'}</TableCell>
                      <TableCell align="right">
                        {tag.poll_rate_ms || '-'}
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredTags.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[50, 100, 250, 500]}
            />
          </>
        )}

        {/* Empty State */}
        {!loading && filteredTags.length === 0 && savedTags.length > 0 && (
          <Alert severity="info">No tags match your search</Alert>
        )}

        {!loading && savedTags.length === 0 && (
          <Alert severity="info">No tags found for this connection</Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default TagSelector;
