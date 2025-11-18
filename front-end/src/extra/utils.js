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

  // Trim and get words
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);

  // Find the first word that contains letters
  for (const word of words) {
    if (/[a-zA-Z]/.test(word)) {
      // Check if it contains Latin letters (English)
      return true;
    }
    if (/[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/.test(word)) {
      // Contains Hebrew, Arabic, or Syriac letters (RTL scripts)
      return false;
    }
  }

  return false;
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
