import PropTypes from 'prop-types';
import { useCallback, useMemo, useState } from 'react';
import lcn from 'light-classnames';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Person,
  SmartToy,
  ContentCopy,
  CallSplit,
  Refresh,
  KeyboardArrowDown,
} from '@mui/icons-material';
import { Streamdown } from 'streamdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import { useModels } from '../contexts/ModelsContext';
import { getTextDirection } from '../extra/utils';
import ThinkingBlock from './ThinkingBlock';
import WebSearchBlock from './WebSearchBlock';
import './ChatMessage.css';

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Convert LaTeX bracket syntax to dollar syntax for remark-math
const convertLatexBrackets = (text) => {
  if (!text) return text;

  // Convert \[ \] to $$ $$
  let result = text.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (match, content) => `$$${content}$$`
  );

  // Convert \( \) to $ $
  result = result.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (match, content) => `$${content}$`
  );

  return result;
};

const ChatMessage = ({
  message,
  selectedModel,
  onSetSelectedModel,
  onRegenerateMessage,
  onForkChat,
  isLastMessage,
}) => {
  const { models } = useModels();
  const customAssistantIcon = import.meta.env.VITE_CUSTOM_ASSISTANT_ICON_URL;
  const [regenerateMenuAnchor, setRegenerateMenuAnchor] = useState(null);
  const [copyMenuAnchor, setCopyMenuAnchor] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingRegenerate, setPendingRegenerate] = useState(null);
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);

  const USER_MESSAGE_CHAR_LIMIT = 2500;
  const isUser = useMemo(() => message.type === 'user', [message]);
  const isAssistant = useMemo(() => message.type === 'assistant', [message]);

  // Parse content to create interleaved segments of regular content, thinking blocks, and websearch blocks
  const contentSegments = useMemo(() => {
    if (!isAssistant) {
      return [{ type: 'content', content: message.content }];
    }

    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const webSearchRegex = /<WebSearch>([\s\S]*?)<\/WebSearch>/g;
    const segments = [];
    let lastIndex = 0;

    // Find all matches (both thinking and websearch) with their positions
    const allMatches = [];

    let thinkMatch;
    while ((thinkMatch = thinkRegex.exec(message.content)) !== null) {
      allMatches.push({
        type: 'thinking',
        index: thinkMatch.index,
        length: thinkMatch[0].length,
        content: thinkMatch[1].trim(),
        isComplete: true,
      });
    }

    let webSearchMatch;
    while ((webSearchMatch = webSearchRegex.exec(message.content)) !== null) {
      allMatches.push({
        type: 'websearch',
        index: webSearchMatch.index,
        length: webSearchMatch[0].length,
        content: webSearchMatch[1].trim(),
        isComplete: true,
      });
    }

    // Sort matches by position
    allMatches.sort((a, b) => a.index - b.index);

    // Process matches in order
    for (const match of allMatches) {
      // Add regular content before this block (if any)
      if (match.index > lastIndex) {
        const regularContent = message.content.slice(lastIndex, match.index);
        if (regularContent.trim()) {
          segments.push({
            type: 'content',
            content: regularContent,
          });
        }
      }

      // Add the block
      segments.push(match);

      lastIndex = match.index + match.length;
    }

    // Check for incomplete/streaming blocks (has opening tag but no closing tag)
    const remainingContent = message.content.slice(lastIndex);
    const incompleteThinkMatch = remainingContent.match(/<think>([\s\S]*)$/);
    const incompleteWebSearchMatch = remainingContent.match(
      /<WebSearch>([\s\S]*)$/
    );

    // Determine which incomplete block comes first (if any)
    let incompleteMatch = null;
    let incompleteType = null;

    if (incompleteThinkMatch && incompleteWebSearchMatch) {
      if (incompleteThinkMatch.index < incompleteWebSearchMatch.index) {
        incompleteMatch = incompleteThinkMatch;
        incompleteType = 'thinking';
      } else {
        incompleteMatch = incompleteWebSearchMatch;
        incompleteType = 'websearch';
      }
    } else if (incompleteThinkMatch) {
      incompleteMatch = incompleteThinkMatch;
      incompleteType = 'thinking';
    } else if (incompleteWebSearchMatch) {
      incompleteMatch = incompleteWebSearchMatch;
      incompleteType = 'websearch';
    }

    if (incompleteMatch && !message.isComplete) {
      // Add content before the incomplete tag (if any)
      const contentBeforeIncomplete = remainingContent.slice(
        0,
        incompleteMatch.index
      );
      if (contentBeforeIncomplete.trim()) {
        segments.push({
          type: 'content',
          content: contentBeforeIncomplete,
        });
      }

      // Add the incomplete block
      segments.push({
        type: incompleteType,
        content: incompleteMatch[1].trim(),
        isComplete: false,
      });
    } else if (remainingContent.trim()) {
      // Add remaining regular content after last block (if any)
      segments.push({
        type: 'content',
        content: remainingContent,
      });
    }

    return segments;
  }, [message.content, isAssistant, message.isComplete]);

  const hasThinkingBlocks = useMemo(() => {
    return contentSegments.some((seg) => seg.type === 'thinking');
  }, [contentSegments]);

  const hasWebSearchBlocks = useMemo(() => {
    return contentSegments.some((seg) => seg.type === 'websearch');
  }, [contentSegments]);

  const textDirection = useMemo(() => {
    // Get direction from first content segment
    const firstContent = contentSegments.find((seg) => seg.type === 'content');
    return firstContent ? getTextDirection(firstContent.content) : 'ltr';
  }, [contentSegments]);

  const handleCopyClick = useCallback(() => {
    if (hasThinkingBlocks || hasWebSearchBlocks) {
      // If there are thinking or websearch blocks, copy without them
      const contentOnly = contentSegments
        .filter((seg) => seg.type === 'content')
        .map((seg) => seg.content)
        .join('');
      navigator.clipboard.writeText(contentOnly);
    } else {
      // No special blocks, just copy everything
      navigator.clipboard.writeText(message.content);
    }
  }, [contentSegments, hasThinkingBlocks, hasWebSearchBlocks, message.content]);

  const handleCopyDropdownClick = useCallback((event) => {
    event.stopPropagation();
    setCopyMenuAnchor(event.currentTarget);
  }, []);

  const handleCloseCopyMenu = useCallback(() => {
    setCopyMenuAnchor(null);
  }, []);

  const handleCopyWithThinking = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopyMenuAnchor(null);
  }, [message.content]);

  const handleBranch = useCallback(() => {
    onForkChat(message.id);
  }, [onForkChat, message]);

  const handleRegenerateDropdownClick = useCallback((event) => {
    event.stopPropagation();
    setRegenerateMenuAnchor(event.currentTarget);
  }, []);

  const handleCloseRegenerateMenu = useCallback(() => {
    setRegenerateMenuAnchor(null);
  }, []);

  const handleRegenerate = useCallback(
    (modelName, messageId) => {
      if (isLastMessage) {
        // If this is the last message, regenerate directly
        onRegenerateMessage(modelName, messageId);
      } else {
        // If not the last message, show confirmation dialog
        setPendingRegenerate({ model: modelName, messageId });
        setConfirmDialogOpen(true);
      }
    },
    [onRegenerateMessage, isLastMessage]
  );

  const handleRegenerateClick = useCallback(() => {
    const modelToUse = message.chatModel || selectedModel;
    if (!modelToUse) return;

    handleRegenerate(modelToUse, message.id);
  }, [message.chatModel, selectedModel, handleRegenerate, message.id]);

  const handleRegenerateWithModel = useCallback(
    (modelName) => {
      onSetSelectedModel(modelName);
      setRegenerateMenuAnchor(null);

      handleRegenerate(modelName, message.id);
    },
    [handleRegenerate, message.id, onSetSelectedModel]
  );

  const handleConfirmRegenerate = useCallback(() => {
    if (pendingRegenerate) {
      onRegenerateMessage(pendingRegenerate.model, pendingRegenerate.messageId);
    }
    setConfirmDialogOpen(false);
    setPendingRegenerate(null);
  }, [pendingRegenerate, onRegenerateMessage]);

  const handleCancelRegenerate = useCallback(() => {
    setConfirmDialogOpen(false);
    setPendingRegenerate(null);
  }, []);

  const toggleUserMessageExpanded = useCallback(() => {
    setIsUserMessageExpanded((prev) => !prev);
  }, []);

  const shouldTruncateUserMessage = useMemo(() => {
    return isUser && message.content.length > USER_MESSAGE_CHAR_LIMIT;
  }, [isUser, message.content]);

  const displayedUserContent = useMemo(() => {
    if (!shouldTruncateUserMessage || isUserMessageExpanded) {
      return message.content;
    }
    return message.content.slice(0, USER_MESSAGE_CHAR_LIMIT);
  }, [shouldTruncateUserMessage, isUserMessageExpanded, message.content]);

  return (
    <div className="chat-message">
      <Box
        className={lcn('message-container', {
          user: isUser,
          assistant: isAssistant,
        })}
      >
        <Box
          className={lcn('message-content', {
            user: isUser,
            assistant: isAssistant,
          })}
        >
          {/* Avatar */}
          <Box
            className={lcn('avatar', {
              user: isUser,
              assistant: isAssistant,
            })}
          >
            {isUser ? (
              <Person fontSize="small" />
            ) : customAssistantIcon ? (
              <img
                src={customAssistantIcon}
                alt="Assistant"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                }}
              />
            ) : (
              <SmartToy fontSize="small" />
            )}
          </Box>

          {/* Message Content */}
          <Paper
            elevation={1}
            className={lcn('message-paper', {
              user: isUser,
              assistant: isAssistant,
              complete: isAssistant && message.isComplete,
              incomplete: isAssistant && !message.isComplete,
            })}
          >
            {/* Interleaved Content, Thinking Blocks, and WebSearch Blocks */}
            {contentSegments.map((segment, index) => {
              if (segment.type === 'thinking') {
                return (
                  <ThinkingBlock
                    key={`thinking-${index}`}
                    content={segment.content}
                    isComplete={segment.isComplete}
                  />
                );
              } else if (segment.type === 'websearch') {
                return (
                  <WebSearchBlock
                    key={`websearch-${index}`}
                    urls={segment.content}
                    isComplete={segment.isComplete}
                  />
                );
              } else {
                return (
                  <div
                    key={`content-${index}`}
                    className="markdown-content"
                    dir={textDirection}
                  >
                    {isAssistant ? (
                      <Streamdown
                        isAnimating={
                          !message.isComplete &&
                          index === contentSegments.length - 1
                        }
                        parseIncompleteMarkdown={true}
                        remarkPlugins={[
                          [remarkGfm, { singleTilde: false }],
                          [
                            remarkMath,
                            {
                              singleDollarTextMath: true,
                            },
                          ],
                          remarkBreaks,
                        ]}
                      >
                        {convertLatexBrackets(segment.content) || ''}
                      </Streamdown>
                    ) : (
                      <>
                        <Typography
                          variant="body1"
                          style={{ whiteSpace: 'pre-wrap' }}
                        >
                          {displayedUserContent}
                          {shouldTruncateUserMessage &&
                            !isUserMessageExpanded &&
                            '...'}
                        </Typography>
                        {shouldTruncateUserMessage && (
                          <Button
                            size="small"
                            onClick={toggleUserMessageExpanded}
                            sx={{
                              mt: 1,
                              textTransform: 'none',
                              color: 'white',
                              '&:hover': {
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              },
                            }}
                          >
                            {isUserMessageExpanded ? 'Show less' : 'Show more'}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                );
              }
            })}

            {/* Loading indicator for incomplete assistant messages */}
            {isAssistant && !message.isComplete && (
              <Box className="loading-indicator">
                <CircularProgress size={16} className="spinner" />
                <Typography variant="caption" color="text.secondary">
                  Thinking...
                </Typography>
              </Box>
            )}

            {/* Error Display */}
            {message.finishError && (
              <Box className="error-message">
                <Typography variant="caption" color="error">
                  {message.finishError}
                </Typography>
              </Box>
            )}

            {/* Model Info and Timestamp */}
            <Box className="message-footer">
              <Box className="message-meta">
                {message.chatModel && (
                  <Chip
                    label={message.chatModel}
                    size="small"
                    variant="outlined"
                    className="model-chip"
                  />
                )}
                <Typography
                  variant="caption"
                  className={lcn('timestamp', {
                    user: isUser,
                    assistant: isAssistant,
                  })}
                >
                  {formatTime(message.timestamp)}
                </Typography>
              </Box>

              {/* Action Icons for Assistant Messages */}
              {isAssistant && message.isComplete && (
                <Box
                  className={lcn('message-actions', {
                    'force-visible':
                      Boolean(regenerateMenuAnchor) || Boolean(copyMenuAnchor),
                  })}
                >
                  <Tooltip
                    title={
                      hasThinkingBlocks || hasWebSearchBlocks
                        ? 'Copy (content only)'
                        : 'Copy'
                    }
                  >
                    <IconButton size="small" onClick={handleCopyClick}>
                      <ContentCopy fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {(hasThinkingBlocks || hasWebSearchBlocks) && (
                    <>
                      <IconButton
                        size="small"
                        onClick={handleCopyDropdownClick}
                        className="copy-dropdown"
                      >
                        <KeyboardArrowDown fontSize="small" />
                      </IconButton>

                      {/* Copy Menu */}
                      <Menu
                        anchorEl={copyMenuAnchor}
                        open={Boolean(copyMenuAnchor)}
                        onClose={handleCloseCopyMenu}
                        anchorOrigin={{
                          vertical: 'top',
                          horizontal: 'left',
                        }}
                        transformOrigin={{
                          vertical: 'bottom',
                          horizontal: 'left',
                        }}
                      >
                        <MenuItem onClick={handleCopyWithThinking}>
                          <Typography variant="body2">
                            Copy everything
                          </Typography>
                        </MenuItem>
                      </Menu>
                    </>
                  )}

                  <Tooltip title="Branch">
                    <IconButton size="small" onClick={handleBranch}>
                      <CallSplit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Regenerate">
                    <IconButton size="small" onClick={handleRegenerateClick}>
                      <Refresh fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton
                    size="small"
                    onClick={handleRegenerateDropdownClick}
                    className="regenerate-dropdown"
                  >
                    <KeyboardArrowDown fontSize="small" />
                  </IconButton>

                  {/* Regenerate Model Selection Menu */}
                  <Menu
                    anchorEl={regenerateMenuAnchor}
                    open={Boolean(regenerateMenuAnchor)}
                    onClose={handleCloseRegenerateMenu}
                    anchorOrigin={{
                      vertical: 'top',
                      horizontal: 'left',
                    }}
                    transformOrigin={{
                      vertical: 'bottom',
                      horizontal: 'left',
                    }}
                  >
                    {models.map((model) => (
                      <MenuItem
                        key={model.name}
                        onClick={() => handleRegenerateWithModel(model.name)}
                        selected={model.name === selectedModel}
                      >
                        <Typography variant="body2">{model.name}</Typography>
                      </MenuItem>
                    ))}
                  </Menu>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Regenerate Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelRegenerate}
        aria-labelledby="regenerate-dialog-title"
        aria-describedby="regenerate-dialog-description"
      >
        <DialogTitle id="regenerate-dialog-title">
          Regenerate Message
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="regenerate-dialog-description">
            This will regenerate this message and{' '}
            <strong>delete all messages that come after it</strong> in the
            conversation. This action cannot be undone.
            <br />
            <br />
            Are you sure you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelRegenerate} color="primary">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRegenerate}
            color="error"
            variant="contained"
          >
            Regenerate & Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

ChatMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    type: PropTypes.oneOf(['user', 'assistant']).isRequired,
    content: PropTypes.string.isRequired,
    timestamp: PropTypes.instanceOf(Date).isRequired,
    isComplete: PropTypes.bool.isRequired,
    chatModel: PropTypes.string,
    finishError: PropTypes.string,
  }).isRequired,
  selectedModel: PropTypes.string,
  onSetSelectedModel: PropTypes.func,
  onRegenerateMessage: PropTypes.func,
  onForkChat: PropTypes.func,
  isLastMessage: PropTypes.bool,
};

export default ChatMessage;
