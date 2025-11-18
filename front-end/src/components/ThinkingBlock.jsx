import PropTypes from 'prop-types';
import { useCallback, useMemo, useState, useEffect } from 'react';
import lcn from 'light-classnames';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Collapse,
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { getTextDirection } from '../extra/utils';
import './ThinkingBlock.css';

const countWords = (text) => {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
};

const ThinkingBlock = ({ content, isComplete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  const [hasAccepted, setHasAccepted] = useState(false);
  const wordCount = useMemo(() => countWords(content), [content]);
  const textDirection = useMemo(() => getTextDirection(content), [content]);

  useEffect(() => {
    const accepted = localStorage.getItem('thinkingTracesAccepted');
    if (accepted === 'true') {
      setHasAccepted(true);
      setShowWarning(false);
    }
  }, []);

  const handleAcceptWarning = useCallback(() => {
    localStorage.setItem('thinkingTracesAccepted', 'true');
    setHasAccepted(true);
    setShowWarning(false);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <Box className="thinking-block-container">
      <Box
        className={lcn('thinking-block-header', {
          expanded: isExpanded,
          complete: isComplete,
        })}
        onClick={toggleExpanded}
      >
        <Box className="thinking-header-content">
          {!isComplete && (
            <CircularProgress size={14} className="thinking-spinner" />
          )}
          <Typography variant="caption" className="thinking-label">
            {isComplete
              ? `Thought for ${wordCount} words`
              : `Thinking... (${wordCount} words)`}
          </Typography>
        </Box>
        {isExpanded ? (
          <ExpandLess fontSize="small" />
        ) : (
          <ExpandMore fontSize="small" />
        )}
      </Box>

      <Collapse in={isExpanded}>
        <Box className="thinking-block-content">
          {showWarning && !hasAccepted ? (
            <Box className="thinking-warning">
              <Typography variant="body2" className="warning-text">
                <strong>Warning / אזהרה</strong>
              </Typography>
              <Typography variant="body2" className="warning-text">
                The thinking traces are often incoherent or don&apos;t make
                sense to humans. There is no guarantee they will be useful or
                accurate.
              </Typography>
              <Typography variant="body2" className="warning-text" dir="rtl">
                תיעוד החשיבה לעיתים קרובות אינו קוהרנטי או אינו הגיוני לבני אדם.
                אין ערובה שהוא יהיה שימושי או מדויק
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={handleAcceptWarning}
                className="warning-accept-button"
              >
                I Understand / אני מבין/ה
              </Button>
            </Box>
          ) : (
            <Box
              className={lcn('thinking-content-inner', {
                blurred: showWarning,
              })}
            >
              <Typography
                variant="body2"
                component="div"
                dir={textDirection}
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                }}
              >
                {content.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < content.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

ThinkingBlock.propTypes = {
  content: PropTypes.string.isRequired,
  isComplete: PropTypes.bool.isRequired,
};

export default ThinkingBlock;
