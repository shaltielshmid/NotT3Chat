import { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import lcn from 'light-classnames';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Box,
  IconButton,
  Divider,
  CircularProgress,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Chat as ChatIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useChats } from '../contexts/ChatContext';
import { formatDate } from '../extra/utils';
import './ChatSidebar.css';

const ChatSidebar = ({
  onChatSelect,
  currentChatId,
  mobileOpen,
  onMobileClose,
}) => {
  const { chats, loading, error, hasLoaded, loadChats, deleteChat } =
    useChats();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Load chats once when component mounts if not already loaded
  useEffect(() => {
    if (!hasLoaded) {
      loadChats();
    }
  }, [hasLoaded, loadChats]);

  const handleNewChat = useCallback(() => {
    onChatSelect(null); // null indicates new chat
  }, [onChatSelect]);

  const handleChatClick = useCallback(
    (chatId) => {
      onChatSelect(chatId);
    },
    [onChatSelect]
  );

  const handleDeleteChat = useCallback(
    async (event, chatId) => {
      event.stopPropagation(); // Prevent triggering chat selection
      const success = await deleteChat(chatId);
      if (success && currentChatId === chatId) {
        // If we deleted the currently selected chat, navigate to new chat
        onChatSelect(null);
      }
    },
    [deleteChat, currentChatId, onChatSelect]
  );

  const drawerContent = (
    <div className="chat-sidebar">
      <Box className="drawer-content">
        {/* Header */}
        <Box className="sidebar-header">
          <Typography variant="h6" component="div">
            Chats
          </Typography>
          <Box className="header-actions">
            <IconButton onClick={loadChats} size="small" title="Refresh chats">
              <ChatIcon />
            </IconButton>
            {isMobile && (
              <IconButton
                onClick={onMobileClose}
                size="small"
                title="Close sidebar"
                className="close-button"
              >
                <CloseIcon />
              </IconButton>
            )}
          </Box>
        </Box>

        {/* New Chat Button */}
        <Box className="new-chat-section">
          <ListItemButton onClick={handleNewChat} className="new-chat-button">
            <AddIcon className="new-chat-icon" />
            <ListItemText primary="New Chat" />
          </ListItemButton>
        </Box>

        <Divider />

        {/* Chat List */}
        <Box className="chat-list-container">
          {loading ? (
            <Box className="loading-container">
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Box className="error-container">
              <Alert severity="error">{error}</Alert>
            </Box>
          ) : chats.length === 0 ? (
            <Box className="empty-state">
              <ChatIcon className="empty-icon" />
              <Typography variant="body2">No chats yet</Typography>
              <Typography variant="caption">
                Start a new conversation!
              </Typography>
            </Box>
          ) : (
            <List className="chat-list">
              {chats.map((chat) => (
                <ListItem key={chat.id} disablePadding className="chat-item">
                  <ListItemButton
                    onClick={() => handleChatClick(chat.id)}
                    selected={currentChatId === chat.id}
                    className={lcn('chat-button', {
                      selected: currentChatId === chat.id,
                    })}
                  >
                    <Box className="chat-content">
                      <Typography
                        variant="body2"
                        className={lcn('chat-title', {
                          selected: currentChatId === chat.id,
                        })}
                      >
                        {chat.title}
                      </Typography>
                      <Typography variant="caption" className="chat-date">
                        {formatDate(chat.createdAt)}
                      </Typography>
                    </Box>
                    <Box className="chat-actions">
                      <IconButton
                        size="small"
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="delete-button"
                        title="Delete chat"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </div>
  );

  return (
    <>
      {/* Desktop Drawer - Permanent */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          anchor="left"
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: 300,
              top: '64px',
              height: 'calc(100vh - 64px)',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Mobile Drawer - Temporary */}
      {isMobile && (
        <Drawer
          variant="temporary"
          anchor="left"
          open={mobileOpen}
          onClose={onMobileClose}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile
          }}
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: 300,
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}
    </>
  );
};

ChatSidebar.propTypes = {
  onChatSelect: PropTypes.func.isRequired,
  currentChatId: PropTypes.string,
  mobileOpen: PropTypes.bool,
  onMobileClose: PropTypes.func,
};

export default ChatSidebar;
