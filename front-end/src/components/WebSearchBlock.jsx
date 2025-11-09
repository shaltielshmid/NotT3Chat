import PropTypes from 'prop-types';
import { useCallback, useMemo, useState } from 'react';
import lcn from 'light-classnames';
import { 
  Box, 
  Typography, 
  CircularProgress, 
  Collapse,
  Link
} from '@mui/material';
import { 
  ExpandMore,
  ExpandLess,
  Search
} from '@mui/icons-material';
import './WebSearchBlock.css';

const WebSearchBlock = ({ urls, isComplete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const urlList = useMemo(() => {
    if (!urls || urls.trim() === '') return [];
    try {
      return JSON.parse(urls);
    } catch {
      return [];
    }
  }, [urls]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const hasUrls = urlList.length > 0;

  return (
    <Box className="websearch-block-container">
      <Box 
        className={lcn('websearch-block-header', { 
          expanded: isExpanded, 
          complete: isComplete,
          clickable: hasUrls 
        })}
        onClick={hasUrls ? toggleExpanded : undefined}
        style={{ cursor: hasUrls ? 'pointer' : 'default' }}
      >
        <Box className="websearch-header-content">
          {!isComplete && (
            <CircularProgress size={14} className="websearch-spinner" />
          )}
          <Search fontSize="small" className="websearch-icon" />
          <Typography variant="caption" className="websearch-label">
            {isComplete 
              ? (hasUrls ? `Found ${urlList.length} result${urlList.length !== 1 ? 's' : ''}` : 'Searched the web')
              : 'Searching the web...'
            }
          </Typography>
        </Box>
        {hasUrls && (isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />)}
      </Box>
      
      {hasUrls && (
        <Collapse in={isExpanded}>
          <Box className="websearch-block-content">
            <Box className="websearch-urls-list">
              {urlList.map((url, index) => (
                <Box key={index} className="websearch-url-item">
                  <Typography variant="caption" className="websearch-url-number">
                    {index + 1}.
                  </Typography>
                  <Link 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="websearch-url-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Typography variant="body2" className="websearch-url-text">
                      {url}
                    </Typography>
                  </Link>
                </Box>
              ))}
            </Box>
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

WebSearchBlock.propTypes = {
  urls: PropTypes.string.isRequired,
  isComplete: PropTypes.bool.isRequired,
};

export default WebSearchBlock;
