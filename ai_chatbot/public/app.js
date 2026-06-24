document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatWidget = document.getElementById('chat-widget');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const typingIndicator = document.getElementById('typing-indicator');
  const suggestionChipsContainer = document.getElementById('suggestion-chips');
  const chipsNavigationContainer = document.querySelector('.chips-navigation-container');
  const leftArrowBtn = document.querySelector('.left-arrow');
  const rightArrowBtn = document.querySelector('.right-arrow');


  // Chat State
  let chatHistory = []; // format: { role: 'user' | 'model', text: string }

  // Initial domains suggestions (6 domains)
  const INITIAL_DOMAINS = [
    { label: 'Credit Card & Debt', query: 'I am facing issues with Credit Card & Debt.' },
    { label: 'Insurance Claims', query: 'I am facing issues with Insurance Claims.' },
    { label: 'NPA & Loan Default', query: 'I am facing issues with NPA & Loan Default.' },
    { label: 'Wealth & Securities', query: 'I am facing issues with Wealth & Securities.' },
    { label: 'Financial Crunch', query: 'I am experiencing a Financial Crunch.' },
    { label: 'Other', query: 'I am facing a different financial dispute.' }
  ];

  // Event Listeners
  chatToggleBtn.addEventListener('click', toggleChat);
  chatCloseBtn.addEventListener('click', toggleChat);
  chatForm.addEventListener('click', () => chatInput.focus());
  chatForm.addEventListener('submit', handleChatSubmit);

  // Click Event Listeners for Nav Arrows
  if (leftArrowBtn) {
    leftArrowBtn.addEventListener('click', () => {
      const scrollOffset = 200;
      suggestionChipsContainer.scrollBy({ left: -scrollOffset, behavior: 'smooth' });
    });
  }

  if (rightArrowBtn) {
    rightArrowBtn.addEventListener('click', () => {
      const scrollOffset = 200;
      suggestionChipsContainer.scrollBy({ left: scrollOffset, behavior: 'smooth' });
    });
  }

  // Scroll event listener on suggestion chips container
  if (suggestionChipsContainer) {
    suggestionChipsContainer.addEventListener('scroll', updateChipsNavigation);
  }
  window.addEventListener('resize', updateChipsNavigation);

  // Update nav arrows visibility based on scroll position and content size
  function updateChipsNavigation() {
    if (!suggestionChipsContainer || !leftArrowBtn || !rightArrowBtn) return;
    
    const scrollLeft = suggestionChipsContainer.scrollLeft;
    const maxScrollLeft = Math.max(0, suggestionChipsContainer.scrollWidth - suggestionChipsContainer.clientWidth);
    const hasScroll = suggestionChipsContainer.scrollWidth > suggestionChipsContainer.clientWidth;
    
    if (!hasScroll) {
      leftArrowBtn.style.display = 'none';
      rightArrowBtn.style.display = 'none';
      if (chipsNavigationContainer) {
        chipsNavigationContainer.classList.remove('show-left', 'show-right');
      }
      return;
    }
    
    // Left arrow visibility: hide if container is scrolled completely to the left
    if (scrollLeft > 2) {
      leftArrowBtn.style.display = 'flex';
      if (chipsNavigationContainer) chipsNavigationContainer.classList.add('show-left');
    } else {
      leftArrowBtn.style.display = 'none';
      if (chipsNavigationContainer) chipsNavigationContainer.classList.remove('show-left');
    }
    
    // Right arrow visibility: hide if reaches the maximum scrollable width on the right
    if (maxScrollLeft - scrollLeft > 2) {
      rightArrowBtn.style.display = 'flex';
      if (chipsNavigationContainer) chipsNavigationContainer.classList.add('show-right');
    } else {
      rightArrowBtn.style.display = 'none';
      if (chipsNavigationContainer) chipsNavigationContainer.classList.remove('show-right');
    }
  }

  // Function to render suggestion chips dynamically
  function renderSuggestionChips(chips) {
    if (!suggestionChipsContainer) return;
    suggestionChipsContainer.innerHTML = '';
    
    if (!chips || chips.length === 0) {
      suggestionChipsContainer.style.display = 'none';
      if (chipsNavigationContainer) chipsNavigationContainer.style.display = 'none';
      return;
    }
    
    if (chipsNavigationContainer) {
      chipsNavigationContainer.style.display = 'flex';
    }
    suggestionChipsContainer.style.display = 'flex';

    // Suggestion Option Chips
    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn';
      btn.type = 'button';
      
      const labelText = typeof chip === 'string' ? chip : (chip.label || '');
      const queryText = typeof chip === 'string' ? chip : (chip.query || labelText);
      
      btn.textContent = labelText;
      btn.setAttribute('data-query', queryText);
      
      btn.addEventListener('click', () => {
        sendDirectQuery(queryText);
      });
      
      suggestionChipsContainer.appendChild(btn);
    });

    // Update arrows status after rendering
    setTimeout(updateChipsNavigation, 50);
  }

  // Render initial domains
  renderSuggestionChips(INITIAL_DOMAINS);

  // Toggle Chat Visibility
  function toggleChat() {
    chatWidget.classList.toggle('hidden');
    chatToggleBtn.classList.toggle('hidden');
    
    if (!chatWidget.classList.contains('hidden')) {
      chatInput.focus();
      scrollChatToBottom();
      updateChipsNavigation();
      setTimeout(updateChipsNavigation, 100);
      setTimeout(updateChipsNavigation, 300);
    }
  }

  // Handle Form Submit
  async function handleChatSubmit(e) {
    e.preventDefault();
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    // Clear input
    chatInput.value = '';

    // Append user message
    appendMessage('user', messageText);

    // Call Backend API
    await sendChatMessage(messageText);
  }

  // Send Direct Query from chips or buttons
  async function sendDirectQuery(queryText) {
    appendMessage('user', queryText);
    await sendChatMessage(queryText);
  }

  // Call Express /api/chat
  async function sendChatMessage(messageText) {
    showTypingIndicator();
    scrollChatToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageText,
          history: chatHistory
        })
      });

      if (!response.ok) {
        let errorMessage = 'Server responded with an error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch (_) {
          // Fallback if response is not JSON
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      hideTypingIndicator();

      if (data.error) {
        appendMessage('bot', `*Error:* ${data.error}`);
      } else {
        appendMessage('bot', data.text);
        
        // Update local chat history for subsequent turns
        chatHistory.push({ role: 'user', text: messageText });
        chatHistory.push({ role: 'model', text: data.text });

        // Update suggestion chips dynamically based on the AI's response
        if (data.suggestions && Array.isArray(data.suggestions)) {
          renderSuggestionChips(data.suggestions);
        } else {
          renderSuggestionChips([]);
        }
      }

    } catch (error) {
      console.error('Chat Error:', error);
      hideTypingIndicator();
      appendMessage('bot', `I am sorry, I am having trouble connecting to my service right now. (Error: ${error.message})`);
    }

    scrollChatToBottom();
  }

  // Append a message bubble to the chat list
  function appendMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}-message`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = parseMarkdown(text);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    timeSpan.textContent = `${hours}:${minutes}`;

    bubble.appendChild(contentDiv);
    bubble.appendChild(timeSpan);
    chatMessages.appendChild(bubble);
  }

  // Show/Hide Typing Indicator
  function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
  }

  function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
  }

  // Scroll Chat container to bottom
  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Simple Markdown Parser (Client-Side Safe)
  function parseMarkdown(text) {
    // 1. Escape HTML characters to prevent XSS injection
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // 2. Parse inline code block: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 3. Parse Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 4. Parse Italic: *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 5. Parse Markdown Links: [text](url) -> Escape target inside link safely
    // Relies on standard Markdown link structure
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 6. Handle lists and paragraphs
    const lines = html.split('\n');
    let inBulletList = false;
    let inNumberedList = false;
    const processedLines = [];

    for (let line of lines) {
      const trimmed = line.trim();

      // Bullet List Match
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inBulletList) {
          if (inNumberedList) {
            processedLines.push('</ol>');
            inNumberedList = false;
          }
          processedLines.push('<ul style="margin-left: 1.5rem; margin-bottom: 0.5rem;">');
          inBulletList = true;
        }
        // Extract content after bullet indicator
        const content = trimmed.substring(2).trim();
        processedLines.push(`<li>${content}</li>`);
      } 
      // Numbered List Match
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!inNumberedList) {
          if (inBulletList) {
            processedLines.push('</ul>');
            inBulletList = false;
          }
          processedLines.push('<ol style="margin-left: 1.5rem; margin-bottom: 0.5rem;">');
          inNumberedList = true;
        }
        // Extract content after number indicator
        const content = trimmed.replace(/^\d+\.\s/, '').trim();
        processedLines.push(`<li>${content}</li>`);
      } 
      // Blank lines or general text
      else {
        if (inBulletList) {
          processedLines.push('</ul>');
          inBulletList = false;
        }
        if (inNumberedList) {
          processedLines.push('</ol>');
          inNumberedList = false;
        }
        
        if (trimmed.length > 0) {
          processedLines.push(`<p style="margin-bottom: 0.5rem;">${line}</p>`);
        }
      }
    }

    // Close any dangling tags
    if (inBulletList) processedLines.push('</ul>');
    if (inNumberedList) processedLines.push('</ol>');

    return processedLines.join('\n');
  }
});
