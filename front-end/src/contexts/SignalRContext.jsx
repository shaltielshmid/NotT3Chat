import PropTypes from 'prop-types';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuth } from './AuthContext';
import { useChats } from './ChatContext';
import { useNavigate } from 'react-router-dom';

const SignalRContext = createContext();

export const useSignalR = () => {
  const context = useContext(SignalRContext);
  if (!context) {
    throw new Error('useSignalR must be used within a SignalRProvider');
  }
  return context;
};

const serverMessageToLocal = (serverMsg, isComplete = true) => ({
  id: serverMsg.id,
  index: serverMsg.index,
  type: serverMsg.role,
  content: serverMsg.content,
  timestamp: new Date(serverMsg.timestamp),
  isComplete,
  chatModel: serverMsg.chatModel || null,
  finishError: serverMsg.finishError || null,
});

const replaceOrAddMessage = (prevList, newMessage) => {
  const existingIndex = prevList.findIndex((msg) => msg.id === newMessage.id);
  if (existingIndex >= 0) {
    return [...prevList.slice(0, existingIndex), newMessage];
  }
  return [...prevList, newMessage];
};

export const SignalRProvider = ({ children }) => {
  const [connection, setConnection] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const currentChatId = useRef(null);
  const isInitializing = useRef(false);
  const navigate = useNavigate();

  const { isAuthenticated } = useAuth();
  const { addNewChat, updateChatTitle, deleteChat, loadChats } = useChats();
  const reconnectTimeoutRef = useRef(null);

  // Define event handlers as stable references outside of setupEventHandlers
  const handleConversationHistory = useCallback((convoId, messages) => {
    if (convoId === currentChatId.current) {
      setMessages(messages.map((msg) => serverMessageToLocal(msg)));
    }
  }, []);

  const handleUserMessage = useCallback((convoId, message) => {
    if (convoId === currentChatId.current) {
      setMessages((prev) =>
        replaceOrAddMessage(prev, serverMessageToLocal(message))
      );
    }
  }, []);

  const handleBeginAssistantMessage = useCallback((convoId, message) => {
    if (convoId === currentChatId.current) {
      const newMessage = serverMessageToLocal(message, false);
      setCurrentAssistantMessage(newMessage);
      setMessages((prev) => replaceOrAddMessage(prev, newMessage));
    }
  }, []);

  const handleNewAssistantPart = useCallback((convoId, text) => {
    if (convoId === currentChatId.current) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === 'assistant' && !msg.isComplete
            ? { ...msg, content: msg.content + text }
            : msg
        )
      );
      setCurrentAssistantMessage((prev) =>
        prev ? { ...prev, content: prev.content + text } : prev
      );
    }
  }, []);

  const handleEndAssistantMessage = useCallback((convoId, finishError) => {
    if (convoId === currentChatId.current) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === 'assistant' && !msg.isComplete
            ? { ...msg, isComplete: true, finishError: finishError || null }
            : msg
        )
      );
      setCurrentAssistantMessage(null);
    }
  }, []);

  const handleRegenerateMessage = useCallback((convoId, messageId) => {
    if (convoId === currentChatId.current) {
      setMessages((prev) => {
        const messageIndex = prev.findIndex((msg) => msg.id === messageId);
        if (messageIndex >= 0) {
          return prev.slice(0, messageIndex);
        }
        return prev;
      });
      setCurrentAssistantMessage(null);
    }
  }, []);

  const handleChatTitle = useCallback(
    (titleChatId, title) => {
      updateChatTitle(titleChatId, title);
    },
    [updateChatTitle]
  );

  const handleNewConversation = useCallback(
    (convo) => {
      addNewChat(convo);
    },
    [addNewChat]
  );

  const handleDeleteConversation = useCallback(
    async (convoId) => {
      await deleteChat(convoId, false);
    },
    [deleteChat]
  );

  const handleClose = useCallback(() => {
    setIsConnected(false);
    setConnection(null);
  }, []);

  const handleReconnected = useCallback(() => {
    setIsConnected(true);
    setConnectionError(null);
    // Reload chats when reconnecting to get any updates that happened while disconnected
    loadChats();
    if (currentChatId.current) {
      connection
        ?.invoke('ChooseChat', currentChatId.current)
        .catch(() => navigate('/chat'));
    }
  }, [connection, navigate, loadChats]);

  const handleReconnecting = useCallback(() => {
    setIsConnected(false);
  }, []);

  const setupEventHandlers = useCallback(
    (conn) => {
      // Clean up any existing handlers
      conn.off('ConversationHistory');
      conn.off('UserMessage');
      conn.off('BeginAssistantMessage');
      conn.off('NewAssistantPart');
      conn.off('EndAssistantMessage');
      conn.off('RegenerateMessage');
      conn.off('ChatTitle');
      conn.off('NewConversation');
      conn.off('DeleteConversation');

      // Set up new handlers
      conn.on('ConversationHistory', handleConversationHistory);
      conn.on('UserMessage', handleUserMessage);
      conn.on('BeginAssistantMessage', handleBeginAssistantMessage);
      conn.on('NewAssistantPart', handleNewAssistantPart);
      conn.on('EndAssistantMessage', handleEndAssistantMessage);
      conn.on('RegenerateMessage', handleRegenerateMessage);
      conn.on('ChatTitle', handleChatTitle);
      conn.on('NewConversation', handleNewConversation);
      conn.on('DeleteConversation', handleDeleteConversation);

      conn.onclose(handleClose);
      conn.onreconnected(handleReconnected);
      conn.onreconnecting(handleReconnecting);
    },
    [
      handleConversationHistory,
      handleUserMessage,
      handleBeginAssistantMessage,
      handleNewAssistantPart,
      handleEndAssistantMessage,
      handleRegenerateMessage,
      handleChatTitle,
      handleNewConversation,
      handleDeleteConversation,
      handleClose,
      handleReconnected,
      handleReconnecting,
    ]
  );

  const closeConnection = useCallback(() => {
    if (connection) {
      connection.stop();
      setConnection(null);
    }
    setIsConnected(false);
    setIsConnecting(false);
    setMessages([]);
    setCurrentAssistantMessage(null);
    setConnectionError(null);
    isInitializing.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, [connection]);

  const chooseChat = useCallback(
    async (chatId) => {
      if (!connection || !isConnected) {
        currentChatId.current = chatId;
        return;
      }

      try {
        currentChatId.current = chatId;
        setMessages([]);
        setCurrentAssistantMessage(null);

        if (chatId) {
          try {
            await connection.invoke('ChooseChat', chatId);
          } catch {
            navigate('/chat');
          }
        }
      } catch (error) {
        console.error('Error choosing chat:', error);
      }
    },
    [connection, isConnected, navigate]
  );

  const sendMessage = useCallback(
    async (model, message) => {
      if (connection && isConnected && currentChatId.current) {
        try {
          await connection.invoke('NewMessage', model, message);
        } catch (error) {
          console.error('Error sending message:', error);
        }
      }
    },
    [connection, isConnected]
  );

  const regenerateMessage = useCallback(
    async (model, messageId) => {
      if (connection && isConnected && currentChatId.current) {
        try {
          await connection.invoke('RegenerateMessage', model, messageId);
        } catch (error) {
          console.error('Error regenerating message:', error);
        }
      }
    },
    [connection, isConnected]
  );

  const stopGenerating = useCallback(async () => {
    if (connection && isConnected && currentChatId.current) {
      try {
        await connection.invoke('StopGenerating');
      } catch (error) {
        console.error('Error stopping generation:', error);
      }
    }
  }, [connection, isConnected]);

  const initializeConnection = useCallback(() => {
    if (connection || isInitializing.current) return;

    isInitializing.current = true;
    setIsConnecting(true);
    setConnectionError(null);

    const url = `${import.meta.env.VITE_API_URL}/chat`;

    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl(url, {
        withCredentials: true,
        transport:
          signalR.HttpTransportType.WebSockets |
          signalR.HttpTransportType.LongPolling,
        skipNegotiation: false,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          if (retryContext.elapsedTime < 60000) {
            return Math.random() * 10000;
          } else {
            return null;
          }
        },
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    setupEventHandlers(newConnection);

    newConnection
      .start()
      .then(() => {
        setConnection(newConnection);
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        isInitializing.current = false;
      })
      .catch((error) => {
        console.error('SignalR connection error:', error);
        setConnectionError(error.message);
        setIsConnecting(false);
        isInitializing.current = false;
        if (error.statusCode === 401) {
          console.error(
            'SignalR authentication failed - cookies may not be properly configured'
          );
        }
      });
  }, [connection, setupEventHandlers]);

  const reconnect = useCallback(() => {
    if (isConnecting) return; // Already connecting, don't start another

    // Force close any existing connection
    closeConnection();
    // Reload chats when manually reconnecting
    loadChats();
    initializeConnection();
  }, [isConnecting, closeConnection, initializeConnection, loadChats]);

  // Initialize connection when authenticated
  useEffect(() => {
    if (isAuthenticated && !connection) {
      initializeConnection();
    } else if (!isAuthenticated && connection) {
      closeConnection();
    }
  }, [isAuthenticated, initializeConnection, closeConnection, connection]);

  // Clean up connection on page unload
  useEffect(() => {
    return () => {
      // Also clean up when component unmounts
      if (connection) {
        connection.stop();
      }
    };
  }, [connection]);

  const value = useMemo(
    () => ({
      // Connection state
      isConnected,
      isConnecting,
      connectionError,

      // Chat state
      messages,
      currentAssistantMessage,

      // Actions
      chooseChat,
      sendMessage,
      regenerateMessage,
      stopGenerating,
      reconnect,
    }),
    [
      isConnected,
      isConnecting,
      connectionError,
      messages,
      currentAssistantMessage,
      chooseChat,
      sendMessage,
      regenerateMessage,
      stopGenerating,
      reconnect,
    ]
  );

  return (
    <SignalRContext.Provider value={value}>{children}</SignalRContext.Provider>
  );
};

SignalRProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
