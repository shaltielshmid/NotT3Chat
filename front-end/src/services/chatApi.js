import api from './api';

export const chatApi = {
  // Get all chats for the current user
  getChats: async () => {
    const response = await api.get('/chats');
    return response.data;
  },

  // Create a new chat
  createNewChat: async () => {
    const response = await api.post('/chats/new');
    return response.data; // Returns chatId as string
  },

  // Fork a chat from a specific message
  forkChat: async (conversationId, messageId) => {
    const response = await api.post('/chats/fork', {
      conversationId,
      messageId,
    });
    return response.data;
  },

  // Delete a chat
  deleteChat: async (conversationId) => {
    await api.delete(`/chats/${conversationId}`);
  },
};
