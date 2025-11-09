export const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
  }
};

/**
 * Detects if the first word of a text is in English (Latin characters)
 * @param {string} text - The text to check
 * @returns {boolean} - True if first word is English, false otherwise
 */
export const isFirstWordEnglish = (text) => {
  if (!text || typeof text !== 'string') return false;
  
  // Trim and get the first word
  const trimmed = text.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  
  if (!firstWord) return false;
  
  // Check if the first character is a Latin letter (English)
  const firstChar = firstWord.charAt(0);
  return /[a-zA-Z]/.test(firstChar);
};

/**
 * Determines the text direction based on the first word
 * Default is RTL, but switches to LTR if first word is English
 * @param {string} text - The text to check
 * @returns {'ltr'|'rtl'} - The text direction
 */
export const getTextDirection = (text) => {
  return isFirstWordEnglish(text) ? 'ltr' : 'rtl';
};
